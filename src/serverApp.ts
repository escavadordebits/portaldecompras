import express from 'express';
import axios from 'axios';
import cookieParser from 'cookie-parser';
import https from 'https';
import dotenv from 'dotenv';
import multer from 'multer';
import FormData from 'form-data';
import { config } from '../config';

dotenv.config();

export function createApiApp() {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  // Configure multer for file uploads
  const upload = multer({ storage: multer.memoryStorage() });

  // Helper to get session from cookies
  const getSessionId = (req: express.Request) => req.cookies?.['B1SESSION'];

  // Helper to get SAP configuration from headers or defaults
  const getSapConfig = (req: express.Request) => {
    const customUrl = (req.headers['x-sap-url'] || req.headers['X-SAP-URL']) as string;
    const customUser = (req.headers['x-sap-user'] || req.headers['X-SAP-User']) as string;
    const customPassword = (req.headers['x-sap-password'] || req.headers['X-SAP-Password']) as string;

    return {
      baseUrl: (customUrl || process.env.SAP_SERVICE_LAYER_URL || config.sap.baseUrl).replace(/\/$/, ''),
      user: customUser || process.env.SAP_USER_NAME || config.sap.systemUser,
      password: customPassword || process.env.SAP_PASSWORD || config.sap.systemPassword,
      companyDB: process.env.SAP_COMPANY_DB || config.sap.defaultCompany
    };
  };

  const router = express.Router();

  // Health check
  router.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Login route
  router.post('/login', async (req, res) => {
    const { email, companyDB } = req.body;
    const sapConfig = getSapConfig(req);
    const targetCompany = companyDB || sapConfig.companyDB;

    if (!email || !targetCompany) {
      return res.status(400).json({ error: 'Email e Base de Dados são obrigatórios.' });
    }

    const loginWithRetry = async (retries = 3) => {
      for (let i = 0; i < retries; i++) {
        try {
          return await axios.post(`${sapConfig.baseUrl}/Login`, {
            CompanyDB: targetCompany,
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
      console.log(`Attempting SAP Login for ${email} on ${targetCompany} using ${sapConfig.baseUrl}...`);
      
      const loginResponse: any = await loginWithRetry();
      const sessionId = loginResponse.data.SessionId;
      const cookies = loginResponse.headers['set-cookie'] || [];
      const routeId = cookies.find((c: string) => c.includes('ROUTEID'))?.split(';')[0];

      console.log('Login successful, checking user existence...');

      // Check if user exists
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
          error: 'O servidor SAP (Service Layer) retornou um erro 502 (Bad Gateway). Verifique se o serviço está acessível.' 
        });
      }

      return res.status(500).json({ 
        error: 'Erro ao conectar com o SAP Service Layer. Verifique se a URL e as credenciais estão corretas.',
        details: errorData?.error?.message?.value || error.message
      });
    }
  });

  // Attachments route
  router.post('/sap/Attachments2', upload.array('files'), async (req, res) => {
    const sessionId = getSessionId(req);
    const cookieHeader = Object.entries(req.cookies || {})
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
        sapMessage: sapErrorMessage
      });
      
      res.status(error.response?.status || 500).json(errorData || { error: 'Erro ao enviar anexos ao SAP.', details: sapErrorMessage });
    }
  });

  // Proxy middleware for general SAP requests
  router.all('/sap/*', async (req, res) => {
    const sessionId = getSessionId(req);
    const cookieHeader = Object.entries(req.cookies || {})
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

    if (method !== 'GET') {
      console.log(`SAP Proxy Request: ${method} ${endpoint}`);
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
      const sapErrorMessage = errorData?.error?.message?.value || errorData?.error?.message || error.message;
      res.status(error.response?.status || 500).json(errorData || { error: 'Erro na requisição ao SAP.', details: sapErrorMessage });
    }
  });

  // Mount router on multiple common paths
  app.use('/api', router);
  app.use('/.netlify/functions/api', router);
  app.use(router);

  return app;
}
