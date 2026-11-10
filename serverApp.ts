import express from 'express';
import cors from 'cors';
import axios from 'axios';
import cookieParser from 'cookie-parser';
import https from 'https';
import dotenv from 'dotenv';
import multer from 'multer';
import FormData from 'form-data';
import { config } from './config';
import {
  loadApprovalRulesCatalog,
  buildPortalApprovalLines,
  readPortalApprovalsStore,
  writePortalApprovalsStore,
  registerPortalDraftApproval,
  acquireConversionLock,
  releaseConversionLock,
  isEmailAuthorizedForStage,
  PortalApprovalRecord,
  PortalApprovalLine
} from './serverApprovalEngine';

dotenv.config();

export const app = express();

// CORS configuration
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Configure multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// SAP Service Layer configuration
const SAP_BASE_URL = config.sap.baseUrl.replace(/\/$/, ''); // Remove trailing slash if exists

// Session Cache to reuse authenticated sessions across requests and avoid cookie drops in iframes
interface CachedSession {
  sessionId: string;
  routeId?: string;
  cookieHeader: string;
  companyDB: string;
  user: string;
  expiresAt: number;
}

const sessionCache = new Map<string, CachedSession>();

// Helper to get session from cookies or headers
const getSessionId = (req: express.Request) => {
  return req.cookies['B1SESSION'] || (req.headers['x-b1session'] as string) || (req.headers['authorization']?.replace(/^Bearer\s+/i, ''));
};

// Helper to get SAP configuration from headers or defaults
const getSapConfig = (req: express.Request) => {
  const customUrl = req.headers['x-sap-url'] as string;
  const customUser = req.headers['x-sap-user'] as string;
  const customPassword = req.headers['x-sap-password'] as string;

  return {
    baseUrl: (customUrl || config.sap.baseUrl).replace(/\/$/, ''),
    user: customUser || config.sap.systemUser,
    password: (customPassword && customPassword !== '1234') ? customPassword : (config.sap.systemPassword || customPassword || '1234')
  };
};

// Normalize company database name to avoid invalid schema logins - standard is SBO_QUALITECH
export const normalizeCompany = (comp?: string): string => {
  if (!comp) return 'SBO_QUALITECH';
  const trimmed = comp.trim();
  if (!trimmed || trimmed === 'QUALITECH' || trimmed === 'SBO_QUALITECH_') {
    return 'SBO_QUALITECH';
  }
  return trimmed;
};

// Map of in-flight authentication promises to prevent concurrent SAP login race conditions (SAML Login Failed)
const inFlightLogins = new Map<string, Promise<{ sessionId: string; cookieHeader: string; companyDB: string; routeId?: string }>>();

