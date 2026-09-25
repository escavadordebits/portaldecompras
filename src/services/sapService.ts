import axios from 'axios';
import { SAP_CONFIG } from '../config/sapConfig';

const api = axios.create({
  baseURL: '/api',
  timeout: 65000 // Slightly longer than server timeout
});

// Helper to normalize SAP Company database name
export const normalizeSapCompany = (comp?: string): string => {
  if (!comp) return 'SBO_QUALITECH';
  const trimmed = comp.trim();
  if (!trimmed || trimmed === 'SBO_QUALITECH_QAS' || trimmed === 'SBO_QUALITECH_IRML' || trimmed === 'QUALITECH' || trimmed === 'SBO_QUALITECH_') {
    return 'SBO_QUALITECH';
  }
  return trimmed;
};

// Add interceptor to include custom SAP configuration headers if they exist
api.interceptors.request.use((config) => {
  const sapConfigStr = localStorage.getItem('sap_portal_config');
  let currentUrl = SAP_CONFIG.baseUrl;
  let currentUser = SAP_CONFIG.systemUser;
  let currentPassword = SAP_CONFIG.systemPassword;

  if (sapConfigStr) {
    try {
      const parsedConfig = JSON.parse(sapConfigStr);
      if (parsedConfig.url) currentUrl = parsedConfig.url;
      if (parsedConfig.user) currentUser = parsedConfig.user;
      if (parsedConfig.password) currentPassword = parsedConfig.password;
    } catch (e) {
      console.error('Error parsing SAP config from localStorage', e);
    }
  }

  if (currentUrl) config.headers['X-SAP-URL'] = currentUrl;
  if (currentUser) config.headers['X-SAP-User'] = currentUser;
  if (currentPassword) config.headers['X-SAP-Password'] = currentPassword;

  // Add company header from active company or user profile in session/storage
  let rawCompany = sessionStorage.getItem('sap_portal_company') || localStorage.getItem('sap_portal_company');
  if (!rawCompany) {
    try {
      const activeUserStr = sessionStorage.getItem('sap_portal_active_user') || localStorage.getItem('sap_portal_active_user');
      if (activeUserStr) {
        const activeUser = JSON.parse(activeUserStr);
        if (activeUser?.sapCompany) {
          rawCompany = activeUser.sapCompany;
          sessionStorage.setItem('sap_portal_company', normalizeSapCompany(rawCompany));
        }
      }
    } catch (e) {
      console.error('Error resolving active company from user profile', e);
    }
  }
  
  const currentCompany = normalizeSapCompany(rawCompany || SAP_CONFIG.defaultCompany);
  if (rawCompany && rawCompany !== currentCompany) {
    sessionStorage.setItem('sap_portal_company', currentCompany);
    localStorage.setItem('sap_portal_company', currentCompany);
  }

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

export interface ODataQueryOptions {
  skip?: number;
  top?: number;
  search?: string;
  filter?: string;
  orderby?: string;
}

export function buildODataQuery(
  basePath: string, 
  options?: number | ODataQueryOptions, 
  defaultTop = 20, 
  defaultOrderby = 'DocEntry desc'
): string {
  let skip = 0;
  let top = defaultTop;
  let search = '';
  let customFilter = '';
  let orderby = defaultOrderby;

  if (typeof options === 'number') {
    skip = options;
  } else if (typeof options === 'object' && options !== null) {
    if (options.skip !== undefined) skip = options.skip;
    if (options.top !== undefined) top = options.top;
    if (options.search) search = options.search.trim();
    if (options.filter) customFilter = options.filter.trim();
    if (options.orderby) orderby = options.orderby.trim();
  }

  const params: string[] = [];
  if (orderby) params.push(`$orderby=${orderby}`);
  params.push(`$top=${top}`);
  if (skip > 0) params.push(`$skip=${skip}`);

  if (customFilter) {
    params.push(`$filter=${customFilter}`);
  } else if (search) {
    const raw = search.trim();
    // Check if input contains a valid 32-bit positive integer (for DocNum/DocEntry)
    // Matches pure numbers like "1029" or strings like "#1029", "PV 1029"
    const numMatch = raw.match(/^\D*(\d+)\D*$/);
    const numVal = numMatch ? parseInt(numMatch[1], 10) : NaN;
    // SAP 32-bit signed int max is 2147483647
    const hasValidDocNum = !isNaN(numVal) && numVal > 0 && numVal <= 2147483647;

    const safeSearch = raw.replace(/'/g, "''");
    const upper = safeSearch.toUpperCase();
    const lower = safeSearch.toLowerCase();

    const clauses: string[] = [];

    if (hasValidDocNum) {
      clauses.push(`DocNum eq ${numVal}`);
      clauses.push(`DocEntry eq ${numVal}`);
    }

    // SAP HANA contains() is strictly case-sensitive.
    // We add uppercase, lowercase, and original variants to ensure matching regardless of typing case.
    const textFields = ['CardCode', 'CardName', 'NumAtCard', 'Comments'];
    const addedClauses = new Set<string>();

    for (const field of textFields) {
      const upperClause = `contains(${field}, '${upper}')`;
      if (!addedClauses.has(upperClause)) {
        clauses.push(upperClause);
        addedClauses.add(upperClause);
      }
      if (lower !== upper) {
        const lowerClause = `contains(${field}, '${lower}')`;
        if (!addedClauses.has(lowerClause)) {
          clauses.push(lowerClause);
          addedClauses.add(lowerClause);
        }
      }
      if (safeSearch !== upper && safeSearch !== lower) {
        const safeClause = `contains(${field}, '${safeSearch}')`;
        if (!addedClauses.has(safeClause)) {
          clauses.push(safeClause);
          addedClauses.add(safeClause);
        }
      }
    }

    if (clauses.length > 0) {
      params.push(`$filter=${clauses.join(' or ')}`);
    }
  }

  const queryString = params.length > 0 ? `?${params.join('&')}` : '';
  return `${basePath}${queryString}`;
}

export const sapService = {
  login: async (email: string, companyDB?: string) => {
    try {
      const normalizedCompany = normalizeSapCompany(companyDB);
      const response = await api.post('/login', { email, companyDB: normalizedCompany });
      sessionStorage.setItem('sap_portal_company', normalizedCompany);
      localStorage.setItem('sap_portal_company', normalizedCompany);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'login');
    }
  },

  testConnection: async (params?: { companyDB?: string; user?: string; password?: string; url?: string }) => {
    try {
      const normalizedParams = params ? {
        ...params,
        companyDB: normalizeSapCompany(params.companyDB)
      } : {};
      const response = await api.post('/sap/test-connection', normalizedParams);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'testConnection');
    }
  },

  getPurchaseOrders: async (options?: number | ODataQueryOptions) => {
    try {
      const url = buildODataQuery('/sap/PurchaseOrders', options, 20, 'DocEntry desc');
      const response = await api.get(url);
      return response.data.value || [];
    } catch (error) {
      if (typeof options === 'object' && options?.search) {
        try {
          const fallbackUrl = `/sap/PurchaseOrders?$orderby=DocEntry desc&$top=${options.top || 50}&$skip=${options.skip || 0}`;
          const response2 = await api.get(fallbackUrl);
          return response2.data.value || [];
        } catch {
          return handleApiError(error, 'getPurchaseOrders');
        }
      }
      return handleApiError(error, 'getPurchaseOrders');
    }
  },

  getPurchaseRequests: async (options?: number | ODataQueryOptions) => {
    try {
      const url = buildODataQuery('/sap/PurchaseRequests', options, 20, 'DocEntry desc');
      const response = await api.get(url);
      return response.data.value || [];
    } catch (error) {
      if (typeof options === 'object' && options?.search) {
        try {
          const fallbackUrl = `/sap/PurchaseRequests?$orderby=DocEntry desc&$top=${options.top || 50}&$skip=${options.skip || 0}`;
          const response2 = await api.get(fallbackUrl);
          return response2.data.value || [];
        } catch {
          return handleApiError(error, 'getPurchaseRequests');
        }
      }
      return handleApiError(error, 'getPurchaseRequests');
    }
  },

  getPurchaseQuotations: async (options?: number | ODataQueryOptions) => {
    try {
      const url = buildODataQuery('/sap/PurchaseQuotations', options, 20, 'DocEntry desc');
      const response = await api.get(url);
      return response.data.value || [];
    } catch (error) {
      if (typeof options === 'object' && options?.search) {
        try {
          const fallbackUrl = `/sap/PurchaseQuotations?$orderby=DocEntry desc&$top=${options.top || 50}&$skip=${options.skip || 0}`;
          const response2 = await api.get(fallbackUrl);
          return response2.data.value || [];
        } catch {
          return handleApiError(error, 'getPurchaseQuotations');
        }
      }
      return handleApiError(error, 'getPurchaseQuotations');
    }
  },

  getPurchaseDownPayments: async (options?: number | ODataQueryOptions) => {
    try {
      const url = buildODataQuery('/sap/PurchaseDownPayments', options, 20, 'DocEntry desc');
      const response = await api.get(url);
      return response.data.value || [];
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
      const response = await api.get(`/sap/PurchaseRequests(${docEntry})`);
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
      const response = await api.post('/sap/PurchaseRequests', formattedData, {
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
      try {
        const response = await api.get(`/sap/BusinessPartners('${sanitizedCode}')`);
        return response.data;
      } catch {
        const response2 = await api.get(`/sap/BusinessPartners('${sanitizedCode}')?$select=CardCode,CardName,FederalTaxID,EmailAddress,Address,ZipCode,City`);
        return response2.data;
      }
    } catch (error) {
      return handleApiError(error, 'getBusinessPartner');
    }
  },

  getCustomers: async (name?: string) => {
    try {
      let url = "/sap/BusinessPartners?$select=CardCode,CardName,FederalTaxID,Frozen,CardType&$top=100";
      let filter = "(CardType eq 'cCustomer' or CardType eq 'C')";
      if (name && name.trim()) {
        const safe = name.trim().replace(/'/g, "''");
        filter += ` and (contains(CardName, '${safe}') or contains(CardCode, '${safe}'))`;
      }
      try {
        const response = await api.get(`${url}&$filter=${filter}`);
        return (response.data.value || []).filter((bp: any) => bp.Frozen === 'tNO' || bp.Frozen === 'N' || !bp.Frozen);
      } catch (err) {
        const fallbackRes = await api.get("/sap/BusinessPartners?$select=CardCode,CardName,Frozen&$top=100");
        const list = fallbackRes.data.value || [];
        return list.filter((bp: any) => {
          const matchesName = !name || (bp.CardName || '').toLowerCase().includes(name.toLowerCase()) || (bp.CardCode || '').toLowerCase().includes(name.toLowerCase());
          return (bp.Frozen === 'tNO' || bp.Frozen === 'N' || !bp.Frozen) && matchesName;
        });
      }
    } catch (error) {
      return [];
    }
  },

  getCollaborators: async (name?: string) => {
    try {
      let url = "/sap/BusinessPartners?$select=CardCode,CardName,CardType,Frozen&$top=200";
      let filter = "startswith(CardCode, 'CO') or startswith(CardCode, 'co') or startswith(CardCode, 'Co')";
      if (name && name.trim()) {
        const sanitized = name.trim().replace(/'/g, "''");
        filter = `(${filter}) and (contains(CardName, '${sanitized}') or contains(CardCode, '${sanitized}'))`;
      }
      try {
        const response = await api.get(`${url}&$filter=${filter}`);
        const list = response.data?.value || [];
        return list.filter((bp: any) => bp.Frozen === 'tNO' || bp.Frozen === 'N' || !bp.Frozen);
      } catch (err) {
        // Fallback: fetch top partners and filter in-memory for CardCode starting with CO
        console.warn('OData filter startswith failed, falling back to in-memory filter...');
        const fallbackRes = await api.get('/sap/BusinessPartners?$select=CardCode,CardName,Frozen&$top=300');
        const allBps = fallbackRes.data?.value || [];
        return allBps.filter((bp: any) => {
          const code = (bp.CardCode || '').toUpperCase();
          const matchesCO = code.startsWith('CO');
          const matchesName = !name || (bp.CardName || '').toLowerCase().includes(name.toLowerCase()) || code.includes(name.toUpperCase());
          const isActive = bp.Frozen === 'tNO' || bp.Frozen === 'N' || !bp.Frozen;
          return matchesCO && matchesName && isActive;
        });
      }
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
      const [distRules, profitCenters, sapProjects] = await Promise.all([
        api.get("/sap/DistributionRules?$filter=Active eq 'tYES' and InWhichDimension eq 4&$select=FactorCode,FactorDescription&$top=1000").catch(() => ({ data: { value: [] } })),
        api.get("/sap/ProfitCenters?$filter=Active eq 'tYES' and InWhichDimension eq 4&$select=CenterCode,CenterName&$top=1000").catch(() => ({ data: { value: [] } })),
        api.get("/sap/Projects?$select=Code,Name&$top=1000").catch(() => ({ data: { value: [] } }))
      ]);

      const map = new Map<string, { Code: string; Name: string }>();
      
      const dList = distRules.data?.value || [];
      for (const d of dList) {
        const code = String(d.FactorCode || '').trim();
        if (code) map.set(code, { Code: code, Name: d.FactorDescription ? `${code} - ${d.FactorDescription}` : code });
      }

      const pList = profitCenters.data?.value || [];
      for (const p of pList) {
        const code = String(p.CenterCode || '').trim();
        if (code && !map.has(code)) {
          map.set(code, { Code: code, Name: p.CenterName ? `${code} - ${p.CenterName}` : code });
        }
      }

      const sList = sapProjects.data?.value || [];
      for (const s of sList) {
        const code = String(s.Code || '').trim();
        if (code && !map.has(code)) {
          map.set(code, { Code: code, Name: s.Name ? `${code} - ${s.Name}` : code });
        }
      }

      // Ensure 'BASE' is always available as fallback project
      if (!map.has('BASE')) {
        map.set('BASE', { Code: 'BASE', Name: 'BASE' });
      }

      return Array.from(map.values());
    } catch (error: any) {
      return [{ Code: 'BASE', Name: 'BASE' }];
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

  // Calibration Records (QLT_CALIB / U_QLT_CALIB)
  getCalibrationRecords: async () => {
    try {
      const response = await api.get('/sap/U_QLT_CALIB?$top=50&$orderby=DocEntry desc');
      return response.data.value || [];
    } catch (error) {
      try {
        const response2 = await api.get('/sap/QLT_CALIB?$top=50&$orderby=DocEntry desc');
        return response2.data.value || [];
      } catch (err2) {
        try {
          const response3 = await api.get('/sap/U_QLT_CALIBRACAO?$top=50');
          return response3.data.value || [];
        } catch (err3) {
          console.warn('Calibration records endpoint not found in SAP, returning empty list');
          return [];
        }
      }
    }
  },

  getCalibrationDetail: async (docEntry: number) => {
    try {
      const response = await api.get(`/sap/U_QLT_CALIB(${docEntry})`);
      return response.data;
    } catch (error) {
      try {
        const response2 = await api.get(`/sap/QLT_CALIB(${docEntry})`);
        return response2.data;
      } catch (err2) {
        return handleApiError(error, 'getCalibrationDetail');
      }
    }
  },

  createCalibrationRecord: async (data: any) => {
    try {
      const response = await api.post('/sap/U_QLT_CALIB', data);
      return response.data;
    } catch (error) {
      try {
        const response2 = await api.post('/sap/QLT_CALIB', data);
        return response2.data;
      } catch (err2) {
        return handleApiError(error, 'createCalibrationRecord');
      }
    }
  },

  updateCalibrationRecord: async (docEntry: number, data: any) => {
    try {
      const response = await api.patch(`/sap/U_QLT_CALIB(${docEntry})`, data);
      return response.data;
    } catch (error) {
      try {
        const response2 = await api.patch(`/sap/QLT_CALIB(${docEntry})`, data);
        return response2.data;
      } catch (err2) {
        return handleApiError(error, 'updateCalibrationRecord');
      }
    }
  },

  deleteCalibrationRecord: async (docEntry: number) => {
    try {
      await api.delete(`/sap/U_QLT_CALIB(${docEntry})`);
      return true;
    } catch (error) {
      try {
        await api.delete(`/sap/QLT_CALIB(${docEntry})`);
        return true;
      } catch (err2) {
        return handleApiError(error, 'deleteCalibrationRecord');
      }
    }
  },

  // Cost Management (CustosPessoal & CustosLoc - UDOs linked to @CUSTOSPESSOAL and @CUSTOSLOC)
  getPersonnelCosts: async () => {
    try {
      const response = await api.get('/sap/CustosPessoal?$top=100&$orderby=DocEntry desc');
      return response.data.value || [];
    } catch (error) {
      try {
        const response2 = await api.get('/sap/U_CustosPessoal?$top=100');
        return response2.data.value || [];
      } catch (err2) {
        console.warn('Personnel costs endpoint not found in SAP, returning empty list');
        return [];
      }
    }
  },

  getPersonnelCost: async (code: string | number) => {
    const cleanCode = String(code).trim();
    try {
      const response = await api.get(`/sap/CustosPessoal('${cleanCode}')`);
      return response.data;
    } catch (error) {
      try {
        const response2 = await api.get(`/sap/CustosPessoal?$filter=Code eq '${cleanCode}'`);
        if (response2.data.value && response2.data.value.length > 0) {
          return response2.data.value[0];
        }
      } catch (err2) {
        // continue
      }
      return handleApiError(error, 'getPersonnelCost');
    }
  },

  getNextPersonnelCostCode: async (): Promise<string> => {
    try {
      const res = await api.get('/sap/CustosPessoal?$top=200&$select=Code,DocEntry');
      const list = res.data.value || [];
      let maxNum = 0;
      for (const item of list) {
        const match = String(item.Code).match(/^(\d+)$/);
        if (match) {
          const val = parseInt(match[1], 10);
          if (val > maxNum && val < 100000) maxNum = val;
        }
      }
      return String(maxNum + 1);
    } catch {
      return String(Date.now());
    }
  },

  getRentalCosts: async () => {
    try {
      const response = await api.get('/sap/CustosLoc?$top=100&$orderby=DocEntry desc');
      return response.data.value || [];
    } catch (error) {
      try {
        const response2 = await api.get('/sap/U_CustosLoc?$top=100');
        return response2.data.value || [];
      } catch (err2) {
        console.warn('Rental costs endpoint not found in SAP, returning empty list');
        return [];
      }
    }
  },

  getRentalCost: async (code: string | number) => {
    const cleanCode = String(code).trim();
    try {
      const response = await api.get(`/sap/CustosLoc('${cleanCode}')`);
      return response.data;
    } catch (error) {
      try {
        const response2 = await api.get(`/sap/CustosLoc?$filter=Code eq '${cleanCode}'`);
        if (response2.data.value && response2.data.value.length > 0) {
          return response2.data.value[0];
        }
      } catch (err2) {
        // continue
      }
      return handleApiError(error, 'getRentalCost');
    }
  },

  getNextRentalCostCode: async (): Promise<string> => {
    try {
      const res = await api.get('/sap/CustosLoc?$top=200&$select=Code,DocEntry');
      const list = res.data.value || [];
      let maxNum = 0;
      for (const item of list) {
        const match = String(item.Code).match(/^(\d+)$/);
        if (match) {
          const val = parseInt(match[1], 10);
          if (val > maxNum && val < 100000) maxNum = val;
        }
      }
      return String(maxNum + 1);
    } catch {
      return String(Date.now());
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

  updatePersonnelCost: async (code: string | number, data: any) => {
    const cleanCode = String(code).trim();
    try {
      const response = await api.patch(`/sap/CustosPessoal('${cleanCode}')`, data);
      return response.data;
    } catch (error) {
      try {
        const response2 = await api.patch(`/sap/CustosPessoal(${cleanCode})`, data);
        return response2.data;
      } catch (err2) {
        return handleApiError(error, 'updatePersonnelCost');
      }
    }
  },

  deletePersonnelCost: async (code: string | number) => {
    const cleanCode = String(code).trim();
    try {
      const response = await api.delete(`/sap/CustosPessoal('${cleanCode}')`);
      return response.data;
    } catch (error) {
      try {
        const response2 = await api.delete(`/sap/CustosPessoal(${cleanCode})`);
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

  updateRentalCost: async (code: string | number, data: any) => {
    const cleanCode = String(code).trim();
    try {
      const response = await api.patch(`/sap/CustosLoc('${cleanCode}')`, data);
      return response.data;
    } catch (error) {
      try {
        const response2 = await api.patch(`/sap/CustosLoc(${cleanCode})`, data);
        return response2.data;
      } catch (err2) {
        return handleApiError(error, 'updateRentalCost');
      }
    }
  },

  deleteRentalCost: async (code: string | number) => {
    const cleanCode = String(code).trim();
    try {
      const response = await api.delete(`/sap/CustosLoc('${cleanCode}')`);
      return response.data;
    } catch (error) {
      try {
        const response2 = await api.delete(`/sap/CustosLoc(${cleanCode})`);
        return response2.data;
      } catch (err2) {
        return handleApiError(error, 'deleteRentalCost');
      }
    }
  },

  // Quotations (SalesQuotations)
  getQuotations: async (options?: number | ODataQueryOptions) => {
    try {
      const url = buildODataQuery('/sap/Quotations', options, 20, 'DocEntry desc');
      const response = await api.get(url);
      return response.data.value || [];
    } catch (error) {
      if (typeof options === 'object' && options?.search) {
        try {
          const fallbackUrl = `/sap/Quotations?$orderby=DocEntry desc&$top=${options.top || 50}&$skip=${options.skip || 0}`;
          const response2 = await api.get(fallbackUrl);
          return response2.data.value || [];
        } catch {
          return handleApiError(error, 'getQuotations');
        }
      }
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
      // Fix for Brazilian localization mandatory field and project dimensions
      const sanitizeData = (obj: any) => {
        const sanitized = { ...obj };
        if (!sanitized.U_B1SYS_RevenueInd2 || sanitized.U_B1SYS_RevenueInd2 === '') {
          sanitized.U_B1SYS_RevenueInd2 = '1';
        }
        // Force BPL_IDAssignedToInvoice to 1 for all sales documents
        sanitized.BPL_IDAssignedToInvoice = 1;
        const project = sanitized.CostingCode4 || sanitized.U_Projeto || sanitized.Project || sanitized.ProjectCode || 'BASE';
        if (project && project !== 'BASE') {
          sanitized.Project = project;
        }

        if (sanitized.DocumentLines && Array.isArray(sanitized.DocumentLines)) {
          sanitized.DocumentLines = sanitized.DocumentLines.map((line: any) => {
            const lineProj = line.CostingCode4 || line.ProjectCode || project || 'BASE';
            return {
              ...line,
              CostingCode: line.CostingCode || 'BR',
              CostingCode2: line.CostingCode2 || 'MATRIZ',
              CostingCode3: line.CostingCode3 || 'OPER_OFF',
              CostingCode4: lineProj,
              ProjectCode: (line.ProjectCode && line.ProjectCode !== '') ? line.ProjectCode : (lineProj !== 'BASE' ? lineProj : undefined),
              U_B1SYS_RevenueInd2: (line.U_B1SYS_RevenueInd2 && line.U_B1SYS_RevenueInd2 !== '') ? line.U_B1SYS_RevenueInd2 : '1',
              BPL_IDAssignedToInvoice: 1
            };
          });
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
      // Fix for Brazilian localization mandatory field and project dimensions
      const sanitizeData = (obj: any) => {
        const sanitized = { ...obj };
        if (!sanitized.U_B1SYS_RevenueInd2 || sanitized.U_B1SYS_RevenueInd2 === '') {
          sanitized.U_B1SYS_RevenueInd2 = '1';
        }
        // Force BPL_IDAssignedToInvoice to 1 for all sales documents
        sanitized.BPL_IDAssignedToInvoice = 1;
        const project = sanitized.CostingCode4 || sanitized.U_Projeto || sanitized.Project || sanitized.ProjectCode || 'BASE';
        if (project && project !== 'BASE') {
          sanitized.Project = project;
        }

        if (sanitized.DocumentLines && Array.isArray(sanitized.DocumentLines)) {
          sanitized.DocumentLines = sanitized.DocumentLines.map((line: any) => {
            const lineProj = line.CostingCode4 || line.ProjectCode || project || 'BASE';
            return {
              ...line,
              CostingCode: line.CostingCode || 'BR',
              CostingCode2: line.CostingCode2 || 'MATRIZ',
              CostingCode3: line.CostingCode3 || 'OPER_OFF',
              CostingCode4: lineProj,
              ProjectCode: (line.ProjectCode && line.ProjectCode !== '') ? line.ProjectCode : (lineProj !== 'BASE' ? lineProj : undefined),
              U_B1SYS_RevenueInd2: (line.U_B1SYS_RevenueInd2 && line.U_B1SYS_RevenueInd2 !== '') ? line.U_B1SYS_RevenueInd2 : '1',
              BPL_IDAssignedToInvoice: 1
            };
          });
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
  getOrders: async (options?: number | ODataQueryOptions) => {
    try {
      const url = buildODataQuery('/sap/Orders', options, 20, 'DocEntry desc');
      const response = await api.get(url);
      return response.data.value || [];
    } catch (error) {
      if (typeof options === 'object' && options?.search) {
        const raw = options.search.trim();
        const numMatch = raw.match(/^\D*(\d+)\D*$/);
        if (numMatch) {
          const numVal = parseInt(numMatch[1], 10);
          if (numVal > 0 && numVal <= 2147483647) {
            try {
              const resNum = await api.get(`/sap/Orders?$filter=DocNum eq ${numVal} or DocEntry eq ${numVal}`);
              if (resNum.data.value && resNum.data.value.length > 0) return resNum.data.value;
            } catch (e) {
              console.warn('Fallback DocNum search error:', e);
            }
          }
        }
        try {
          const safe = raw.replace(/'/g, "''").toUpperCase();
          const resText = await api.get(`/sap/Orders?$top=${options.top || 20}&$skip=${options.skip || 0}&$filter=contains(CardName, '${safe}') or contains(CardCode, '${safe}')`);
          if (resText.data.value && resText.data.value.length > 0) return resText.data.value;
        } catch (e) {
          console.warn('Fallback text search error:', e);
        }
      }
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
      const today = new Date().toISOString().split('T')[0];
      const headerProject = data.CostingCode4 || data.U_Projeto || data.Project || data.ProjectCode || 'BASE';

      const sanitizedLines = (data.DocumentLines || []).map((line: any) => {
        const uNItem = line.U_nItem ?? line.U_nITEM ?? line.U_NItem;
        const uItemLoc = line.U_ItemLoc ?? line.U_ITEMLOC;
        const lineProject = line.CostingCode4 || line.ProjectCode || headerProject || 'BASE';

        return {
          ItemCode: line.ItemCode,
          ItemDescription: line.ItemDescription || line.ItemName || line.Dscription || undefined,
          Quantity: Number(line.Quantity) || 1,
          UnitPrice: Number(line.Price ?? line.UnitPrice ?? 0),
          CostingCode: line.CostingCode || 'BR',
          CostingCode2: line.CostingCode2 || 'MATRIZ',
          CostingCode3: line.CostingCode3 || 'OPER_OFF',
          CostingCode4: lineProject,
          CostingCode5: line.CostingCode5 || undefined,
          ProjectCode: (line.ProjectCode && line.ProjectCode !== '') ? line.ProjectCode : (lineProject !== 'BASE' ? lineProject : undefined),
          U_nItem: (uNItem !== null && uNItem !== undefined && uNItem !== '') ? String(uNItem) : null,
          U_ItemLoc: (uItemLoc !== null && uItemLoc !== undefined && uItemLoc !== '') ? String(uItemLoc) : null,
          U_B1SYS_RevenueInd2: (line.U_B1SYS_RevenueInd2 && line.U_B1SYS_RevenueInd2 !== '') ? line.U_B1SYS_RevenueInd2 : '1',
          BPL_IDAssignedToInvoice: 1
        };
      });

      const payload: any = {
        CardCode: data.CardCode,
        DocDate: today,
        TaxDate: today,
        DocDueDate: data.DocDueDate ? data.DocDueDate.split('T')[0] : today,
        Comments: data.Comments || '',
        NumAtCard: data.NumAtCard || data.U_POCliente || '',
        BPL_IDAssignedToInvoice: 1,
        DocumentLines: sanitizedLines
      };

      if (headerProject && headerProject !== 'BASE') {
        payload.Project = headerProject;
      }
      if (data.U_Projeto || data.Project || data.ProjectCode) {
        payload.U_Projeto = data.U_Projeto || data.Project || data.ProjectCode;
      }
      if (data.U_POCliente) {
        payload.U_POCliente = data.U_POCliente;
      }

      const response = await api.post('/sap/Orders', payload);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'createOrder');
    }
  },

  updateOrder: async (docEntry: number, data: any) => {
    try {
      const headerProject = data.CostingCode4 || data.U_Projeto || data.Project || data.ProjectCode || 'BASE';
      const sanitizedLines = (data.DocumentLines || []).map((line: any, idx: number) => {
        const lineNum = typeof line.LineNum === 'number' ? line.LineNum : idx;
        const uNItem = line.U_nItem ?? line.U_nITEM ?? line.U_NItem;
        const uItemLoc = line.U_ItemLoc ?? line.U_ITEMLOC;
        const lineProject = line.CostingCode4 || line.ProjectCode || headerProject || 'BASE';

        return {
          LineNum: lineNum,
          ItemCode: line.ItemCode,
          ItemDescription: line.ItemDescription || line.ItemName || line.Dscription || undefined,
          Quantity: Number(line.Quantity) || 1,
          UnitPrice: Number(line.Price ?? line.UnitPrice ?? 0),
          CostingCode: line.CostingCode || 'BR',
          CostingCode2: line.CostingCode2 || 'MATRIZ',
          CostingCode3: line.CostingCode3 || 'OPER_OFF',
          CostingCode4: lineProject,
          CostingCode5: line.CostingCode5 || undefined,
          ProjectCode: (line.ProjectCode && line.ProjectCode !== '') ? line.ProjectCode : (lineProject !== 'BASE' ? lineProject : undefined),
          U_nItem: (uNItem !== null && uNItem !== undefined && uNItem !== '') ? String(uNItem) : null,
          U_ItemLoc: (uItemLoc !== null && uItemLoc !== undefined && uItemLoc !== '') ? String(uItemLoc) : null,
          U_B1SYS_RevenueInd2: (line.U_B1SYS_RevenueInd2 && line.U_B1SYS_RevenueInd2 !== '') ? line.U_B1SYS_RevenueInd2 : '1',
          BPL_IDAssignedToInvoice: 1
        };
      });

      const patchPayload: any = {
        Comments: data.Comments || '',
        NumAtCard: data.NumAtCard || data.U_POCliente || '',
        BPL_IDAssignedToInvoice: 1,
        DocumentLines: sanitizedLines
      };

      if (data.DocDueDate) {
        patchPayload.DocDueDate = data.DocDueDate.split('T')[0];
      }
      if (headerProject && headerProject !== 'BASE') {
        patchPayload.Project = headerProject;
      }
      if (data.U_Projeto || data.Project || data.ProjectCode) {
        patchPayload.U_Projeto = data.U_Projeto || data.Project || data.ProjectCode;
      }
      if (data.U_POCliente) {
        patchPayload.U_POCliente = data.U_POCliente;
      }

      const response = await api.patch(`/sap/Orders(${docEntry})`, patchPayload);
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

      // Resolve the project code (Dimension 4 - Projetos in SAP)
      const headerProject = quotationData?.CostingCode4 || 
                            quotationData?.U_Projeto || 
                            quotationData?.Project || 
                            quotationData?.ProjectCode || 
                            fullQuote?.CostingCode4 || 
                            fullQuote?.U_Projeto ||
                            fullQuote?.Project || 
                            fullQuote?.ProjectCode || 
                            'BASE';

      const lines = (fullQuote.DocumentLines || []).map((line: any, idx: number) => {
        const matchingPassedLine = quotationData?.DocumentLines?.[idx] || 
                                   (quotationData?.DocumentLines && quotationData.DocumentLines.find((l: any) => l.LineNum === line.LineNum));
        const lineProject = line.CostingCode4 || 
                            matchingPassedLine?.CostingCode4 || 
                            matchingPassedLine?.ProjectCode || 
                            line.ProjectCode || 
                            headerProject || 
                            'BASE';

        const uNItem = line.U_nItem ?? line.U_nITEM ?? matchingPassedLine?.U_nItem ?? matchingPassedLine?.U_nITEM;
        const uItemLoc = line.U_ItemLoc ?? line.U_ITEMLOC ?? matchingPassedLine?.U_ItemLoc ?? matchingPassedLine?.U_ITEMLOC;

        return {
          BaseType: 23, // Quotations
          BaseEntry: fullQuote.DocEntry,
          BaseLine: line.LineNum !== undefined && line.LineNum !== null ? line.LineNum : idx,
          Quantity: line.Quantity,
          CostingCode: line.CostingCode || matchingPassedLine?.CostingCode || 'BR',
          CostingCode2: line.CostingCode2 || matchingPassedLine?.CostingCode2 || 'MATRIZ',
          CostingCode3: line.CostingCode3 || matchingPassedLine?.CostingCode3 || 'OPER_OFF',
          CostingCode4: lineProject,
          ProjectCode: (line.ProjectCode && line.ProjectCode !== '') ? line.ProjectCode : (lineProject !== 'BASE' ? lineProject : undefined),
          U_nItem: (uNItem !== null && uNItem !== undefined && uNItem !== '') ? String(uNItem) : undefined,
          U_ItemLoc: (uItemLoc !== null && uItemLoc !== undefined && uItemLoc !== '') ? String(uItemLoc) : undefined,
          U_B1SYS_RevenueInd2: (line.U_B1SYS_RevenueInd2 && line.U_B1SYS_RevenueInd2 !== '') ? line.U_B1SYS_RevenueInd2 : '1',
          BPL_IDAssignedToInvoice: 1
        };
      });

      const orderData: any = {
        CardCode: fullQuote.CardCode,
        DocDueDate: fullQuote.DocDueDate ? fullQuote.DocDueDate.split('T')[0] : new Date().toISOString().split('T')[0],
        BPL_IDAssignedToInvoice: 1,
        U_B1SYS_RevenueInd2: fullQuote.U_B1SYS_RevenueInd2 || '1',
        Comments: fullQuote.Comments || quotationData?.Comments || undefined,
        NumAtCard: fullQuote.NumAtCard || quotationData?.NumAtCard || fullQuote.U_POCliente || quotationData?.U_POCliente || undefined,
        DocumentLines: lines
      };

      if (headerProject && headerProject !== 'BASE') {
        orderData.Project = headerProject;
      }
      if (quotationData?.U_POCliente || fullQuote?.U_POCliente) {
        orderData.U_POCliente = quotationData?.U_POCliente || fullQuote?.U_POCliente;
      }
      if (headerProject) {
        orderData.U_Projeto = headerProject;
      }

      const response = await api.post('/sap/Orders', orderData);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'createOrderFromQuotation');
    }
  }
};
