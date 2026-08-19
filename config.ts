// Configuration file for the SAP Portal
// This file reads from environment variables but can be modified directly if needed.

export const config = {
  sap: {
    baseUrl: process.env.SAP_SERVICE_LAYER_URL || 'https://piqualithse.b1cloud.com.br:50000/b1s/v1',
    systemUser: process.env.SAP_USER_NAME || 'manager',
    systemPassword: process.env.SAP_PASSWORD || '1234',
    defaultCompany: process.env.SAP_COMPANY_DB || 'SBO_QUALITECH_QAS'
  },
  server: {
    port: 3000
  }
};
