// Configuração do SAP Service Layer para o Web App
// A URL e credenciais padrão podem ser configuradas aqui ou via variáveis de ambiente (.env)

export const SAP_CONFIG = {
  baseUrl: (import.meta.env.VITE_SAP_SERVICE_LAYER_URL as string) || 'https://piqualithse.b1cloud.com.br:50000/b1s/v1',
  systemUser: (import.meta.env.VITE_SAP_USER_NAME as string) || 'B1i',
  systemPassword: (import.meta.env.VITE_SAP_PASSWORD as string) || '1234',
  defaultCompany: (import.meta.env.VITE_SAP_COMPANY_DB as string) || 'SBO_QUALITECH'
};