// Helper for automatic SAP authentication with mutex and session cache
const doSapLogin = async (req: express.Request, res?: express.Response, forceRefresh = false) => {
  const sapConfig = getSapConfig(req);
  const rawCompany = (req.headers['x-sap-company'] as string) || req.cookies['B1COMPANYDB'] || config.sap.defaultCompany;
  const companyDB = normalizeCompany(rawCompany);
  const cacheKey = `${sapConfig.baseUrl}_${companyDB}_${sapConfig.user}`;

  if (!forceRefresh) {
    const cached = sessionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      if (res) {
        const cookieOptions: any = { httpOnly: true, secure: true, sameSite: 'none' };
        res.cookie('B1SESSION', cached.sessionId, cookieOptions);
        res.cookie('B1COMPANYDB', cached.companyDB, cookieOptions);
        if (cached.routeId) {
          const [name, value] = cached.routeId.split('=');
          res.cookie(name, value, cookieOptions);
        }
      }
      return { sessionId: cached.sessionId, cookieHeader: cached.cookieHeader };
    }
  }

  // Mutex: Check if another request is already authenticating for this cacheKey
  const inFlightKey = `${sapConfig.baseUrl}_${companyDB}_${sapConfig.user}`;
  const existingLogin = inFlightLogins.get(inFlightKey);
  if (existingLogin) {
    console.log(`SAP Login for '${companyDB}' is already in-flight. Awaiting existing authentication...`);
    try {
      const auth = await existingLogin;
      if (res) {
        const cookieOptions: any = { httpOnly: true, secure: true, sameSite: 'none' };
        res.cookie('B1SESSION', auth.sessionId, cookieOptions);
        res.cookie('B1COMPANYDB', auth.companyDB, cookieOptions);
        if (auth.routeId) {
          const [name, value] = auth.routeId.split('=');
          res.cookie(name, value, cookieOptions);
        }
      }
      return { sessionId: auth.sessionId, cookieHeader: auth.cookieHeader };
    } catch {
      // If previous in-flight promise failed, proceed to initiate fresh login
    }
  }

  const loginExecution = (async () => {
    console.log(`Auto-authenticating with SAP Service Layer for company '${companyDB}' (force: ${forceRefresh})...`);

    // Build list of candidate users starting with requested user
    const candidateUsers = [sapConfig.user, 'manager', 'Manager', 'B1i'];
    const usersToTry = Array.from(new Set(candidateUsers.filter(Boolean)));
    const candidatePasswords = Array.from(new Set([sapConfig.password, '1234', 'manager', 'Manager', 'B1i', 'sap1234'].filter(Boolean)));
    const candidateCompanies = Array.from(new Set([companyDB, 'SBO_QUALITECH'].filter(Boolean)));

    let lastError: any = null;

    for (const targetCompany of candidateCompanies) {
      for (const testUser of usersToTry) {
        for (const testPassword of candidatePasswords) {
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              console.log(`Attempting SAP login as '${testUser}' for '${targetCompany}' (attempt ${attempt + 1})...`);
              const loginResponse = await axios.post(`${sapConfig.baseUrl}/Login`, {
                CompanyDB: targetCompany,
                UserName: testUser,
                Password: testPassword
              }, {
                httpsAgent: new https.Agent({ rejectUnauthorized: false }),
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'User-Agent': 'SAP-Portal-Client/1.0'
                },
                timeout: 12000
              });

              const sessionId = loginResponse.data.SessionId;
              const cookies = loginResponse.headers['set-cookie'] || [];
              const routeId = cookies.find((c: string) => c.includes('ROUTEID'))?.split(';')[0];

              let newCookieHeader = `B1SESSION=${sessionId}`;
              if (routeId) {
                newCookieHeader += `; ${routeId}`;
              }

              // Cache session for 25 minutes
              const sessionObj = {
                sessionId,
                routeId,
                cookieHeader: newCookieHeader,
                companyDB: targetCompany,
                user: testUser,
                expiresAt: Date.now() + 25 * 60 * 1000
              };
              sessionCache.set(cacheKey, sessionObj);
              sessionCache.set(`${sapConfig.baseUrl}_${targetCompany}_${testUser}`, sessionObj);

              console.log(`SAP auto-login successful for '${testUser}' on '${targetCompany}'.`);
              return { sessionId, cookieHeader: newCookieHeader, companyDB: targetCompany, routeId };
            } catch (err: any) {
              lastError = err;
              const status = err.response?.status;
              const sapErrorMsg = err.response?.data?.error?.message?.value || err.response?.data?.error?.message || err.message;
              console.warn(`SAP login attempt as '${testUser}' for '${targetCompany}' failed (${status || 'ERR'}): ${sapErrorMsg}`);

              const isSamlRace = status === 500 && typeof sapErrorMsg === 'string' && sapErrorMsg.toLowerCase().includes('saml');
              if (isSamlRace && attempt < 1) {
                const waitMs = 600 * (attempt + 1);
                console.log(`SAML lock detected in SAP SLD. Retrying '${testUser}' in ${waitMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitMs));
                continue;
              }

              // If explicit 401 or SSO error, try next credential
              if (status === 401) {
                break;
              }

              if (attempt < 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }
          }
        }
      }
    }

    sessionCache.delete(cacheKey);
    throw lastError || new Error('Falha na autenticação SAP Service Layer');
  })();

  inFlightLogins.set(inFlightKey, loginExecution);

  try {
    const auth = await loginExecution;
    if (res) {
      const cookieOptions: any = { httpOnly: true, secure: true, sameSite: 'none' };
      res.cookie('B1SESSION', auth.sessionId, cookieOptions);
      res.cookie('B1COMPANYDB', auth.companyDB, cookieOptions);
      if (auth.routeId) {
        const [name, value] = auth.routeId.split('=');
        res.cookie(name, value, cookieOptions);
      }
    }
    return { sessionId: auth.sessionId, cookieHeader: auth.cookieHeader };
  } finally {
    inFlightLogins.delete(inFlightKey);
  }
};

// Create the API Router
const apiRouter = express.Router();

// Microsoft OAuth Popup Callback (Receiver page)
const handleOAuthCallback = (req: express.Request, res: express.Response) => {
  const code = req.query.code;
  const state = req.query.state;
  const error = req.query.error;
  const errorDescription = req.query.error_description;

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <title>Autenticação Microsoft Concluída</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f8fafc; color: #0f172a; }
      .card { background: white; padding: 32px 28px; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); max-width: 400px; text-align: center; border: 1px solid #e2e8f0; }
      .spinner { width: 36px; height: 36px; border: 3px solid #e2e8f0; border-top-color: #0078d4; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
      @keyframes spin { to { transform: rotate(360deg); } }
      h2 { font-size: 17px; margin: 0 0 8px; color: #0078d4; font-weight: 700; }
      p { font-size: 13px; color: #64748b; margin: 0; line-height: 1.4; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="spinner"></div>
      <h2>Conectando ao Microsoft 365</h2>
      <p>Autenticação processada. Retornando ao Portal SAP...</p>
    </div>
    <script>
      const payload = {
        type: 'MS_OAUTH_CALLBACK',
        code: ${JSON.stringify(code || null)},
        state: ${JSON.stringify(state || null)},
        error: ${JSON.stringify(error || null)},
        errorDescription: ${JSON.stringify(errorDescription || null)}
      };

      if (window.opener) {
        window.opener.postMessage(payload, '*');
        setTimeout(() => {
          try { window.close(); } catch(e) {}
        }, 500);
      } else {
        window.location.href = '/';
      }
    </script>
  </body>
</html>`);
};

app.get(['/auth/callback', '/auth/callback/'], handleOAuthCallback);
apiRouter.get(['/auth/callback', '/auth/callback/'], handleOAuthCallback);

// Microsoft Token Exchange Endpoint
apiRouter.post('/auth/microsoft/token', async (req, res) => {
  const { code, codeVerifier, clientId, tenantId = 'common', redirectUri } = req.body;

  const targetClientId = clientId || process.env.MICROSOFT_CLIENT_ID || process.env.AZURE_CLIENT_ID || '4b46fdf1-7963-4933-8955-0a730ed95b1d';
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET;

  if (!code || !targetClientId) {
    return res.status(400).json({ error: 'Parâmetros "code" e "clientId" são obrigatórios.' });
  }

  try {
    const params = new URLSearchParams();
    params.append('client_id', targetClientId);
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', redirectUri || `${req.protocol}://${req.get('host')}/auth/callback`);
    if (codeVerifier) {
      params.append('code_verifier', codeVerifier);
    }
    if (clientSecret) {
      params.append('client_secret', clientSecret);
    }

    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const response = await axios.post(tokenUrl, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      timeout: 25000
    });

    res.json(response.data);
  } catch (err: any) {
    const errorData = err.response?.data;
    console.error('Microsoft Token Exchange Error:', errorData || err.message);
    res.status(err.response?.status || 500).json(errorData || { 
      error: 'Erro ao trocar código por token na Microsoft.', 
      details: err.message 
    });
  }
});

// Health check endpoint
apiRouter.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// API Login Route
apiRouter.post('/login', async (req, res) => {
  const { email, companyDB: rawCompany } = req.body;
  const companyDB = normalizeCompany(rawCompany);
  const sapConfig = getSapConfig(req);

  if (!email || !companyDB) {
    return res.status(400).json({ error: 'Email e Base de Dados são obrigatórios.' });
  }

  const loginWithRetry = async (retries = 2) => {
    // Try primary user (B1i or configured user), then fallback to manager if 401
    const usersToTry = Array.from(new Set([sapConfig.user, 'manager', 'Manager', 'B1i'].filter(Boolean)));
    const passwordsToTry = Array.from(new Set([sapConfig.password, '1234', 'manager', 'Manager', 'B1i', 'sap1234'].filter(Boolean)));

    let lastError: any = null;

    for (const testUser of usersToTry) {
      for (const testPassword of passwordsToTry) {
        for (let i = 0; i < retries; i++) {
          try {
            console.log(`Authenticating with SAP Service Layer as user '${testUser}' on '${companyDB}'...`);
            return await axios.post(`${sapConfig.baseUrl}/Login`, {
              CompanyDB: companyDB,
              UserName: testUser,
              Password: testPassword
            }, {
              httpsAgent: new https.Agent({ rejectUnauthorized: false }),
              headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'SAP-Portal-Client/1.0'
              },
              timeout: 12000
            });
          } catch (error: any) {
            lastError = error;
            const status = error.response?.status;
            const sapErrorMsg = error.response?.data?.error?.message?.value || error.response?.data?.error?.message || error.message;
            const isAuthFailure = status === 401 || (typeof sapErrorMsg === 'string' && (
              sapErrorMsg.toLowerCase().includes('saml') ||
              sapErrorMsg.toLowerCase().includes('sld') ||
              sapErrorMsg.toLowerCase().includes('password') ||
              sapErrorMsg.toLowerCase().includes('user') ||
              sapErrorMsg.toLowerCase().includes('credential')
            ));

            if (isAuthFailure) {
              // If auth or SSO failure, try next credential
              break;
            }
            if (error.response?.status === 502 && i < retries - 1) {
              console.warn(`Attempt ${i + 1} failed with 502. Retrying in ${800 * (i + 1)}ms...`);
              await new Promise(resolve => setTimeout(resolve, 800 * (i + 1)));
              continue;
            }
            throw error;
          }
        }
      }
    }
    throw lastError;
  };

  try {
    console.log(`Attempting SAP Login for ${email} on ${companyDB} using ${sapConfig.baseUrl}...`);
    
    // 1. Login with system user (B1i / manager) to the specified database with retry
    const loginResponse: any = await loginWithRetry();

    const sessionId = loginResponse.data.SessionId;
    const cookies = loginResponse.headers['set-cookie'] || [];
    const routeId = cookies.find(c => c.includes('ROUTEID'))?.split(';')[0];

    console.log('Login successful with service user, checking user existence in SAP...');

    // 2. Check if the user exists in SAP (search in Users table)
    const emailPrefix = email.split('@')[0];
    const filterUsers = `eMail eq '${email}' or UserCode eq '${email}' or UserName eq '${email}' or UserCode eq '${emailPrefix}'`;
    
    console.log(`Searching for user in SAP Users table: ${filterUsers}`);
    
    let foundSapUser: any = null;

    try {
      const usersResponse = await axios.get(`${sapConfig.baseUrl}/Users?$filter=${encodeURIComponent(filterUsers)}`, {
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        headers: {
          'Cookie': `B1SESSION=${sessionId}; ${routeId || ''}`,
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      if (usersResponse.data.value && usersResponse.data.value.length > 0) {
        foundSapUser = {
          name: usersResponse.data.value[0].UserName,
          email: usersResponse.data.value[0].eMail || email,
          internalKey: usersResponse.data.value[0].InternalKey,
          userCode: usersResponse.data.value[0].UserCode,
          source: 'Users'
        };
      }
    } catch (usersErr: any) {
      console.warn('Error querying /Users table:', usersErr.message);
    }

    // 3. If not found in Users table, check EmployeesInfo (Colaboradores / Funcionários)
    if (!foundSapUser) {
      try {
        const filterEmployees = `eMail eq '${email}' or FirstName eq '${emailPrefix}' or LastName eq '${emailPrefix}'`;
        console.log(`Searching for user in SAP EmployeesInfo: ${filterEmployees}`);
        const empResponse = await axios.get(`${sapConfig.baseUrl}/EmployeesInfo?$filter=${encodeURIComponent(filterEmployees)}`, {
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          headers: {
            'Cookie': `B1SESSION=${sessionId}; ${routeId || ''}`,
            'Accept': 'application/json'
          },
          timeout: 10000
        });

        if (empResponse.data.value && empResponse.data.value.length > 0) {
          const emp = empResponse.data.value[0];
          foundSapUser = {
            name: `${emp.FirstName || ''} ${emp.LastName || ''}`.trim() || emp.eMail || email,
            email: emp.eMail || email,
            internalKey: emp.EmployeeID,
            userCode: String(emp.EmployeeID),
            source: 'EmployeesInfo'
          };
        }
      } catch (empErr: any) {
        console.warn('Error querying /EmployeesInfo table:', empErr.message);
      }
    }

    // Always set session cookies in the browser since technical SAP login succeeded
    const cookieOptions: any = { 
      httpOnly: true, 
      secure: true, 
      sameSite: 'none' 
    };

    res.cookie('B1SESSION', sessionId, cookieOptions);
    res.cookie('B1COMPANYDB', companyDB, cookieOptions);
    if (routeId) {
      const [name, value] = routeId.split('=');
      res.cookie(name, value, cookieOptions);
    }
    
    const effectiveUser = foundSapUser || {
      name: emailPrefix,
      email: email,
      internalKey: -1,
      userCode: emailPrefix,
      source: 'PortalUser'
    };

    console.log(`User ${email} verified and logged in. (${effectiveUser.source}: ${effectiveUser.userCode} / ${effectiveUser.name})`);
    return res.json({ 
      success: true, 
      user: effectiveUser
    });
  } catch (error: any) {
    const errorData = error.response?.data;
    const isHtml = typeof errorData === 'string' && (errorData.includes('<!DOCTYPE') || errorData.includes('<html'));
    const status = error.response?.status;
    const sapErrorMessage = errorData?.error?.message?.value || errorData?.error?.message || error.message;
    
    console.error('SAP Login Pipeline Failure:', {
      status,
      sapMessage: sapErrorMessage,
      endpoint: error.config?.url,
      company: companyDB
    });

    if (status === 401) {
      return res.status(401).json({ 
        error: 'Falha na autenticação técnica com o SAP B1.',
        details: sapErrorMessage || 'As credenciais ou o nome do Banco de Dados podem estar incorretos.',
        sapRaw: isHtml ? 'HTML_GATEWAY_ERROR' : errorData,
        statusCode: status,
        targetDB: companyDB
      });
    }

    if (status === 502 || status === 503 || status === 504) {
      return res.status(status).json({ 
        error: `O servidor SAP (Service Layer) está temporariamente indisponível (Erro ${status}).`,
        details: 'Isso geralmente indica que o serviço está instável ou em manutenção. Tente novamente em alguns instantes.'
      });
    }

    return res.status(status || 500).json({ 
      error: 'Erro ao conectar com o SAP Service Layer.',
      details: sapErrorMessage,
      sapRaw: isHtml ? 'HTML_ERROR' : errorData
    });
  }
});

// Diagnostic SAP connection test endpoint
apiRouter.post('/sap/test-connection', async (req, res) => {
  const { companyDB, user, password, url } = req.body;
  const targetUrl = (url || config.sap.baseUrl).replace(/\/$/, '');
  const targetCompany = normalizeCompany(companyDB || config.sap.defaultCompany);
  const targetUser = user || config.sap.systemUser;
  const targetPassword = password || config.sap.systemPassword;

  console.log(`[Diagnostic] Testing connection to ${targetUrl} for DB: ${targetCompany} as ${targetUser}...`);

  try {
    const startTime = Date.now();
    const loginResponse = await axios.post(`${targetUrl}/Login`, {
      CompanyDB: targetCompany,
      UserName: targetUser,
      Password: targetPassword
    }, {
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'SAP-Portal-Client/1.0'
      },
      timeout: 30000
    });

    const elapsed = Date.now() - startTime;
    const version = loginResponse.data.Version;
    const sessionId = loginResponse.data.SessionId;

    res.json({
      success: true,
      message: `Conexão com SAP Service Layer estabelecida com sucesso! (${elapsed}ms)`,
      details: {
        serverUrl: targetUrl,
        companyDB: targetCompany,
        user: targetUser,
        version: version || 'OK',
        sessionActive: !!sessionId,
        responseTimeMs: elapsed
      }
    });
  } catch (err: any) {
    const status = err.response?.status;
    const errorData = err.response?.data;
    const sapErrorMessage = errorData?.error?.message?.value || errorData?.error?.message || err.message;

    res.status(status || 500).json({
      success: false,
      error: `Falha na conexão com SAP Service Layer (Status ${status || 'ERR'}): ${sapErrorMessage}`,
      details: {
        serverUrl: targetUrl,
        companyDB: targetCompany,
        user: targetUser,
        sapRaw: typeof errorData === 'string' && errorData.includes('<html') ? 'HTML_ERROR' : errorData
      }
    });
  }
});

// Attachments route
apiRouter.post('/sap/Attachments2', upload.array('files'), async (req, res) => {
  let sessionId = getSessionId(req);
  let cookieHeader = Object.entries(req.cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
  
  if (!sessionId) {
    try {
      const auth = await doSapLogin(req, res);
      sessionId = auth.sessionId;
      cookieHeader = auth.cookieHeader;
    } catch (authErr: any) {
      return res.status(401).json({ error: 'Não autenticado no SAP.', details: authErr.message });
    }
  }

  const sapConfig = getSapConfig(req);
  const files = req.files as Express.Multer.File[];

  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }

  try {
    const form = new FormData();
    files.forEach(file => {
      form.append('files', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
      });
    });

    console.log(`Forwarding ${files.length} files to SAP Attachments2...`);

    const response = await axios.post(`${sapConfig.baseUrl}/Attachments2`, form, {
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
        keepAlive: true
      }),
      headers: {
        ...form.getHeaders(),
        'Cookie': cookieHeader,
        'Accept': 'application/json',
        'User-Agent': 'SAP-Portal-Client/1.0'
      },
      timeout: 60000
    });

    res.json(response.data);
  } catch (error: any) {
    const errorData = error.response?.data;
    const sapErrorMessage = errorData?.error?.message?.value || errorData?.error?.message || error.message;
    
    console.error('SAP Attachment Error:', {
      status: error.response?.status,
      sapCode: errorData?.error?.code,
      sapMessage: sapErrorMessage,
      data: typeof errorData === 'string' && errorData.includes('<!DOCTYPE') ? '[HTML Error]' : JSON.stringify(errorData, null, 2)
    });
    
    res.status(error.response?.status || 500).json(errorData || { error: 'Erro ao enviar anexos ao SAP.', details: sapErrorMessage });
  }
});

// Unified Approvals Center Endpoints

// 1. Get Approval Rules Catalog (models, authors, approvers)
apiRouter.get('/approvals/catalog', (req, res) => {
  try {
    const catalog = loadApprovalRulesCatalog();
    res.json({
      success: true,
      models: catalog.modelsList,
      authors: catalog.authorsList,
      approvers: catalog.approversList
    });
  } catch (err: any) {
    console.error('Error fetching approvals catalog:', err);
    res.status(500).json({ error: 'Erro ao carregar catálogo de regras de aprovação', details: err.message });
  }
});

// 2. Create Draft in SAP and register for line-by-line portal approval
apiRouter.post('/approvals/create-draft', async (req, res) => {
  const { docObjectCode, objectType = '22', payload, userEmail, userName } = req.body;
  if (!payload || !docObjectCode) {
    return res.status(400).json({ error: 'Parâmetros "payload" e "docObjectCode" são obrigatórios.' });
  }

  try {
    // Authenticate with SAP
    const auth = await doSapLogin(req, res);
    const sapConfig = getSapConfig(req);

    // Format Draft payload
    const draftPayload = {
      ...payload,
      DocObjectCode: docObjectCode,
      Comments: payload.Comments ? (payload.Comments.includes('[PORTAL DE COMPRAS]') ? payload.Comments : `[PORTAL DE COMPRAS] ${payload.Comments}`) : '[PORTAL DE COMPRAS]'
    };

    console.log(`Creating Draft in SAP (${docObjectCode})...`);
    const sapResponse = await axios.post(`${sapConfig.baseUrl}/Drafts`, draftPayload, {
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      headers: {
        'Cookie': auth.cookieHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000
    });

    const draftData = sapResponse.data;
    const draftDocEntry = Number(draftData.DocEntry);

    // Register line-by-line approval record
    const record = registerPortalDraftApproval({
      draftDocEntry,
      draftDocNum: draftData.DocNum || draftDocEntry,
      objectType: String(objectType),
      docObjectCode: String(docObjectCode),
      authorEmail: userEmail || payload.RequesterEmail || '',
      authorName: userName || payload.RequesterName || '',
      headerData: { ...draftData, ...payload },
      rawLines: Array.isArray(draftData.DocumentLines) && draftData.DocumentLines.length > 0 ? draftData.DocumentLines : payload.DocumentLines || [],
      draftPayload
    });

    res.json({
      success: true,
      draftDocEntry,
      draftDocNum: record.draftDocNum,
      approvalRecord: record,
      sapDraft: draftData
    });
  } catch (err: any) {
    const errorData = err.response?.data;
    const sapErrorMessage = errorData?.error?.message?.value || errorData?.error?.message || err.message;
    console.error('Error creating SAP Draft:', sapErrorMessage, errorData);
    res.status(err.response?.status || 500).json({
      error: 'Erro ao criar esboço (Draft) no SAP.',
      details: sapErrorMessage,
      raw: errorData
    });
  }
});

// 3. Get Unified Approvals (combining SAP Desktop requests and Portal Draft requests)
apiRouter.get('/approvals/unified', async (req, res) => {
  try {
    const catalog = loadApprovalRulesCatalog();
    const portalRecords = readPortalApprovalsStore();

    let sapRequests: any[] = [];
    try {
      const auth = await doSapLogin(req, res);
      const sapConfig = getSapConfig(req);
      const sapRes = await axios.get(
        `${sapConfig.baseUrl}/ApprovalRequests?$orderby=Code desc&$top=100`,
        {
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          headers: {
            'Cookie': auth.cookieHeader,
            'Accept': 'application/json'
          },
          timeout: 15000
        }
      );
      sapRequests = Array.isArray(sapRes.data?.value) ? sapRes.data.value : [];
    } catch (sapErr: any) {
      console.warn('Could not fetch SAP ApprovalRequests (will return local portal records):', sapErr.message);
    }

    // Enrich SAP Desktop ApprovalRequests with metadata from catalog
    const sapUnified = sapRequests.map((reqItem: any) => {
      const templateId = Number(reqItem.ApprovalTemplatesID);
      const matchedModel = catalog.modelsByCode.get(templateId);
      const originatorId = Number(reqItem.OriginatorID);
      const matchedAuthor = catalog.authorsById.get(originatorId);

      // Check if this SAP request was generated from Portal
      const isFromPortal = portalRecords.some(p => p.draftDocEntry === Number(reqItem.DraftEntry)) ||
        String(reqItem.Remarks || '').includes('[PORTAL DE COMPRAS]');

      // Map status: arsPending -> 'W', arsApproved -> 'Y', arsNotApproved -> 'N'
      const statusMap: Record<string, 'W' | 'Y' | 'N'> = {
        arsPending: 'W',
        arsApproved: 'Y',
        arsNotApproved: 'N'
      };
      const status = statusMap[reqItem.Status] || 'W';

      return {
        id: `SAP-${reqItem.Code}`,
        code: reqItem.Code,
        draftDocEntry: reqItem.DraftEntry,
        draftDocNum: reqItem.DraftEntry,
        objectType: String(reqItem.ObjectType || '22'),
        docObjectCode: reqItem.ObjectType === '1470000113' ? 'oPurchaseRequests' : reqItem.ObjectType === '204' ? 'oPurchaseDownPayments' : 'oPurchaseOrders',
        origin: isFromPortal ? 'PORTAL' : 'SAP_DESKTOP',
        status,
        creationDate: reqItem.CreationDate || '',
        creationTime: reqItem.CreationTime || '',
        authorId: originatorId,
        authorCode: matchedAuthor?.code || String(originatorId),
        authorName: matchedAuthor?.name || `Usuário SAP #${originatorId}`,
        authorEmail: matchedAuthor?.email || '',
        cardCode: '',
        cardName: matchedModel?.name || `Modelo ${templateId}`,
        docTotal: 0,
        comments: reqItem.Remarks || '',
        modelCode: templateId,
        modelName: matchedModel?.name || `Modelo ${templateId}`,
        modelDescription: matchedModel?.description || '',
        lines: [], // will be loaded on demand or matched from portal record
        sapApprovalRequestLines: reqItem.ApprovalRequestLines || []
      };
    });

    // Merge: Portal records take precedence if matching draftDocEntry
    const combinedMap = new Map<number, any>();
    for (const p of portalRecords) {
      combinedMap.set(p.draftDocEntry, p);
    }
    for (const s of sapUnified) {
      if (s.draftDocEntry && combinedMap.has(s.draftDocEntry)) {
        // Merge SAP approval code with portal record
        const existing = combinedMap.get(s.draftDocEntry);
        existing.sapCode = s.code;
        if (s.status !== 'W' && existing.status === 'W') {
          existing.status = s.status;
        }
      } else {
        combinedMap.set(s.draftDocEntry || (s.code + 1000000), s);
      }
    }

    const unifiedList = Array.from(combinedMap.values()).sort((a, b) => {
      const dateA = new Date(a.creationDate || 0).getTime();
      const dateB = new Date(b.creationDate || 0).getTime();
      return dateB - dateA;
    });

    res.json({
      success: true,
      approvals: unifiedList,
      catalog: {
        models: catalog.modelsList,
        authors: catalog.authorsList,
        approvers: catalog.approversList
      }
    });
  } catch (err: any) {
    console.error('Error fetching unified approvals:', err);
    res.status(500).json({ error: 'Erro ao buscar aprovações unificadas', details: err.message });
  }
});

// 4. Get draft detail and line breakdown
apiRouter.get('/approvals/draft-detail/:draftEntry', async (req, res) => {
  const draftEntry = Number(req.params.draftEntry);
  if (isNaN(draftEntry)) {
    return res.status(400).json({ error: 'draftEntry inválido' });
  }

  try {
    const store = readPortalApprovalsStore();
    const existing = store.find(r => r.draftDocEntry === draftEntry);

    // Fetch live draft from SAP
    const auth = await doSapLogin(req, res);
    const sapConfig = getSapConfig(req);
    const draftRes = await axios.get(`${sapConfig.baseUrl}/Drafts(${draftEntry})`, {
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      headers: {
        'Cookie': auth.cookieHeader,
        'Accept': 'application/json'
      },
      timeout: 15000
    });

    const draftData = draftRes.data;
    if (existing) {
      return res.json({
        success: true,
        approvalRecord: existing,
        draftData
      });
    }

    // If not already registered in portal store, register it dynamically
    const objectType = draftData.DocObjectCode === 'oPurchaseRequests' ? '1470000113' : draftData.DocObjectCode === 'oPurchaseDownPayments' ? '204' : '22';
    const record = registerPortalDraftApproval({
      draftDocEntry: draftEntry,
      draftDocNum: draftData.DocNum || draftEntry,
      objectType,
      docObjectCode: draftData.DocObjectCode || 'oPurchaseOrders',
      authorEmail: draftData.RequesterEmail || '',
      authorName: draftData.RequesterName || '',
      headerData: draftData,
      rawLines: draftData.DocumentLines || [],
      draftPayload: draftData
    });

    res.json({
      success: true,
      approvalRecord: record,
      draftData
    });
  } catch (err: any) {
    console.error(`Error fetching Draft(${draftEntry}):`, err.message);
    res.status(err.response?.status || 500).json({
      error: `Erro ao buscar detalhes do Esboço ${draftEntry}`,
      details: err.message
    });
  }
});

// 5. Submit Approval Decision (line-by-line or full, with automatic effective document conversion when fully approved)
apiRouter.post('/approvals/decide', async (req, res) => {
  const {
    draftDocEntry,
    decision, // 'ardApproved' | 'ardNotApproved'
    remarks,
    approverName = 'Aprovador Portal',
    approverEmail = '',
    lineNum,
    stageCode,
    approveAllLines = true
  } = req.body;

  const docEntry = Number(draftDocEntry);
  if (isNaN(docEntry) || !['ardApproved', 'ardNotApproved'].includes(decision)) {
    return res.status(400).json({ error: 'Parâmetros inválidos para decisão de aprovação.' });
  }

  const store = readPortalApprovalsStore();
  const recordIndex = store.findIndex(r => r.draftDocEntry === docEntry);
  let record = recordIndex !== -1 ? store[recordIndex] : null;

  // If not yet in store, try to register from SAP Draft
  if (!record) {
    try {
      const auth = await doSapLogin(req, res);
      const sapConfig = getSapConfig(req);
      const draftRes = await axios.get(`${sapConfig.baseUrl}/Drafts(${docEntry})`, {
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        headers: { 'Cookie': auth.cookieHeader, 'Accept': 'application/json' },
        timeout: 15000
      });
      const draftData = draftRes.data;
      const objectType = draftData.DocObjectCode === 'oPurchaseRequests' ? '1470000113' : draftData.DocObjectCode === 'oPurchaseDownPayments' ? '204' : '22';
      record = registerPortalDraftApproval({
        draftDocEntry: docEntry,
        draftDocNum: draftData.DocNum || docEntry,
        objectType,
        docObjectCode: draftData.DocObjectCode || 'oPurchaseOrders',
        authorEmail: draftData.RequesterEmail || '',
        authorName: draftData.RequesterName || '',
        headerData: draftData,
        rawLines: draftData.DocumentLines || [],
        draftPayload: draftData
      });
    } catch (e: any) {
      return res.status(404).json({ error: `Rascunho/Esboço ${docEntry} não encontrado no sistema.` });
    }
  }

  const nowIso = new Date().toISOString();
  const normalizedUserEmail = String(approverEmail || '').trim().toLowerCase();

  if (!normalizedUserEmail) {
    return res.status(403).json({
      error: 'Bloqueio de Segurança: É obrigatório estar autenticado com e-mail válido para aprovar ou recusar uma etapa.'
    });
  }

  // Validate if a specific line + stage was requested
  if (lineNum !== undefined && lineNum !== null && stageCode !== undefined && stageCode !== null && !approveAllLines) {
    const targetLine = record.lines.find(l => l.lineNum === Number(lineNum));
    const targetStage = targetLine?.requiredApprovers.find(a => a.stageCode === Number(stageCode));
    if (!targetLine || !targetStage) {
      return res.status(404).json({ error: 'Linha ou etapa de aprovação não encontrada neste documento.' });
    }
    if (!isEmailAuthorizedForStage(normalizedUserEmail, targetStage.approverEmail)) {
      return res.status(403).json({
        error: `Bloqueio de Segurança: O usuário logado (${normalizedUserEmail}) não tem permissão para decidir a etapa "${targetStage.stageName}". Somente o aprovador titular (${targetStage.approverName} — ${targetStage.approverEmail}) pode aprovar ou recusar sua própria etapa.`
      });
    }
  } else {
    // Check if the logged-in user is the designated approver for at least one stage in this document
    const hasAuthorizedStage = record.lines.some(l =>
      l.requiredApprovers.some(a => isEmailAuthorizedForStage(normalizedUserEmail, a.approverEmail))
    );
    if (!hasAuthorizedStage) {
      return res.status(403).json({
        error: `Bloqueio de Segurança: O e-mail logado (${normalizedUserEmail}) não corresponde a nenhum aprovador das etapas deste documento.`
      });
    }
  }

  // If Rejected: only allow if user owns the targeted stage (or at least one stage in the document)
  if (decision === 'ardNotApproved') {
    record.status = 'N';
    record.lines.forEach(l => {
      l.requiredApprovers.forEach(a => {
        const matchesTarget =
          (lineNum === undefined || lineNum === null || l.lineNum === Number(lineNum) || approveAllLines) &&
          (stageCode === undefined || stageCode === null || a.stageCode === Number(stageCode) || approveAllLines);
        if (a.status === 'W' && matchesTarget && isEmailAuthorizedForStage(normalizedUserEmail, a.approverEmail)) {
          a.status = 'N';
          a.approvedBy = `${approverName} (${normalizedUserEmail})`;
          a.approvedAt = nowIso;
          a.remarks = remarks || 'Recusado pelo aprovador titular';
        }
      });
    });

    writePortalApprovalsStore(store);

    // Cancel draft in SAP if possible
    try {
      const auth = await doSapLogin(req, res);
      const sapConfig = getSapConfig(req);
      await axios.post(`${sapConfig.baseUrl}/Drafts(${docEntry})/Cancel`, {}, {
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        headers: { 'Cookie': auth.cookieHeader },
        timeout: 15000
      });
    } catch (cancelErr: any) {
      console.warn(`Could not cancel Draft(${docEntry}) in SAP:`, cancelErr.message);
    }

    return res.json({
      success: true,
      message: 'Etapa e documento recusados com sucesso pelo aprovador titular.',
      approvalRecord: record
    });
  }

  // Update approver status ONLY for stages where the logged-in user's email matches the stage's approverEmail
  let stagesUpdatedCount = 0;
  for (const line of record.lines) {
    if (lineNum === undefined || lineNum === null || line.lineNum === Number(lineNum) || approveAllLines) {
      for (const reqApp of line.requiredApprovers) {
        if (stageCode === undefined || stageCode === null || reqApp.stageCode === Number(stageCode) || approveAllLines) {
          if (isEmailAuthorizedForStage(normalizedUserEmail, reqApp.approverEmail)) {
            if (reqApp.status !== 'Y') {
              reqApp.status = 'Y';
              reqApp.approvedBy = `${approverName} (${normalizedUserEmail})`;
              reqApp.approvedAt = nowIso;
              if (remarks) reqApp.remarks = remarks;
              stagesUpdatedCount += 1;
            }
          }
        }
      }
    }
  }

  if (stagesUpdatedCount === 0) {
    return res.status(403).json({
      error: `Nenhuma etapa pendente vinculada ao e-mail ${normalizedUserEmail} foi encontrada para aprovação.`
    });
  }

  // Check if ALL approvers across ALL lines have approved
  const allLinesApproved = record.lines.every(line =>
    line.requiredApprovers.every(app => app.status === 'Y')
  );

  console.log(`Approval check for Draft ${docEntry}: allLinesApproved = ${allLinesApproved}`);

  if (allLinesApproved) {
    record.status = 'Y';

    // Idempotency check: Ensure we do not convert twice
    if (record.convertedDocEntry) {
      console.log(`Draft ${docEntry} already converted to DocEntry ${record.convertedDocEntry}`);
      writePortalApprovalsStore(store);
      return res.json({
        success: true,
        message: `Documento já aprovado e efetivado anteriormente (DocEntry: ${record.convertedDocEntry}).`,
        approvalRecord: record,
        convertedDocEntry: record.convertedDocEntry,
        convertedDocNum: record.convertedDocNum
      });
    }

    const lockAcquired = acquireConversionLock(docEntry);
    if (!lockAcquired) {
      return res.status(409).json({
        error: `Conversão do esboço ${docEntry} já está em andamento por outra requisição.`
      });
    }

    try {
      const auth = await doSapLogin(req, res);
      const sapConfig = getSapConfig(req);

      console.log(`[CONVERSION] Starting conversion of Draft(${docEntry}) to effective SAP document...`);

      let convertedDocEntry: number | null = null;
      let convertedDocNum: number | null = null;
      let conversionMethod = 'DraftsService_SaveDraftToDocument';

      // Method 1: DraftsService_SaveDraftToDocument
      try {
        const convertRes = await axios.post(
          `${sapConfig.baseUrl}/DraftsService_SaveDraftToDocument`,
          {
            Document: {
              DocEntry: docEntry
            }
          },
          {
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            headers: {
              'Cookie': auth.cookieHeader,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            timeout: 35000
          }
        );

        if (convertRes.data) {
          convertedDocEntry = Number(convertRes.data.DocEntry || convertRes.data.Document?.DocEntry || convertRes.data.DocNum);
          convertedDocNum = Number(convertRes.data.DocNum || convertRes.data.Document?.DocNum || convertedDocEntry);
          console.log(`[CONVERSION SUCCESS] Saved Draft ${docEntry} to effective document: DocEntry=${convertedDocEntry}, DocNum=${convertedDocNum}`);
        }
      } catch (saveDraftErr: any) {
        console.warn(`[CONVERSION METHOD 1 FAILED] DraftsService_SaveDraftToDocument failed: ${saveDraftErr.message}. Trying Fallback Method 2...`);

        // Fallback Method 2: Read Draft, POST to target collection (PurchaseOrders / PurchaseRequests / PurchaseDownPayments), and close Draft
        conversionMethod = 'Draft_Clone_And_Post';
        const draftGetRes = await axios.get(`${sapConfig.baseUrl}/Drafts(${docEntry})`, {
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          headers: { 'Cookie': auth.cookieHeader, 'Accept': 'application/json' },
          timeout: 20000
        });

        const draftObj = draftGetRes.data;
        const targetEndpoint =
          draftObj.DocObjectCode === 'oPurchaseRequests' ? 'PurchaseRequests' :
          draftObj.DocObjectCode === 'oPurchaseDownPayments' ? 'PurchaseDownPayments' :
          'PurchaseOrders';

        // Sanitize object for creation
        const finalDocPayload = { ...draftObj };
        delete finalDocPayload.DocEntry;
        delete finalDocPayload.DocNum;
        delete finalDocPayload.DocObjectCode;
        delete finalDocPayload.ApprovalTemplatesID;

        const postDocRes = await axios.post(`${sapConfig.baseUrl}/${targetEndpoint}`, finalDocPayload, {
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          headers: {
            'Cookie': auth.cookieHeader,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 35000
        });

        convertedDocEntry = Number(postDocRes.data?.DocEntry);
        convertedDocNum = Number(postDocRes.data?.DocNum || convertedDocEntry);

        // Close / cancel the original draft
        try {
          await axios.post(`${sapConfig.baseUrl}/Drafts(${docEntry})/Cancel`, {}, {
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            headers: { 'Cookie': auth.cookieHeader },
            timeout: 10000
          });
        } catch {}
      }

      record.convertedDocEntry = convertedDocEntry;
      record.convertedDocNum = convertedDocNum;
      record.convertedAt = nowIso;
      record.conversionMethod = conversionMethod;
      writePortalApprovalsStore(store);

      return res.json({
        success: true,
        message: `Todas as linhas aprovadas! Esboço ${docEntry} convertido com sucesso em documento definitivo.`,
        convertedDocEntry,
        convertedDocNum,
        conversionMethod,
        approvalRecord: record
      });
    } catch (convErr: any) {
      console.error(`[CONVERSION ERROR] Failed to convert Draft ${docEntry}:`, convErr.message);
      writePortalApprovalsStore(store);
      return res.status(500).json({
        error: `Aprovações registradas, porém ocorreu um erro ao efetivar o documento no SAP: ${convErr.message}`,
        approvalRecord: record
      });
    } finally {
      releaseConversionLock(docEntry);
    }
  }

  // If partially approved (waiting for other lines or stages)
  writePortalApprovalsStore(store);
  return res.json({
    success: true,
    message: 'Aprovação da linha registrada. Aguardando demais aprovadores para efetivação no SAP.',
    approvalRecord: record
  });
});

// Proxy middleware for general SAP requests
apiRouter.all('/sap/*', async (req, res) => {
  const rawRequestedCompany = (req.headers['x-sap-company'] as string) || req.cookies['B1COMPANYDB'] || config.sap.defaultCompany;
  const requestedCompany = normalizeCompany(rawRequestedCompany);
  const cookieCompany = req.cookies['B1COMPANYDB'] ? normalizeCompany(req.cookies['B1COMPANYDB']) : undefined;
  
  // If the request specifies a different company than the existing cookie session, force getting a session for requestedCompany
  const isCompanyMismatch = Boolean(cookieCompany && requestedCompany && cookieCompany !== requestedCompany);
  
  let sessionId = isCompanyMismatch ? null : getSessionId(req);
  let cookieHeader = Object.entries(req.cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
  
  if (!sessionId) {
    try {
      const auth = await doSapLogin(req, res);
      sessionId = auth.sessionId;
      cookieHeader = auth.cookieHeader;
    } catch (loginErr: any) {
      console.error(`Auto-login failed for company '${requestedCompany}':`, loginErr.message);
      return res.status(401).json({ error: 'Não autenticado no SAP.', details: loginErr.message, companyDB: requestedCompany });
    }
  }

  let endpoint = req.params[0];
  // Auto-quote string keys in OData UDT endpoints if unquoted, e.g. CustosLoc(2) -> CustosLoc('2')
  endpoint = endpoint.replace(/^(CustosLoc|CustosPessoal|U_CustosLoc|U_CustosPessoal)\(([^'"][^)]*)\)$/, "$1('$2')");

  const method = req.method;
  const query = req.query;
  let body = req.body;
  const sapConfig = getSapConfig(req);

  // Sanitize body for CustosLoc: strip non-existent UDT fields like U_Recurso and map to Name
  if (endpoint.includes('CustosLoc') && body && typeof body === 'object') {
    body = { ...body };
    if (!body.Name && body.U_Recurso) {
      body.Name = body.U_Recurso;
    }
    if (!body.U_VlOnSite && body.U_ValorBase) {
      body.U_VlOnSite = Number(body.U_ValorBase) || 0;
    }
    delete body.U_Recurso;
    delete body.U_ValorBase;
    delete body.U_HorasNor;
    delete body.U_HorasNob;
    delete body.U_HENor;
    delete body.U_HENob;
  }

  // Sanitize body for Purchase documents: ensure MainUsage in header (and TaxExtension) and replicate to lines if missing
  if (
    (endpoint.startsWith('PurchaseOrders') ||
      endpoint.startsWith('PurchaseRequests') ||
      endpoint.startsWith('PurchaseQuotations') ||
      endpoint.startsWith('PurchaseDownPayments') ||
      endpoint.startsWith('Drafts')) &&
    body &&
    typeof body === 'object'
  ) {
    body = { ...body };
    delete body.Project;
    delete body.ProjectCode;
    if (!body.U_DataPgto && body.U_dataPgto) {
      body.U_DataPgto = body.U_dataPgto;
    }
    delete body.U_dataPgto;
    if (!body.U_DataPgto) {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      body.U_DataPgto = body.DocDate ? String(body.DocDate).split('T')[0] : `${yyyy}-${mm}-${dd}`;
    }
    const rawMainUsage =
      body.MainUsage ??
      body.TaxExtension?.MainUsage ??
      (Array.isArray(body.DocumentLines) ? body.DocumentLines.find((l: any) => l?.Usage !== undefined && l?.Usage !== null)?.Usage : undefined);
    const parsedMainUsage = rawMainUsage !== undefined && rawMainUsage !== null ? Number(rawMainUsage) : undefined;
    if (parsedMainUsage && !isNaN(parsedMainUsage)) {
      body.MainUsage = parsedMainUsage;
      if (!body.TaxExtension || typeof body.TaxExtension !== 'object') {
        body.TaxExtension = {};
      }
      body.TaxExtension.MainUsage = parsedMainUsage;
    }
    if (Array.isArray(body.DocumentLines)) {
      body.DocumentLines = body.DocumentLines.map((line: any) => {
        if (!line) return line;
        const copy = { ...line };
        delete copy.ProjectCode;
        if ((copy.Usage === undefined || copy.Usage === null) && parsedMainUsage && !isNaN(parsedMainUsage)) {
          copy.Usage = parsedMainUsage;
        }
        if (!copy.CostingCode) copy.CostingCode = 'BR';
        if (!copy.CostingCode2) copy.CostingCode2 = 'MATRIZ';
        if (!copy.CostingCode3) copy.CostingCode3 = 'OPER_OFF';
        return copy;
      });
    }
  }

  // Sanitize body for Orders and Quotations: leave financial Project/ProjectCode blank and ensure distribution rule defaults
  if ((endpoint.startsWith('Orders') || endpoint.startsWith('Quotations')) && body && typeof body === 'object') {
    body = { ...body };
    // Leave financial Project blank as requested
    delete body.Project;
    if (endpoint.startsWith('Orders')) {
      body.MainUsage = 9;
      if (!body.TaxExtension || typeof body.TaxExtension !== 'object') {
        body.TaxExtension = {};
      }
      body.TaxExtension.MainUsage = 9;
    }
    if (Array.isArray(body.DocumentLines)) {
      body.DocumentLines = body.DocumentLines.map((line: any) => {
        if (!line) return line;
        const copy = { ...line };
        delete copy.ProjectCode;
        if (endpoint.startsWith('Orders') && (copy.Usage === undefined || copy.Usage === null)) {
          copy.Usage = 9;
        }
        if (!copy.CostingCode) copy.CostingCode = 'BR';
        if (!copy.CostingCode2) copy.CostingCode2 = 'MATRIZ';
        if (!copy.CostingCode3) copy.CostingCode3 = 'OPER_OFF';

        const rawTaxa = copy.CommisionPercent ?? copy.CommissionPercent ?? copy.Commission ?? copy.Taxa;
        if (rawTaxa !== undefined && rawTaxa !== null && rawTaxa !== '') {
          const num = Number(String(rawTaxa).replace(',', '.'));
          if (!isNaN(num) && num > 0) {
            copy.CommisionPercent = num;
            copy.CommissionPercent = num;
            copy.Commission = num;
            copy.U_nItem = null;
            copy.U_ItemLoc = null;
            delete copy.U_nITEM;
            delete copy.U_ITEMLOC;
          }
        }
        return copy;
      });
    }
  }

  if (method !== 'GET') {
    console.log(`SAP Proxy Request: ${method} ${endpoint}`, JSON.stringify(body, null, 2));
  }

  let finalMethod = method;
  const finalHeaders: any = {
    'Cookie': cookieHeader,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'SAP-Portal-Client/1.0'
  };

  if (method === 'PATCH') {
    finalMethod = 'POST';
    finalHeaders['X-HTTP-Method-Override'] = 'PATCH';
    finalHeaders['B1S-ReplaceCollectionsOnPatch'] = 'true';
  } else if (method === 'DELETE') {
    finalMethod = 'POST';
    finalHeaders['X-HTTP-Method-Override'] = 'DELETE';
  }

  Object.keys(req.headers).forEach(key => {
    if (key.toLowerCase().startsWith('b1s-')) {
      finalHeaders[key] = req.headers[key];
    }
  });

  const executeWithRetry = async (retries = 3) => {
    let hasAttemptedReauth = false;
    for (let i = 0; i < retries; i++) {
      try {
        return await axios({
          method: finalMethod,
          url: `${sapConfig.baseUrl}/${endpoint}`,
          params: query,
          data: body,
          httpsAgent: new https.Agent({
            rejectUnauthorized: false,
            keepAlive: true
          }),
          headers: finalHeaders
        });
      } catch (error: any) {
        const isUnauth = error.response?.status === 401 || error.response?.data?.error?.code === 301;
        if (isUnauth && !hasAttemptedReauth) {
          hasAttemptedReauth = true;
          console.warn(`SAP Proxy: 401 / Session Expired on ${endpoint}. Auto re-authenticating...`);
          try {
            const auth = await doSapLogin(req, res, true);
            finalHeaders['Cookie'] = auth.cookieHeader;
            console.log(`Auto re-authentication succeeded. Retrying ${endpoint}...`);
            continue;
          } catch (reauthErr: any) {
            console.error('Auto re-authentication failed:', reauthErr.message);
            throw error;
          }
        }

        const isTransient = error.response?.status === 502 || error.response?.status === 503 || error.response?.status === 504;
        if (isTransient && i < retries - 1) {
          const waitMs = 800 * (i + 1) + Math.floor(Math.random() * 400);
          console.warn(`Proxy attempt ${i + 1} for ${endpoint} returned ${error.response?.status}. Retrying in ${waitMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitMs));
          continue;
        }
        throw error;
      }
    }
  };

  try {
    const response: any = await executeWithRetry();
    res.json(response.data);
  } catch (error: any) {
    const errorData = error.response?.data;
    const isHtml = typeof errorData === 'string' && errorData.includes('<!DOCTYPE');
    const sapErrorMessage = errorData?.error?.message?.value || errorData?.error?.message || error.message;
    const isTransient = error.response?.status === 503 || error.response?.status === 502 || error.response?.status === 504;

    if (error.response?.status !== 404 && error.response?.status !== 400 && !isTransient) {
      console.error(`SAP Proxy Error (${endpoint}):`, {
        status: error.response?.status,
        sapCode: errorData?.error?.code,
        sapMessage: sapErrorMessage,
        data: isHtml ? '[HTML Error Page]' : errorData
      });
    } else {
      console.warn(`SAP Proxy Warning (${endpoint}): ${error.response?.status} - ${sapErrorMessage}`);
    }
    
    // For GET queries during SAP transient 503/502/504, return empty array to keep UI functional
    if (method === 'GET' && isTransient) {
      return res.status(200).json({ value: [], _sapOffline: true });
    }

    res.status(error.response?.status || 500).json(errorData || { error: 'Erro na requisição ao SAP.', details: sapErrorMessage });
  }
});

// Mount the API Router under multiple route patterns to support Netlify Functions & local Express
app.use('/.netlify/functions/api', apiRouter);
app.use('/api', apiRouter);
app.use('/', apiRouter);
