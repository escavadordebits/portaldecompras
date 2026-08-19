import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 65000 // Slightly longer than server timeout
});

// Add interceptor to include custom SAP configuration headers if they exist
api.interceptors.request.use((config) => {
  const sapConfigStr = localStorage.getItem('sap_portal_config');
  if (sapConfigStr) {
    try {
      const sapConfig = JSON.parse(sapConfigStr);
      if (sapConfig.url) config.headers['X-SAP-URL'] = sapConfig.url;
      if (sapConfig.user) config.headers['X-SAP-User'] = sapConfig.user;
      if (sapConfig.password) config.headers['X-SAP-Password'] = sapConfig.password;
    } catch (e) {
      console.error('Error parsing SAP config from localStorage', e);
    }
  }
  const currentCompany = localStorage.getItem('sap_portal_company');
  if (currentCompany) {
    config.headers['X-SAP-Company'] = currentCompany;
  }
  return config;
});

// Helper to handle API errors
const handleApiError = (error: any, context: string) => {
  const errorData = error.response?.data;
  const isHtml = typeof errorData === 'string' && (errorData.includes('<!DOCTYPE') || errorData.includes('<html'));
  
  if (isHtml || error.response?.status === 404) {
    console.error(`API Error (${context}): Endpoint 404 Not Found or returned HTML page.`);
  } else {
    console.error(`API Error (${context}):`, errorData || error.message);
  }
  throw error;
};

