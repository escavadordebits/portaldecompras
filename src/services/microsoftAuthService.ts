// Microsoft Authentication (MSAL / OAuth 2.0 PKCE) Service for Outlook & Microsoft Graph

export interface MicrosoftAccount {
  name: string;
  email: string;
  id?: string;
  accessToken: string;
  expiresAt: number;
}

export interface MicrosoftAuthConfig {
  clientId: string;
  tenantId?: string;
  redirectUri?: string;
}

const STORAGE_KEYS = {
  CLIENT_ID: 'ms_client_id',
  TENANT_ID: 'ms_tenant_id',
  ACCESS_TOKEN: 'ms_graph_token',
  ACCOUNT: 'ms_graph_account',
  CODE_VERIFIER: 'ms_pkce_verifier'
};

// Default fallback client ID if not configured in environment
export const DEFAULT_TENANT_ID = 'common';

export function getStoredMicrosoftConfig(): MicrosoftAuthConfig {
  const envClientId = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MICROSOFT_CLIENT_ID) || '';
  const storedClientId = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.CLIENT_ID) || '' : '';
  const storedTenant = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.TENANT_ID) || DEFAULT_TENANT_ID : DEFAULT_TENANT_ID;

  return {
    clientId: storedClientId || envClientId,
    tenantId: storedTenant,
    redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : ''
  };
}

export function saveMicrosoftConfig(clientId: string, tenantId = 'common') {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.CLIENT_ID, clientId.trim());
    localStorage.setItem(STORAGE_KEYS.TENANT_ID, tenantId.trim() || 'common');
  }
}

export function getStoredMicrosoftAccount(): MicrosoftAccount | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACCOUNT);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (token) {
      parsed.accessToken = token;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearMicrosoftSession() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.ACCOUNT);
    localStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER);
  }
}

// Generate secure PKCE Code Verifier
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  return Array.from(array, byte => ('0' + (byte & 0xff).toString(16)).slice(-2)).join('');
}

// Base64URL encode buffer
function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Generate PKCE Code Challenge from Verifier
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
}

// Initiates the Microsoft Login Flow via a popup window
export async function loginWithMicrosoftPopup(options?: {
  clientId?: string;
  tenantId?: string;
}): Promise<MicrosoftAccount> {
  const config = getStoredMicrosoftConfig();
  const clientId = options?.clientId?.trim() || config.clientId?.trim();
  const tenantId = options?.tenantId?.trim() || config.tenantId?.trim() || DEFAULT_TENANT_ID;
  const redirectUri = `${window.location.origin}/auth/callback`;

  if (!clientId) {
    throw new Error('ID do Aplicativo Azure (Client ID) não configurado.');
  }

  // 1. Generate PKCE values
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = Math.random().toString(36).substring(2, 15);

  localStorage.setItem(STORAGE_KEYS.CODE_VERIFIER, verifier);

  // 2. Build authorization URL
  const scopes = 'openid profile email Mail.Send offline_access';
  const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?` +
    new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: scopes,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: state,
      prompt: 'select_account'
    }).toString();

  // 3. Open Popup Window
  const width = 560;
  const height = 660;
  const left = window.screenX + (window.outerWidth - width) / 2;
  const top = window.screenY + (window.outerHeight - height) / 2;

  const popup = window.open(
    authUrl,
    'microsoft_oauth_popup',
    `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no`
  );

  if (!popup) {
    throw new Error('O navegador bloqueou a janela pop-up. Por favor, permita pop-ups para este site.');
  }

  // 4. Wait for postMessage callback from popup
  return new Promise<MicrosoftAccount>((resolve, reject) => {
    let checkClosedInterval: any = null;
    let isProcessingCallback = false;

    const cleanup = () => {
      window.removeEventListener('message', messageHandler);
      if (checkClosedInterval) {
        clearInterval(checkClosedInterval);
        checkClosedInterval = null;
      }
    };

    const messageHandler = async (event: MessageEvent) => {
      if (event.data?.type === 'MS_OAUTH_CALLBACK') {
        isProcessingCallback = true;
        cleanup();

        if (event.data.error) {
          const errorMsg = event.data.errorDescription || event.data.error;
          return reject(new Error(`Falha na autorização Microsoft: ${errorMsg}`));
        }

        const code = event.data.code;
        if (!code) {
          return reject(new Error('Nenhum código de autorização recebido da Microsoft.'));
        }

        try {
          // Exchange authorization code for token
          const tokenData = await exchangeCodeForToken({
            code,
            codeVerifier: verifier,
            clientId,
            tenantId,
            redirectUri
          });

          // Fetch user profile from Microsoft Graph
          const profile = await fetchUserProfile(tokenData.access_token);

          const account: MicrosoftAccount = {
            name: profile.displayName || profile.givenName || 'Usuário Microsoft',
            email: profile.mail || profile.userPrincipalName || '',
            id: profile.id,
            accessToken: tokenData.access_token,
            expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000
          };

          // Save session
          localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, account.accessToken);
          localStorage.setItem(STORAGE_KEYS.ACCOUNT, JSON.stringify(account));

          resolve(account);
        } catch (exchangeErr: any) {
          reject(exchangeErr);
        }
      }
    };

    window.addEventListener('message', messageHandler);

    // Watch if user manually closed popup
    checkClosedInterval = setInterval(() => {
      try {
        if (popup.closed && !isProcessingCallback) {
          setTimeout(() => {
            if (!isProcessingCallback) {
              cleanup();
              reject(new Error('A janela de autenticação da Microsoft foi fechada antes da conclusão.'));
            }
          }, 600);
        }
      } catch {
        // Safe to ignore cross-origin access exception
      }
    }, 1000);
  });
}

// Exchange code for token via server proxy or directly
async function exchangeCodeForToken(params: {
  code: string;
  codeVerifier: string;
  clientId: string;
  tenantId: string;
  redirectUri: string;
}): Promise<any> {
  const response = await fetch('/api/auth/microsoft/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error_description || 
      errorData.details || 
      errorData.error || 
      'Erro ao obter token da Microsoft.'
    );
  }

  return response.json();
}

// Fetch authenticated profile from Graph API
async function fetchUserProfile(accessToken: string): Promise<any> {
  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Could not fetch /me from Microsoft Graph:', err);
  }
  return {};
}
