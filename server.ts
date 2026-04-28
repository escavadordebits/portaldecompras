import express from 'express';
import { createServer as createViteServer } from 'vite';
import axios from 'axios';
import cookieParser from 'cookie-parser';
import path from 'path';
import https from 'https';
import dotenv from 'dotenv';
import multer from 'multer';
import FormData from 'form-data';
import { config } from './config';
import { Resend } from 'resend';

dotenv.config();

const app = express();
const PORT = Number(config.server.port) || 3000;

app.use(express.json());
app.use(cookieParser());

// Configure multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// SAP Service Layer configuration
const SAP_BASE_URL = config.sap.baseUrl.replace(/\/$/, ''); // Remove trailing slash if exists
const SYSTEM_USER = config.sap.systemUser;
const SYSTEM_PASSWORD = config.sap.systemPassword;

// Create an axios instance with more robust settings
const sapApi = axios.create({
  baseURL: SAP_BASE_URL,
  httpsAgent: new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true
  }),
  timeout: 60000, // Increase timeout to 60s for slow SAP servers
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'SAP-Portal-Client/1.0'
  },
  validateStatus: (status) => status >= 200 && status < 300
});

// Helper to get session from cookies
const getSessionId = (req: express.Request) => req.cookies['B1SESSION'];

// Helper to get SAP configuration from headers or defaults
const getSapConfig = (req: express.Request) => {
  const customUrl = req.headers['x-sap-url'] as string;
  const customUser = req.headers['x-sap-user'] as string;
  const customPassword = req.headers['x-sap-password'] as string;

  return {
    baseUrl: (customUrl || config.sap.baseUrl).replace(/\/$/, ''),
    user: customUser || config.sap.systemUser,
    password: customPassword || config.sap.systemPassword
  };
};

// API Routes
app.post('/api/login', async (req, res) => {
  const { email, companyDB } = req.body;
  const sapConfig = getSapConfig(req);

  if (!email || !companyDB) {
    return res.status(400).json({ error: 'Email e Base de Dados são obrigatórios.' });
  }

  const loginWithRetry = async (retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        return await axios.post(`${sapConfig.baseUrl}/Login`, {
          CompanyDB: companyDB,
          UserName: sapConfig.user,
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
        if (error.response?.status === 502 && i < retries - 1) {
          console.warn(`Attempt ${i + 1} failed with 502. Retrying in ${1000 * (i + 1)}ms...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
          continue;
        }
        throw error;
      }
    }
  };

  try {
    console.log(`Attempting SAP Login for ${email} on ${companyDB} using ${sapConfig.baseUrl}...`);
    
    // 1. Login with system user to the specified database with retry
    const loginResponse: any = await loginWithRetry();

    const sessionId = loginResponse.data.SessionId;
    const cookies = loginResponse.headers['set-cookie'] || [];
    const routeId = cookies.find(c => c.includes('ROUTEID'))?.split(';')[0];

    console.log('Login successful, checking user existence...');

    // 2. Check if the user email exists in SAP
    const usersResponse = await axios.get(`${sapConfig.baseUrl}/Users?$filter=eMail eq '${email}'`, {
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      headers: {
        'Cookie': `B1SESSION=${sessionId}; ${routeId || ''}`,
        'Accept': 'application/json'
      },
      timeout: 30000
    });

    if (usersResponse.data.value && usersResponse.data.value.length > 0) {
      const sapUser = usersResponse.data.value[0];
      
      // Set session cookies in the browser
      res.cookie('B1SESSION', sessionId, { httpOnly: true, secure: true, sameSite: 'none' });
      if (routeId) {
        const [name, value] = routeId.split('=');
        res.cookie(name, value, { httpOnly: true, secure: true, sameSite: 'none' });
      }
      
      console.log(`User ${email} verified and logged in.`);
      return res.json({ 
        success: true, 
        user: {
          name: sapUser.UserName,
          email: sapUser.eMail,
          internalKey: sapUser.InternalKey
        }
      });
    } else {
      console.warn(`User ${email} not found in SAP Users table.`);
      return res.status(401).json({ error: 'Usuário não encontrado no SAP.' });
    }
  } catch (error: any) {
    const errorData = error.response?.data;
    const isHtml = typeof errorData === 'string' && errorData.includes('<!DOCTYPE');
    
    console.error('SAP Login Error Detail:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: isHtml ? '[HTML Error Page]' : errorData,
      message: error.message
    });

    if (error.response?.status === 502) {
      return res.status(502).json({ 
        error: 'O servidor SAP (Service Layer) retornou um erro 502 (Bad Gateway). Isso geralmente indica que o serviço está temporariamente indisponível ou instável. Por favor, tente novamente em instantes.' 
      });
    }

    return res.status(500).json({ 
      error: 'Erro ao conectar com o SAP Service Layer. Verifique se a URL e as credenciais estão corretas.' 
    });
  }
});

// Email Sending Route
app.post('/api/send-email', async (req, res) => {
  const { to, cc, subject, body } = req.body;

  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Destinatário, assunto e corpo são obrigatórios.' });
  }

  try {
    const resendKey = process.env.RESEND_API_KEY;
    
    if (!resendKey) {
      console.log('--- MOCK EMAIL PROCESSED (RESEND NOT CONFIGURED) ---');
      console.log('To:', to);
      console.log('CC:', cc);
      console.log('Subject:', subject);
      console.log('Body:', body);
      console.log('------------------------------------------------');
      return res.json({ 
        success: true, 
        message: 'E-mail processado em modo demonstração (RESEND_API_KEY não configurada).',
        isMock: true 
      });
    }

    const resend = new Resend(resendKey);

    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM || 'onboarding@resend.dev',
      to: [to],
      cc: cc ? [cc] : undefined,
      subject: subject,
      text: body,
      html: body.replace(/\n/g, '<br>'),
    });

    if (error) {
      console.error('Resend Error:', error);
      return res.status(400).json({ error: 'Erro ao enviar e-mail via Resend.', details: error });
    }

    console.log('Email sent successfully via Resend:', data?.id);
    res.json({ success: true, messageId: data?.id });
  } catch (error: any) {
    console.error('Email Sending Error:', error);
    res.status(500).json({ error: 'Erro interno ao enviar e-mail.', details: error.message });
  }
});

// Special route for SAP Attachments (requires multipart/form-data)
app.post('/api/sap/Attachments2', upload.array('files'), async (req, res) => {
  const sessionId = getSessionId(req);
  const cookieHeader = Object.entries(req.cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
  
  if (!sessionId) {
    return res.status(401).json({ error: 'Não autenticado.' });
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

// Proxy middleware for SAP requests
app.all('/api/sap/*', async (req, res) => {
  const sessionId = getSessionId(req);
  // Get all cookies to find ROUTEID or similar session stickiness cookies
  const cookieHeader = Object.entries(req.cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
  
  if (!sessionId) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  const endpoint = req.params[0];
  const method = req.method;
  const query = req.query;
  const body = req.body;
  const sapConfig = getSapConfig(req);

  // Log for debugging
  if (method !== 'GET') {
    console.log(`SAP Proxy Request: ${method} ${endpoint}`, JSON.stringify(body, null, 2));
  }

  // Handle PATCH/DELETE via POST override if needed (common for 403 Forbidden on some servers)
  // Also add B1S-ReplaceCollectionsOnPatch for PATCH requests
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

  const executeWithRetry = async (retries = 3) => {
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
        // Retry on 502 (Bad Gateway) or 504 (Gateway Timeout)
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
    
    // Extract detailed message if available
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

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
