import express from 'express';
import cors from 'cors';
import axios from 'axios';
import cookieParser from 'cookie-parser';
import https from 'https';
import dotenv from 'dotenv';
import multer from 'multer';
import FormData from 'form-data';
import { config } from './config';

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
  if (!trimmed || trimmed === 'SBO_QUALITECH_QAS' || trimmed === 'SBO_QUALITECH_IRML' || trimmed === 'QUALITECH' || trimmed === 'SBO_QUALITECH_') {
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
    const candidateUsers = [sapConfig.user, 'B1i', 'manager', 'Manager'];
    const usersToTry = Array.from(new Set(candidateUsers.filter(Boolean)));
    const candidateCompanies = Array.from(new Set([companyDB, 'SBO_QUALITECH'].filter(Boolean)));

    let lastError: any = null;

    for (const targetCompany of candidateCompanies) {
      for (const testUser of usersToTry) {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            console.log(`Attempting SAP login as '${testUser}' for '${targetCompany}' (attempt ${attempt + 1})...`);
            const loginResponse = await axios.post(`${sapConfig.baseUrl}/Login`, {
              CompanyDB: targetCompany,
              UserName: testUser,
              Password: sapConfig.password
            }, {
              httpsAgent: new https.Agent({ rejectUnauthorized: false }),
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'SAP-Portal-Client/1.0'
              },
              timeout: 25000
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
            console.warn(`SAP login attempt ${attempt + 1} as '${testUser}' for '${targetCompany}' failed (${status || 'ERR'}): ${sapErrorMsg}`);

            const isSamlRace = status === 500 && typeof sapErrorMsg === 'string' && sapErrorMsg.toLowerCase().includes('saml');
            if (isSamlRace && attempt < 2) {
              const waitMs = 800 * (attempt + 1) + Math.floor(Math.random() * 400);
              console.log(`SAML lock detected in SAP SLD. Retrying '${testUser}' in ${waitMs}ms...`);
              await new Promise(resolve => setTimeout(resolve, waitMs));
              continue;
            }

            // If explicit 401 (not SSO / wrong password), test next user
            if (status === 401) {
              break;
            }

            if (attempt < 2) {
              await new Promise(resolve => setTimeout(resolve, 800));
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

  const loginWithRetry = async (retries = 3) => {
    // Try primary user (B1i or configured user), then fallback to manager if 401
    const usersToTry = [sapConfig.user, 'manager', 'Manager', 'B1i'];
    const uniqueUsers = Array.from(new Set(usersToTry.filter(Boolean)));

    let lastError: any = null;

    for (const testUser of uniqueUsers) {
      for (let i = 0; i < retries; i++) {
        try {
          console.log(`Authenticating with SAP Service Layer as user '${testUser}' on '${companyDB}'...`);
          return await axios.post(`${sapConfig.baseUrl}/Login`, {
            CompanyDB: companyDB,
            UserName: testUser,
            Password: sapConfig.password
          }, {
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            headers: { 
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'SAP-Portal-Client/1.0'
            },
            timeout: 30000
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
            // If auth or SSO failure, immediately try next candidate user
            break;
          }
          if (error.response?.status === 502 && i < retries - 1) {
            console.warn(`Attempt ${i + 1} failed with 502. Retrying in ${1000 * (i + 1)}ms...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            continue;
          }
          throw error;
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
        timeout: 30000
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
          timeout: 30000
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

    if (foundSapUser) {
      // Set session cookies in the browser
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
      
      console.log(`User ${email} verified and logged in. (${foundSapUser.source}: ${foundSapUser.userCode} / ${foundSapUser.name})`);
      return res.json({ 
        success: true, 
        user: foundSapUser
      });
    } else {
      console.warn(`User verification failed: ${email} not found in SBO Users or EmployeesInfo for company ${companyDB}`);
      return res.status(401).json({ 
        error: 'Usuário não encontrado ou não autorizado no SAP.',
        details: `O e-mail ou código de usuário '${email}' não foi localizado nas tabelas de Usuários (Users) ou Colaboradores (EmployeesInfo) do banco '${companyDB}'. Verifique se o cadastro no SAP utiliza este e-mail ou o código '${emailPrefix}'.`
      });
    }
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

    if (status === 502 || status === 504) {
      return res.status(status).json({ 
        error: 'O servidor SAP (Service Layer) está temporariamente indisponível (Erro 502/504).',
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

  const endpoint = req.params[0];
  const method = req.method;
  const query = req.query;
  const body = req.body;
  const sapConfig = getSapConfig(req);

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

        if ((error.response?.status === 502 || error.response?.status === 504) && i < retries - 1) {
          console.warn(`Proxy attempt ${i + 1} for ${endpoint} failed with ${error.response?.status}. Retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
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

    if (error.response?.status !== 404 && error.response?.status !== 400) {
      console.error(`SAP Proxy Error (${endpoint}):`, {
        status: error.response?.status,
        sapCode: errorData?.error?.code,
        sapMessage: sapErrorMessage,
        data: isHtml ? '[HTML Error Page]' : errorData
      });
    } else {
      console.warn(`SAP Proxy Warning (${endpoint}): ${error.response?.status} - ${sapErrorMessage}`);
    }
    
    res.status(error.response?.status || 500).json(errorData || { error: 'Erro na requisição ao SAP.', details: sapErrorMessage });
  }
});

// Mount the API Router under multiple route patterns to support Netlify Functions & local Express
app.use('/.netlify/functions/api', apiRouter);
app.use('/api', apiRouter);
app.use('/', apiRouter);