export const sapService = {
  login: async (email: string, companyDB: string) => {
    try {
      const response = await api.post('/login', { email, companyDB });
      if (companyDB) {
        localStorage.setItem('sap_portal_company', companyDB);
      }
      return response.data;
    } catch (error) {
      return handleApiError(error, 'login');
    }
  },

  getPurchaseOrders: async () => {
    try {
      const response = await api.get('/sap/PurchaseOrders?$orderby=DocEntry desc&$top=20');
      return response.data.value;
    } catch (error) {
      return handleApiError(error, 'getPurchaseOrders');
    }
  },

  getPurchaseRequests: async () => {
    try {
      const response = await api.get('/sap/CustosPessoal?$top=20');
      return response.data.value;
    } catch (error) {
      return handleApiError(error, 'getPurchaseRequests');
    }
  },

  getPurchaseQuotations: async () => {
    try {
      const response = await api.get('/sap/PurchaseQuotations?$orderby=DocEntry desc&$top=50');
      return response.data.value;
    } catch (error) {
      return handleApiError(error, 'getPurchaseQuotations');
    }
  },

  getPurchaseDownPayments: async () => {
    try {
      const response = await api.get('/sap/PurchaseDownPayments?$orderby=DocEntry desc&$top=20');
      return response.data.value;
    } catch (error) {
      return handleApiError(error, 'getPurchaseDownPayments');
    }
  },

  getPurchaseOrder: async (docEntry: number) => {
    try {
      const response = await api.get(`/sap/PurchaseOrders(${docEntry})`);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'getPurchaseOrder');
    }
  },

  getPurchaseRequest: async (docEntry: number) => {
    try {
      const response = await api.get(`/sap/CustosPessoal(${docEntry})`);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'getPurchaseRequest');
    }
  },

  getPurchaseDownPayment: async (docEntry: number) => {
    try {
      const response = await api.get(`/sap/PurchaseDownPayments(${docEntry})`);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'getPurchaseDownPayment');
    }
  },

  createPurchaseOrder: async (data: any) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const formattedData = {
        ...data,
        DocDate: today,
        TaxDate: today,
        DocumentLines: data.DocumentLines.map((line: any) => ({
          ItemCode: line.ItemCode,
          Quantity: line.Quantity,
          UnitPrice: line.Price || 0,
          CostingCode: line.CostingCode,
          CostingCode2: line.CostingCode2,
          CostingCode3: line.CostingCode3,
          CostingCode4: line.CostingCode4,
          CostingCode5: line.CostingCode5,
          ProjectCode: line.ProjectCode,
          Usage: line.Usage
        }))
      };
      const response = await api.post('/sap/PurchaseOrders', formattedData, {
        headers: {
          'B1S-EnableApprovalWorkflow': 'true'
        }
      });
      return response.data;
    } catch (error) {
      return handleApiError(error, 'createPurchaseOrder');
    }
  },

  createPurchaseRequest: async (data: any, userEmail?: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const formattedData = {
        ...data,
        DocDate: today,
        TaxDate: today,
        ReqDate: data.DocDueDate || today,
        RequesterEmail: userEmail,
        DocumentLines: data.DocumentLines.map((line: any) => ({
          ItemCode: line.ItemCode,
          Quantity: line.Quantity,
          UnitPrice: line.Price || 0,
          RequiredDate: data.DocDueDate || today,
          CostingCode: line.CostingCode,
          CostingCode2: line.CostingCode2,
          CostingCode3: line.CostingCode3,
          CostingCode4: line.CostingCode4,
          CostingCode5: line.CostingCode5,
          ProjectCode: line.ProjectCode,
          Usage: line.Usage
        }))
      };
      const response = await api.post('/sap/CustosPessoal', formattedData, {
        headers: {
          'B1S-EnableApprovalWorkflow': 'true'
        }
      });
      return response.data;
    } catch (error) {
      return handleApiError(error, 'createPurchaseRequest');
    }
  },

  getPurchaseQuotation: async (docEntry: number) => {
    try {
      const response = await api.get(`/sap/PurchaseQuotations(${docEntry})`);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'getPurchaseQuotation');
    }
  },

  updatePurchaseQuotation: async (docEntry: number, data: any) => {
    try {
      // Typically updates to price and delivery dates on lines
      const response = await api.patch(`/sap/PurchaseQuotations(${docEntry})`, data);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'updatePurchaseQuotation');
    }
  },

  createPurchaseQuotation: async (data: any) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const formattedData = {
        ...data,
        DocDate: today,
        TaxDate: today,
        ReqDate: data.DocDueDate || today,
        DocumentLines: data.DocumentLines.map((line: any) => ({
          ItemCode: line.ItemCode,
          Quantity: line.Quantity,
          UnitPrice: line.Price || 0,
          RequiredDate: data.DocDueDate || today,
          CostingCode: line.CostingCode,
          CostingCode2: line.CostingCode2,
          CostingCode3: line.CostingCode3,
          CostingCode4: line.CostingCode4,
          CostingCode5: line.CostingCode5,
          ProjectCode: line.ProjectCode,
          Usage: line.Usage
        }))
      };
      const response = await api.post('/sap/PurchaseQuotations', formattedData, {
        headers: {
          'B1S-EnableApprovalWorkflow': 'true'
        }
      });
      return response.data;
    } catch (error) {
      return handleApiError(error, 'createPurchaseQuotation');
    }
  },

  createPurchaseDownPayment: async (data: any) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const formattedData = {
        ...data,
        DocDate: today,
        TaxDate: today,
        DocType: 'dDocument_Items',
        DownPaymentType: 'dptInvoice',
        DocumentLines: data.DocumentLines.map((line: any) => ({
          ItemCode: line.ItemCode,
          Quantity: line.Quantity,
          UnitPrice: line.Price || 0,
          CostingCode: line.CostingCode,
          CostingCode2: line.CostingCode2,
          CostingCode3: line.CostingCode3,
          CostingCode4: line.CostingCode4,
          CostingCode5: line.CostingCode5,
          ProjectCode: line.ProjectCode,
          Usage: line.Usage
        }))
      };
      const response = await api.post('/sap/PurchaseDownPayments', formattedData, {
        headers: {
          'B1S-EnableApprovalWorkflow': 'true'
        }
      });
      return response.data;
    } catch (error) {
      return handleApiError(error, 'createPurchaseDownPayment');
    }
  },

  uploadAttachments: async (files: File[]) => {
    try {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });

      // Do NOT set Content-Type manually, let the browser/axios handle it with the boundary
      const response = await api.post('/sap/Attachments2', formData);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'uploadAttachments');
    }
  },

  updatePurchaseOrder: async (docEntry: number, data: any) => {
    try {
      const response = await api.patch(`/sap/PurchaseOrders(${docEntry})`, data);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'updatePurchaseOrder');
    }
  },

  getBusinessPartners: async (name?: string) => {
    try {
      // Include BPFiscalTaxIDCollection and EmailAddress
      let url = "/sap/BusinessPartners?$select=CardCode,CardName,FederalTaxID,Frozen,CardType,EmailAddress,BPFiscalTaxIDCollection&$top=50";
      let filter = "(CardType eq 'cSupplier' or CardType eq 'S')";
      if (name) {
        filter += ` and (contains(CardName, '${name}') or contains(CardCode, '${name}'))`;
      }
      const response = await api.get(`${url}&$filter=${filter}`);
      
      // Map to extract CNPJ/CPF from BPFiscalTaxIDCollection if FederalTaxID is empty
      const partners = response.data.value.map((bp: any) => {
        let taxId = bp.FederalTaxID;
        // In Brazilian localization, CNPJ is in TaxId0 and CPF is in TaxId4
        if (!taxId && bp.BPFiscalTaxIDCollection && bp.BPFiscalTaxIDCollection.length > 0) {
          // Find the first entry that has either TaxId0 or TaxId4
          const fiscalEntry = bp.BPFiscalTaxIDCollection.find((f: any) => f.TaxId0 || f.TaxId4);
          if (fiscalEntry) {
            taxId = fiscalEntry.TaxId0 || fiscalEntry.TaxId4;
          }
        }
        return { ...bp, FederalTaxID: taxId };
      });

      // Filter active suppliers in memory for maximum compatibility
      return partners.filter((bp: any) => bp.Frozen === 'tNO' || bp.Frozen === 'N' || !bp.Frozen);
    } catch (error) {
      return handleApiError(error, 'getBusinessPartners');
    }
  },

  getBusinessPartner: async (cardCode: string) => {
    try {
      // Escape CardCode for OData URL if it has spaces or special chars
      const sanitizedCode = encodeURIComponent(cardCode.replace(/'/g, "''"));
      const response = await api.get(`/sap/BusinessPartners('${sanitizedCode}')?$select=CardCode,CardName,EmailAddress`);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'getBusinessPartner');
    }
  },

  getCollaborators: async (name?: string) => {
    try {
      let url = "/sap/BusinessPartners?$select=CardCode,CardName&$top=50";
      let filter = "(CardType eq 'cSupplier' or CardType eq 'S') and startswith(CardCode, 'CO')";
      if (name) {
        filter += ` and (contains(CardName, '${name}') or contains(CardCode, '${name}'))`;
      }
      const response = await api.get(`${url}&$filter=${filter}`);
      return response.data.value;
    } catch (error) {
      return handleApiError(error, 'getCollaborators');
    }
  },

  getItems: async (name?: string) => {
    try {
      // Escape single quotes for OData
      const sanitizedName = name ? name.replace(/'/g, "''") : '';
      let url = "/sap/Items?$select=ItemCode,ItemName,Frozen&$top=50";
      
      if (sanitizedName) {
        try {
          // Try searching both Code and Name
          const dualFilterUrl = `${url}&$filter=contains(ItemName, '${sanitizedName}') or contains(ItemCode, '${sanitizedName}')`;
          const response = await api.get(dualFilterUrl);
          return (response.data.value || []).filter((item: any) => item.Frozen === 'tNO' || item.Frozen === 'N' || !item.Frozen);
        } catch (e) {
          console.warn('Dual filter search failed, falling back to ItemName only...');
          // Fallback to searching only Name if the complex filter fails
          const singleFilterUrl = `${url}&$filter=contains(ItemName, '${sanitizedName}')`;
          const response = await api.get(singleFilterUrl);
          return (response.data.value || []).filter((item: any) => item.Frozen === 'tNO' || item.Frozen === 'N' || !item.Frozen);
        }
      }
      
      const response = await api.get(url);
      // Filter active items in memory for maximum compatibility
      return (response.data.value || []).filter((item: any) => item.Frozen === 'tNO' || item.Frozen === 'N' || !item.Frozen);
    } catch (error) {
      return handleApiError(error, 'getItems');
    }
  },

  getBusinessPlaces: async () => {
    try {
      // Fetch without $select to avoid "Property invalid" errors across different SL versions
      const response = await api.get("/sap/BusinessPlaces?$top=100");
      // Filter active branches in memory
      return (response.data.value || []).filter((b: any) => b.Disabled === 'tNO' || b.Disabled === 'N' || !b.Disabled);
    } catch (error) {
      console.warn('Error fetching BusinessPlaces, returning empty array');
      return [];
    }
  },

  getDistributionRules: async () => {
    try {
      // User specifically requested to use ProfitCenters for dimensions/costing rules
      let results: any[] = [];
      let nextLink: string | null = "/sap/ProfitCenters?$filter=Active eq 'tYES'&$select=CenterCode,CenterName,InWhichDimension&$top=1000";
      
      while (nextLink) {
        try {
          const response: any = await api.get(nextLink);
          const data = response.data;
          if (data && data.value) {
            results = [...results, ...data.value];
          }
          
          const next = data['odata.nextLink'];
          if (next) {
            // nextLink from SAP usually looks like "ProfitCenters?$skip=1000"
            // We need to ensure it's prefixed with our /sap/ base
            nextLink = next.startsWith('/sap/') ? next : `/sap/${next}`;
          } else {
            nextLink = null;
          }
        } catch (e) {
          console.error('Error fetching ProfitCenters page:', e);
          nextLink = null;
        }
        
        // Safety break
        if (results.length > 5000) break;
      }
      
      return results.map((r: any) => ({
        FactorCode: r.CenterCode || r.OcrCode,
        FactorDescription: r.CenterName || r.OcrName,
        InWhichDimension: r.InWhichDimension || r.DimCode
      }));
    } catch (error: any) {
      console.warn('ProfitCenters failed, falling back to DistributionRules...');
      try {
        const response = await api.get("/sap/DistributionRules?$select=FactorCode,FactorDescription,InWhichDimension&$top=1000");
        return (response.data.value || []).map((r: any) => ({
          FactorCode: r.FactorCode || r.OcrCode,
          FactorDescription: r.FactorDescription || r.OcrName,
          InWhichDimension: r.InWhichDimension || r.DimCode
        }));
      } catch (e) {
        try {
          const response = await api.get("/sap/DistributionRules?$top=1000");
          return (response.data.value || []).map((r: any) => ({
            FactorCode: r.FactorCode || r.OcrCode,
            FactorDescription: r.FactorDescription || r.OcrName,
            InWhichDimension: r.InWhichDimension || r.DimCode
          }));
        } catch (e2) {
          return [];
        }
      }
    }
  },

  getDimensions: async () => {
    try {
      // Try with filter first
      const response = await api.get("/sap/Dimensions?$filter=IsActive eq 'tYES'&$top=100");
      return (response.data.value || []).map((d: any) => ({
        ...d,
        DimensionCode: d.DimensionCode || d.DimensionNumber || d.Number || d.Code
      }));
    } catch (error: any) {
      try {
        // Try without filter if tYES/IsActive fails
        const response = await api.get("/sap/Dimensions?$top=100");
        return (response.data.value || [])
          .filter((d: any) => d.IsActive === 'tYES' || d.IsActive === 'Y' || d.Active === 'tYES')
          .map((d: any) => ({
            ...d,
            DimensionCode: d.DimensionCode || d.DimensionNumber || d.Number || d.Code
          }));
      } catch (e) {
        return [];
      }
    }
  },

  getProjects: async () => {
    try {
      const response = await api.get("/sap/Projects?$select=Code,Name&$top=1000");
      return response.data.value || [];
    } catch (error: any) {
      try {
        const response = await api.get("/sap/Projects?$top=1000");
        return response.data.value || [];
      } catch (e) {
        return [];
      }
    }
  },

  getUsages: async () => {
    try {
      // 1. Try NotaFiscalUsage first as requested
      const response = await api.get("/sap/NotaFiscalUsage?$select=ID,Usage&$top=1000");
      return response.data.value || [];
    } catch (error: any) {
      console.warn('Retrying getUsages with Usages (plural)...');
      try {
        // 2. Try plural form
        const response = await api.get("/sap/Usages?$select=ID,Usage&$top=1000");
        return response.data.value || [];
      } catch (err1) {
        try {
          // 3. Try singular form
          const response = await api.get("/sap/Usage?$select=ID,Usage&$top=1000");
          return response.data.value || [];
        } catch (err2) {
          try {
            // 4. Try FiscalInventoryUsages (Common in newer Brazilian localizations)
            const response = await api.get("/sap/FiscalInventoryUsages?$select=AbsEntry,Usage&$top=1000");
            return response.data.value?.map((u: any) => ({
              ID: u.AbsEntry,
              Usage: u.Usage
            })) || [];
          } catch (err3) {
            try {
              // 5. Try without select on Usages
              const response = await api.get("/sap/Usages?$top=1000");
              return response.data.value || [];
            } catch (err4) {
              // 6. Try NCMCodes fallback
              try {
                const response = await api.get("/sap/NCMCodes?$select=AbsEntry,NcmCode&$top=1000");
                return response.data.value?.map((n: any) => ({
                  ID: n.AbsEntry,
                  Usage: n.NcmCode
                })) || [];
              } catch (err5) {
                console.error('All getUsages fallbacks failed.');
                return [];
              }
            }
          }
        }
      }
    }
  },

  getDashboardStats: async () => {
    try {
      // Use DocumentStatus instead of DocStatus which is the correct field in Service Layer
      // Added DocEntry to provide unique keys for React lists
      // Added $orderby to show most recent first
      const orders = await api.get('/sap/PurchaseOrders?$select=DocEntry,DocumentStatus,DocTotal,DocDate&$top=100&$orderby=DocEntry desc');
      return orders.data.value;
    } catch (error) {
      return handleApiError(error, 'getDashboardStats');
    }
  },

  getApprovalRequests: async (status?: string) => {
    try {
      let url = '/sap/ApprovalRequests?$orderby=Code desc';
      if (status) {
        url += `&$filter=Status eq '${status}'`;
      }
      const response = await api.get(url);
      return response.data.value;
    } catch (error) {
      return handleApiError(error, 'getApprovalRequests');
    }
  },

  updateApprovalRequest: async (code: number, status: 'ardApproved' | 'ardNotApproved', remarks: string) => {
    try {
      // According to user instructions for SAP HANA:
      // 1. Use ApprovalRequestDecisions collection instead of ApprovalRequestLines
      // 2. Use full enum names: ardApproved, ardNotApproved
      // 3. The code passed is the DocEntry of the ApprovalRequest (OWDD)
      
      const data = {
        "ApprovalRequestDecisions": [
          {
            "Status": status,
            "Remarks": remarks || (status === 'ardApproved' ? 'Aprovado via Portal' : 'Recusado via Portal')
          }
        ]
      };
      
      console.log(`Enviando decisão para Solicitação #${code} (HANA Format):`, status);
      const response = await api.patch(`/sap/ApprovalRequests(${code})`, data);
      return response.data;
    } catch (error: any) {
      if (error.response?.data) {
        console.error('Detalhes do erro SAP:', JSON.stringify(error.response.data, null, 2));
      }
      return handleApiError(error, 'updateApprovalRequest');
    }
  },

  // Quality Control Module (QLT_QLDADE)
  getQualityRecords: async () => {
    try {
      const response = await api.get('/sap/U_QLT_QLDADE?$top=50');
      return response.data.value || [];
    } catch (error) {
      try {
        const response2 = await api.get('/sap/QLT_QLDADE?$top=50');
        return response2.data.value || [];
      } catch (err2) {
        console.warn('Quality records endpoint not found in SAP, returning empty list');
        return [];
      }
    }
  },

  createQualityRecord: async (data: any) => {
    // Calculate IPF before sending (sum of all scores)
    const ipf = (Number(data.U_Atendimento) || 0) + 
                (Number(data.U_Prazo) || 0) + 
                (Number(data.U_Quantidade) || 0) + 
                (Number(data.U_Documentacao) || 0) + 
                (Number(data.U_Qualidade) || 0);
    
    const formattedData = {
      ...data,
      U_IPF: ipf,
      U_Aviso_IPF: ipf < 10 ? 'Fornecedor Crítico' : 'Desempenho Adequado'
    };

    try {
      const response = await api.post('/sap/U_QLT_QLDADE', formattedData);
      return response.data;
    } catch (error) {
      try {
        const response2 = await api.post('/sap/QLT_QLDADE', formattedData);
        return response2.data;
      } catch (err2) {
        return handleApiError(error, 'createQualityRecord');
      }
    }
  },

  // Maintenance Module (QLT_CAB)
  getMaintenanceRecords: async () => {
    try {
      const response = await api.get('/sap/U_QLT_CAB?$top=50');
      return response.data.value || [];
    } catch (error) {
      try {
        const response2 = await api.get('/sap/QLT_CAB?$top=50');
        return response2.data.value || [];
      } catch (err2) {
        console.warn('Maintenance records endpoint not found in SAP, returning empty list');
        return [];
      }
    }
  },

  createMaintenanceRecord: async (data: any) => {
    try {
      const response = await api.post('/sap/U_QLT_CAB', data);
      return response.data;
    } catch (error) {
      try {
        const response2 = await api.post('/sap/QLT_CAB', data);
        return response2.data;
      } catch (err2) {
        return handleApiError(error, 'createMaintenanceRecord');
      }
    }
  },

  // Calibration Records (QLT_CALIB)
  getCalibrationRecords: async () => {
    try {
      const response = await api.get('/sap/QLT_CALIB?$top=50&$orderby=DocEntry desc');
      return response.data.value;
    } catch (error) {
      return handleApiError(error, 'getCalibrationRecords');
    }
  },

  getCalibrationDetail: async (docEntry: number) => {
    try {
      const response = await api.get(`/sap/QLT_CALIB(${docEntry})`);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'getCalibrationDetail');
    }
  },

  createCalibrationRecord: async (data: any) => {
    try {
      const response = await api.post('/sap/QLT_CALIB', data);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'createCalibrationRecord');
    }
  },

  updateCalibrationRecord: async (docEntry: number, data: any) => {
    try {
      const response = await api.patch(`/sap/QLT_CALIB(${docEntry})`, data);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'updateCalibrationRecord');
    }
  },

  deleteCalibrationRecord: async (docEntry: number) => {
    try {
      await api.delete(`/sap/QLT_CALIB(${docEntry})`);
      return true;
    } catch (error) {
      return handleApiError(error, 'deleteCalibrationRecord');
    }
  },

  // Cost Management (CustosPessoal & CustosLoc)
  getPersonnelCosts: async () => {
    try {
      const response = await api.get('/sap/CustosPessoal?$top=50');
      return response.data.value || [];
    } catch (error) {
      try {
        const response2 = await api.get('/sap/U_CustosPessoal?$top=50');
        return response2.data.value || [];
      } catch (err2) {
        console.warn('Personnel costs endpoint not found in SAP, returning empty list');
        return [];
      }
    }
  },

  getRentalCosts: async () => {
    try {
      const response = await api.get('/sap/CustosLoc?$top=50');
      return response.data.value || [];
    } catch (error) {
      try {
        const response2 = await api.get('/sap/U_CustosLoc?$top=50');
        return response2.data.value || [];
      } catch (err2) {
        console.warn('Rental costs endpoint not found in SAP, returning empty list');
        return [];
      }
    }
  },

  createPersonnelCost: async (data: any) => {
    try {
      const response = await api.post('/sap/CustosPessoal', data);
      return response.data;
    } catch (error) {
      try {
        const response2 = await api.post('/sap/U_CustosPessoal', data);
        return response2.data;
      } catch (err2) {
        return handleApiError(error, 'createPersonnelCost');
      }
    }
  },

  updatePersonnelCost: async (docEntry: number, data: any) => {
    try {
      const response = await api.patch(`/sap/CustosPessoal(${docEntry})`, data);
      return response.data;
    } catch (error) {
      try {
        const response2 = await api.patch(`/sap/U_CustosPessoal(${docEntry})`, data);
        return response2.data;
      } catch (err2) {
        return handleApiError(error, 'updatePersonnelCost');
      }
    }
  },

  deletePersonnelCost: async (docEntry: number) => {
    try {
      const response = await api.delete(`/sap/CustosPessoal(${docEntry})`);
      return response.data;
    } catch (error) {
      try {
        const response2 = await api.delete(`/sap/U_CustosPessoal(${docEntry})`);
        return response2.data;
      } catch (err2) {
        return handleApiError(error, 'deletePersonnelCost');
      }
    }
  },

  createRentalCost: async (data: any) => {
    try {
      const response = await api.post('/sap/CustosLoc', data);
      return response.data;
    } catch (error) {
      try {
        const response2 = await api.post('/sap/U_CustosLoc', data);
        return response2.data;
      } catch (err2) {
        return handleApiError(error, 'createRentalCost');
      }
    }
  },

  updateRentalCost: async (docEntry: number, data: any) => {
    try {
      const response = await api.patch(`/sap/CustosLoc(${docEntry})`, data);
      return response.data;
    } catch (error) {
      try {
        const response2 = await api.patch(`/sap/U_CustosLoc(${docEntry})`, data);
        return response2.data;
      } catch (err2) {
        return handleApiError(error, 'updateRentalCost');
      }
    }
  },

  deleteRentalCost: async (docEntry: number) => {
    try {
      const response = await api.delete(`/sap/CustosLoc(${docEntry})`);
      return response.data;
    } catch (error) {
      try {
        const response2 = await api.delete(`/sap/U_CustosLoc(${docEntry})`);
        return response2.data;
      } catch (err2) {
        return handleApiError(error, 'deleteRentalCost');
      }
    }
  },

  // Quotations (SalesQuotations)
  getQuotations: async () => {
    try {
      const response = await api.get('/sap/Quotations?$top=50&$orderby=DocEntry desc');
      return response.data.value;
    } catch (error) {
      return handleApiError(error, 'getQuotations');
    }
  },

  getQuotation: async (docEntry: number) => {
    try {
      const response = await api.get(`/sap/Quotations(${docEntry})`);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'getQuotation');
    }
  },

  createQuotation: async (data: any) => {
    try {
      // Fix for Brazilian localization mandatory field
      const sanitizeData = (obj: any) => {
        const sanitized = { ...obj };
        if (!sanitized.U_B1SYS_RevenueInd2 || sanitized.U_B1SYS_RevenueInd2 === '') {
          sanitized.U_B1SYS_RevenueInd2 = '1';
        }
        // Force BPL_IDAssignedToInvoice to 1 for all sales documents
        sanitized.BPL_IDAssignedToInvoice = 1;

        if (sanitized.DocumentLines && Array.isArray(sanitized.DocumentLines)) {
          sanitized.DocumentLines = sanitized.DocumentLines.map((line: any) => ({
            ...line,
            U_B1SYS_RevenueInd2: (line.U_B1SYS_RevenueInd2 && line.U_B1SYS_RevenueInd2 !== '') ? line.U_B1SYS_RevenueInd2 : '1',
            BPL_IDAssignedToInvoice: 1
          }));
        }
        return sanitized;
      };

      const response = await api.post('/sap/Quotations', sanitizeData(data));
      return response.data;
    } catch (error) {
      return handleApiError(error, 'createQuotation');
    }
  },

  updateQuotation: async (docEntry: number, data: any) => {
    try {
      // Fix for Brazilian localization mandatory field
      const sanitizeData = (obj: any) => {
        const sanitized = { ...obj };
        if (!sanitized.U_B1SYS_RevenueInd2 || sanitized.U_B1SYS_RevenueInd2 === '') {
          sanitized.U_B1SYS_RevenueInd2 = '1';
        }
        // Force BPL_IDAssignedToInvoice to 1 for all sales documents
        sanitized.BPL_IDAssignedToInvoice = 1;

        if (sanitized.DocumentLines && Array.isArray(sanitized.DocumentLines)) {
          sanitized.DocumentLines = sanitized.DocumentLines.map((line: any) => ({
            ...line,
            U_B1SYS_RevenueInd2: (line.U_B1SYS_RevenueInd2 && line.U_B1SYS_RevenueInd2 !== '') ? line.U_B1SYS_RevenueInd2 : '1',
            BPL_IDAssignedToInvoice: 1
          }));
        }
        return sanitized;
      };

      const response = await api.patch(`/sap/Quotations(${docEntry})`, sanitizeData(data));
      return response.data;
    } catch (error) {
      return handleApiError(error, 'updateQuotation');
    }
  },

  deleteQuotation: async (docEntry: number) => {
    try {
      const response = await api.delete(`/sap/Quotations(${docEntry})`);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'deleteQuotation');
    }
  },

  // Orders (SalesOrders)
  getOrders: async () => {
    try {
      const response = await api.get('/sap/Orders?$orderby=DocEntry desc&$top=50');
      return response.data.value;
    } catch (error) {
      return handleApiError(error, 'getOrders');
    }
  },

  getOrder: async (docEntry: number) => {
    try {
      const response = await api.get(`/sap/Orders(${docEntry})`);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'getOrder');
    }
  },

  createOrder: async (data: any) => {
    try {
      const sanitizeData = (obj: any) => {
        const sanitized = { ...obj };
        if (!sanitized.U_B1SYS_RevenueInd2 || sanitized.U_B1SYS_RevenueInd2 === '') {
          sanitized.U_B1SYS_RevenueInd2 = '1';
        }
        sanitized.BPL_IDAssignedToInvoice = 1;

        if (sanitized.DocumentLines && Array.isArray(sanitized.DocumentLines)) {
          sanitized.DocumentLines = sanitized.DocumentLines.map((line: any) => ({
            ...line,
            U_B1SYS_RevenueInd2: (line.U_B1SYS_RevenueInd2 && line.U_B1SYS_RevenueInd2 !== '') ? line.U_B1SYS_RevenueInd2 : '1',
            BPL_IDAssignedToInvoice: 1
          }));
        }
        return sanitized;
      };

      const response = await api.post('/sap/Orders', sanitizeData(data));
      return response.data;
    } catch (error) {
      return handleApiError(error, 'createOrder');
    }
  },

  updateOrder: async (docEntry: number, data: any) => {
    try {
      const sanitizeData = (obj: any) => {
        const sanitized = { ...obj };
        if (!sanitized.U_B1SYS_RevenueInd2 || sanitized.U_B1SYS_RevenueInd2 === '') {
          sanitized.U_B1SYS_RevenueInd2 = '1';
        }
        sanitized.BPL_IDAssignedToInvoice = 1;

        if (sanitized.DocumentLines && Array.isArray(sanitized.DocumentLines)) {
          sanitized.DocumentLines = sanitized.DocumentLines.map((line: any) => ({
            ...line,
            U_B1SYS_RevenueInd2: (line.U_B1SYS_RevenueInd2 && line.U_B1SYS_RevenueInd2 !== '') ? line.U_B1SYS_RevenueInd2 : '1',
            BPL_IDAssignedToInvoice: 1
          }));
        }
        return sanitized;
      };

      const response = await api.patch(`/sap/Orders(${docEntry})`, sanitizeData(data));
      return response.data;
    } catch (error) {
      return handleApiError(error, 'updateOrder');
    }
  },

  deleteOrder: async (docEntry: number) => {
    try {
      const response = await api.delete(`/sap/Orders(${docEntry})`);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'deleteOrder');
    }
  },

  // Orders (SalesOrders) - Copy To from Quotation
  createOrderFromQuotation: async (quotationData: any) => {
    try {
      let fullQuote = quotationData;
      if (quotationData?.DocEntry) {
        try {
          const fresh = await api.get(`/sap/Quotations(${quotationData.DocEntry})`);
          if (fresh?.data) {
            fullQuote = fresh.data;
          }
        } catch (e) {
          console.warn('Could not re-fetch quotation before creating order, using passed object');
        }
      }

      const lines = (fullQuote.DocumentLines || []).map((line: any, idx: number) => ({
        BaseType: 23, // Quotations
        BaseEntry: fullQuote.DocEntry,
        BaseLine: line.LineNum !== undefined && line.LineNum !== null ? line.LineNum : idx,
        Quantity: line.Quantity,
        U_B1SYS_RevenueInd2: (line.U_B1SYS_RevenueInd2 && line.U_B1SYS_RevenueInd2 !== '') ? line.U_B1SYS_RevenueInd2 : '1',
        BPL_IDAssignedToInvoice: 1
      }));

      const orderData = {
        CardCode: fullQuote.CardCode,
        DocDueDate: fullQuote.DocDueDate ? fullQuote.DocDueDate.split('T')[0] : new Date().toISOString().split('T')[0],
        BPL_IDAssignedToInvoice: 1,
        U_B1SYS_RevenueInd2: fullQuote.U_B1SYS_RevenueInd2 || '1',
        DocumentLines: lines
      };

      const response = await api.post('/sap/Orders', orderData);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'createOrderFromQuotation');
    }
  }
};
