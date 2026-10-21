import axios from 'axios';
import { SAP_CONFIG } from '../config/sapConfig';
import { matchPartnerQuery } from '../utils/taxUtils';

const api = axios.create({
  baseURL: '/api',
  timeout: 65000 // Slightly longer than server timeout
});

// In-memory cache for customers
let _cachedCustomers: any[] | null = null;
let _cachedCustomersPromise: Promise<any[]> | null = null;

// Helper to normalize SAP Company database name
export const normalizeSapCompany = (comp?: string): string => {
  if (!comp) return 'SBO_QUALITECH';
  const trimmed = comp.trim();
  if (!trimmed || trimmed === 'QUALITECH' || trimmed === 'SBO_QUALITECH_') {
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
const handleApiError = (error: any, context: string): any => {
  const errorData = error.response?.data;
  const isHtml = typeof errorData === 'string' && (errorData.includes('<!DOCTYPE') || errorData.includes('<html'));
  const isTransient = error.response?.status === 503 || error.response?.status === 502 || error.response?.status === 504;
  
  if (isHtml || error.response?.status === 404) {
    console.warn(`API Warning (${context}): Endpoint 404 Not Found or returned HTML page.`);
    return [];
  } else if (isTransient) {
    console.warn(`API Warning (${context}): SAP Service Layer temporariamente indisponível (${error.response?.status}).`);
    return [];
  } else {
    console.warn(`API Error (${context}):`, errorData || error.message);
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

    // Special handling for ForSea / ForeSea
    if (upper.includes('FORSEA') || upper.includes('FORESEA')) {
      const foreseaClause = `contains(CardName, 'FORESEA')`;
      if (!addedClauses.has(foreseaClause)) {
        clauses.push(foreseaClause);
        addedClauses.add(foreseaClause);
      }
      clauses.push(`CardCode eq 'C000016'`);
    }

    // Dynamic resolution from cached customer base (matches CNPJ, fuzzy names, etc.)
    if (_cachedCustomers && _cachedCustomers.length > 0) {
      const matches = _cachedCustomers.filter(c => matchPartnerQuery(c, raw));
      for (const m of matches.slice(0, 5)) {
        if (m.CardCode) {
          const codeEq = `CardCode eq '${m.CardCode}'`;
          if (!addedClauses.has(codeEq)) {
            clauses.push(codeEq);
            addedClauses.add(codeEq);
          }
        }
        if (m.CardName) {
          const nameClause = `contains(CardName, '${m.CardName.replace(/'/g, "''")}')`;
          if (!addedClauses.has(nameClause)) {
            clauses.push(nameClause);
            addedClauses.add(nameClause);
          }
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

// Helper to safely resolve financial project code (only if valid in SAP OPRJ table, never 'BASE' or invalid codes)
export const resolveSapFinancialProject = (proj?: string | null): string | undefined => {
  if (!proj) return undefined;
  const clean = String(proj).trim();
  if (!clean || clean.toUpperCase() === 'BASE') return undefined;
  // In this tenant, the OPRJ table only has 'RIG PASS'
  if (clean.toUpperCase() === 'RIG PASS') return 'RIG PASS';
  return undefined;
};

/**
 * Safely extracts the Work Order (WO) / Project identification for a sales document (Order or Quotation).
 * Checks the header fields first, and importantly checks all DocumentLines (CostingCode4, ProjectCode, U_Projeto, U_WO, etc.).
 * Ensures that even when the WO is stored only at the line level (e.g. in CostingCode4), it is displayed in search lists and details.
 */
export const getDocumentWO = (doc: any): string => {
  if (!doc) return '-';

  // 1. Direct header project or WO
  const headerWO = doc.CostingCode4 || doc.U_Projeto || doc.Project || doc.ProjectCode || doc.U_WO || doc.U_NumWO;
  if (headerWO && String(headerWO).trim() !== '') {
    return String(headerWO).trim();
  }

  // 2. Lines (DocumentLines) - "O campo WO que esta na linha deve ser exibido mesmo que em linha deve ser exibido na lista de pesquisa"
  if (Array.isArray(doc.DocumentLines) && doc.DocumentLines.length > 0) {
    const lineWos = doc.DocumentLines
      .map((l: any) => l.CostingCode4 || l.ProjectCode || l.U_Projeto || l.U_WO || l.U_NumWO || l.Project)
      .filter((w: any) => w && String(w).trim() !== '');

    if (lineWos.length > 0) {
      const unique = Array.from(new Set(lineWos.map((w: any) => String(w).trim())));
      return unique.join(', ');
    }
  }

  return '-';
};

export const isServiceOrder = (order: any): boolean => {
  if (!order) return false;
  const usage = order.TaxExtension?.MainUsage ?? order.MainUsage ?? order.mainusage ?? (order.DocumentLines && order.DocumentLines.length > 0 ? order.DocumentLines[0]?.Usage : undefined);
  return Number(usage) === 9;
};

export const sapService = {
  isServiceOrder,
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
      let url = "/sap/BusinessPartners?$select=CardCode,CardName,FederalTaxID,Frozen,CardType,BPFiscalTaxIDCollection&$top=100";
      let filter = "(CardType eq 'cCustomer' or CardType eq 'C')";
      if (name && name.trim()) {
        const safe = name.trim().replace(/'/g, "''");
        const digits = safe.replace(/\D/g, '');
        let qClause = `contains(CardName, '${safe}') or contains(CardCode, '${safe}') or contains(FederalTaxID, '${safe}')`;
        if (digits && digits.length >= 3) {
          qClause += ` or contains(FederalTaxID, '${digits}')`;
        }
        filter += ` and (${qClause})`;
      }
      try {
        const response = await api.get(`${url}&$filter=${filter}`);
        const list = (response.data.value || []).map((bp: any) => {
          let taxId = bp.FederalTaxID;
          if (!taxId && bp.BPFiscalTaxIDCollection && bp.BPFiscalTaxIDCollection.length > 0) {
            const fiscalEntry = bp.BPFiscalTaxIDCollection.find((f: any) => f.TaxId0 || f.TaxId4);
            if (fiscalEntry) {
              taxId = fiscalEntry.TaxId0 || fiscalEntry.TaxId4;
            }
          }
          return { ...bp, FederalTaxID: taxId };
        });
        return list.filter((bp: any) => bp.Frozen === 'tNO' || bp.Frozen === 'N' || !bp.Frozen);
      } catch (err) {
        const fallbackRes = await api.get("/sap/BusinessPartners?$select=CardCode,CardName,FederalTaxID,Frozen,CardType,BPFiscalTaxIDCollection&$top=100");
        const list = (fallbackRes.data.value || []).map((bp: any) => {
          let taxId = bp.FederalTaxID;
          if (!taxId && bp.BPFiscalTaxIDCollection && bp.BPFiscalTaxIDCollection.length > 0) {
            const fiscalEntry = bp.BPFiscalTaxIDCollection.find((f: any) => f.TaxId0 || f.TaxId4);
            if (fiscalEntry) {
              taxId = fiscalEntry.TaxId0 || fiscalEntry.TaxId4;
            }
          }
          return { ...bp, FederalTaxID: taxId };
        });
        return list.filter((bp: any) => {
          const matchesName = !name || 
            (bp.CardName || '').toLowerCase().includes(name.toLowerCase()) || 
            (bp.CardCode || '').toLowerCase().includes(name.toLowerCase()) ||
            (bp.FederalTaxID || '').replace(/\D/g, '').includes(name.replace(/\D/g, ''));
          return (bp.Frozen === 'tNO' || bp.Frozen === 'N' || !bp.Frozen) && matchesName;
        });
      }
    } catch (error) {
      return [];
    }
  },

  getAllCustomers: async (forceRefresh = false): Promise<any[]> => {
    // 1. Memory cache check
    if (!forceRefresh && _cachedCustomers && _cachedCustomers.length > 0) {
      return _cachedCustomers;
    }

    // 2. In-flight promise reuse
    if (!forceRefresh && _cachedCustomersPromise) {
      return _cachedCustomersPromise;
    }

    // 3. SessionStorage check
    if (!forceRefresh && typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem('sap_cached_customers_v1');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            _cachedCustomers = parsed;
            return parsed;
          }
        }
      } catch {}
    }

    _cachedCustomersPromise = (async () => {
      try {
        let all: any[] = [];
        // First page to inspect count and nextLink
        const firstRes = await api.get('/sap/BusinessPartners?$select=CardCode,CardName,FederalTaxID,Frozen,CardType,BPFiscalTaxIDCollection&$filter=(CardType eq \'cCustomer\' or CardType eq \'C\')&$skip=0');
        const firstVal = firstRes.data?.value || [];
        all.push(...firstVal);

        if (firstRes.data?.['odata.nextLink']) {
          // Parallel fetch remaining pages for instant loading
          const skips = [20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220];
          const results = await Promise.all(
            skips.map(s => 
              api.get(`/sap/BusinessPartners?$select=CardCode,CardName,FederalTaxID,Frozen,CardType,BPFiscalTaxIDCollection&$filter=(CardType eq 'cCustomer' or CardType eq 'C')&$skip=${s}`)
                .then(r => r.data?.value || [])
                .catch(() => [])
            )
          );
          for (const list of results) {
            all.push(...list);
          }
        }

        // Deduplicate by CardCode
        const seen = new Set<string>();
        const unique: any[] = [];
        for (const bp of all) {
          if (bp.CardCode && !seen.has(bp.CardCode)) {
            seen.add(bp.CardCode);
            unique.push(bp);
          }
        }

        const mapped = unique.map((bp: any) => {
          let taxId = bp.FederalTaxID;
          if (!taxId && bp.BPFiscalTaxIDCollection && bp.BPFiscalTaxIDCollection.length > 0) {
            const fiscalEntry = bp.BPFiscalTaxIDCollection.find((f: any) => f.TaxId0 || f.TaxId4);
            if (fiscalEntry) {
              taxId = fiscalEntry.TaxId0 || fiscalEntry.TaxId4;
            }
          }
          return { ...bp, FederalTaxID: taxId };
        }).filter((bp: any) => bp.Frozen === 'tNO' || bp.Frozen === 'N' || !bp.Frozen);

        _cachedCustomers = mapped;
        if (typeof window !== 'undefined' && mapped.length > 0) {
          try {
            sessionStorage.setItem('sap_cached_customers_v1', JSON.stringify(mapped));
          } catch {}
        }
        return mapped;
      } catch (err) {
        console.warn('Erro ao carregar lista de clientes:', err);
        return _cachedCustomers || [];
      } finally {
        _cachedCustomersPromise = null;
      }
    })();

    return _cachedCustomersPromise;
  },

  findCustomerMatch: (query?: string | null): any | null => {
    if (!query || !query.trim() || !_cachedCustomers) return null;
    const q = query.trim();
    const exactCode = _cachedCustomers.find((c: any) => c.CardCode?.toLowerCase() === q.toLowerCase());
    if (exactCode) return exactCode;
    const exactName = _cachedCustomers.find((c: any) => c.CardName?.toLowerCase() === q.toLowerCase());
    if (exactName) return exactName;
    return _cachedCustomers.find((c: any) => matchPartnerQuery(c, q)) || null;
  },

  searchBusinessPartnersWithTaxId: async (query?: string, partnerType: 'customer' | 'supplier' | 'all' = 'all') => {
    try {
      // 1. If searching customers, load full customer base and apply smart/fuzzy/CNPJ matching
      if (partnerType === 'customer') {
        const allCust = await sapService.getAllCustomers();
        if (!query || !query.trim()) {
          return allCust;
        }
        return allCust.filter((c: any) => matchPartnerQuery(c, query));
      }

      // 2. For suppliers or all partners, query SAP Service Layer with multi-case search
      let url = "/sap/BusinessPartners?$select=CardCode,CardName,FederalTaxID,Frozen,CardType,BPFiscalTaxIDCollection&$top=100";
      let filter = "";
      if (partnerType === 'supplier') {
        filter = "(CardType eq 'cSupplier' or CardType eq 'S')";
      }

      if (query && query.trim()) {
        const safe = query.trim().replace(/'/g, "''");
        const upper = safe.toUpperCase();
        const lower = safe.toLowerCase();
        const digits = safe.replace(/\D/g, '');

        const clauses: string[] = [
          `contains(CardName, '${upper}')`,
          `contains(CardCode, '${upper}')`
        ];
        if (safe !== upper) {
          clauses.push(`contains(CardName, '${safe}')`);
          clauses.push(`contains(CardCode, '${safe}')`);
        }
        if (lower !== upper && lower !== safe) {
          clauses.push(`contains(CardName, '${lower}')`);
        }
        if (upper === 'FORSEA') {
          clauses.push(`contains(CardName, 'FORESEA')`);
        }
        if (digits && digits.length >= 3) {
          clauses.push(`contains(FederalTaxID, '${digits}')`);
          clauses.push(`contains(FederalTaxID, '${safe}')`);
        }

        const qFilter = clauses.join(' or ');
        filter = filter ? `${filter} and (${qFilter})` : qFilter;
      }

      const fullUrl = filter ? `${url}&$filter=${filter}` : url;
      try {
        const response = await api.get(fullUrl);
        const list = (response.data?.value || []).map((bp: any) => {
          let taxId = bp.FederalTaxID;
          if (!taxId && bp.BPFiscalTaxIDCollection && bp.BPFiscalTaxIDCollection.length > 0) {
            const fiscalEntry = bp.BPFiscalTaxIDCollection.find((f: any) => f.TaxId0 || f.TaxId4);
            if (fiscalEntry) {
              taxId = fiscalEntry.TaxId0 || fiscalEntry.TaxId4;
            }
          }
          return { ...bp, FederalTaxID: taxId };
        });
        const activeList = list.filter((bp: any) => bp.Frozen === 'tNO' || bp.Frozen === 'N' || !bp.Frozen);
        if (query && query.trim()) {
          return activeList.filter((bp: any) => matchPartnerQuery(bp, query));
        }
        return activeList;
      } catch (err) {
        const fallbackRes = await api.get("/sap/BusinessPartners?$select=CardCode,CardName,FederalTaxID,Frozen,CardType&$top=150");
        const list = fallbackRes.data?.value || [];
        return list.filter((bp: any) => {
          if (bp.Frozen === 'tYES' || bp.Frozen === 'Y') return false;
          if (partnerType === 'supplier' && bp.CardType !== 'cSupplier' && bp.CardType !== 'S') return false;
          return matchPartnerQuery(bp, query);
        });
      }
    } catch (e) {
      console.warn('Erro ao pesquisar parceiros com CNPJ:', e);
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
      const rawQuery = (name || '').trim();
      const sanitizedName = rawQuery.replace(/'/g, "''");
      const baseSelect = "ItemCode,ItemName,Frozen,ItemPrices";

      if (sanitizedName) {
        // Build rich search variants to match case-sensitive & accent-sensitive SAP DB
        const rawTokens = sanitizedName.split(/\s+/).filter(Boolean);
        const searchTargets = Array.from(new Set([sanitizedName, ...rawTokens]));
        
        const variants = new Set<string>();

        for (const target of searchTargets) {
          if (!target || target.length < 2) continue;
          
          // 1. Original
          variants.add(target);

          // 2. Uppercase
          const upper = target.toUpperCase();
          variants.add(upper);

          // 3. Lowercase
          const lower = target.toLowerCase();
          variants.add(lower);

          // 4. Capitalized / TitleCase
          const capitalized = target.charAt(0).toUpperCase() + target.slice(1).toLowerCase();
          variants.add(capitalized);

          // 5. Unaccented versions
          const unaccentedOrig = target.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          variants.add(unaccentedOrig);
          variants.add(unaccentedOrig.toUpperCase());
          variants.add(unaccentedOrig.toLowerCase());
          const unaccCap = unaccentedOrig.charAt(0).toUpperCase() + unaccentedOrig.slice(1).toLowerCase();
          variants.add(unaccCap);

          // 6. Portuguese-specific suffix/replacement rules
          const uUpper = unaccentedOrig.toUpperCase();
          if (uUpper.includes("CAO")) {
            variants.add(uUpper.replace(/CAO/g, "ÇÃO"));
            variants.add(uUpper.replace(/CAO/g, "ção"));
            variants.add(uUpper.replace(/CAO/g, "ÇAO"));
          }
          if (uUpper.includes("COES")) {
            variants.add(uUpper.replace(/COES/g, "ÇÕES"));
            variants.add(uUpper.replace(/COES/g, "ções"));
          }
          if (uUpper.endsWith("AO")) {
            variants.add(uUpper.replace(/AO$/, "ÃO"));
            variants.add(uUpper.replace(/AO$/, "ão"));
          }
          if (uUpper.includes("SERVIC")) {
            variants.add("SERVIÇO");
            variants.add("Serviço");
            variants.add("serviço");
            variants.add("SERVICO");
            variants.add("Servico");
            variants.add("servico");
          }
          if (uUpper.includes("LOCAC")) {
            variants.add("LOCAÇÃO");
            variants.add("Locação");
            variants.add("locação");
            variants.add("LOCACAO");
            variants.add("Locacao");
          }
          if (uUpper.includes("DIARI")) {
            variants.add("DIÁRIA");
            variants.add("Diária");
            variants.add("diária");
            variants.add("DIARIA");
            variants.add("Diaria");
          }
        }

        const variantList = Array.from(variants).filter(v => Boolean(v && v.trim()));
        const allItems: any[] = [];
        const seenCodes = new Set<string>();

        // Build combined filter clauses in batches of 4 variants to ensure fast parallel requests
        const batchSize = 4;
        const batches: string[][] = [];
        for (let i = 0; i < variantList.length; i += batchSize) {
          batches.push(variantList.slice(i, i + batchSize));
        }

        await Promise.all(
          batches.slice(0, 4).map(async (batch) => {
            const orConditions: string[] = [];
            for (const v of batch) {
              const safeV = v.replace(/'/g, "''");
              orConditions.push(`contains(ItemName, '${safeV}')`);
              orConditions.push(`contains(ItemCode, '${safeV}')`);
            }
            const filterStr = `(${orConditions.join(' or ')}) and Frozen ne 'tYES'`;

            for (let page = 0; page < 3; page++) {
              const skip = page * 40;
              try {
                const url = `/sap/Items?$select=${baseSelect}&$filter=${encodeURIComponent(filterStr)}&$skip=${skip}&$top=40`;
                const response = await api.get(url);
                const items = response.data?.value || [];
                for (const it of items) {
                  if (it.ItemCode && !seenCodes.has(it.ItemCode)) {
                    seenCodes.add(it.ItemCode);
                    if (it.Frozen === 'tNO' || it.Frozen === 'N' || !it.Frozen) {
                      allItems.push(it);
                    }
                  }
                }
                if (items.length < 40) break;
              } catch (err) {
                // Fallback for single variant if combined OData fails
                try {
                  for (const singleV of batch) {
                    const fallbackUrl = `/sap/Items?$select=${baseSelect}&$filter=${encodeURIComponent(`contains(ItemName, '${singleV}') and Frozen ne 'tYES'`)}&$skip=${skip}&$top=40`;
                    const resp = await api.get(fallbackUrl);
                    const fItems = resp.data?.value || [];
                    for (const it of fItems) {
                      if (it.ItemCode && !seenCodes.has(it.ItemCode)) {
                        seenCodes.add(it.ItemCode);
                        if (it.Frozen === 'tNO' || it.Frozen === 'N' || !it.Frozen) {
                          allItems.push(it);
                        }
                      }
                    }
                  }
                } catch {
                  break;
                }
                break;
              }
            }
          })
        );

        if (allItems.length > 0) {
          // Sort items by relevance: exact match or startsWith first, then locale
          const term = sanitizedName.toUpperCase();
          const cleanNormTerm = sanitizedName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

          return allItems.sort((a, b) => {
            const aCode = (a.ItemCode || '').toUpperCase();
            const bCode = (b.ItemCode || '').toUpperCase();
            const aName = (a.ItemName || '').toUpperCase();
            const bName = (b.ItemName || '').toUpperCase();
            const aNorm = aName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const bNorm = bName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

            // Exact match on Code or Name
            if (aCode === term || aName === term) return -1;
            if (bCode === term || bName === term) return 1;

            // Starts with
            const aStarts = aCode.startsWith(term) || aName.startsWith(term) || aNorm.startsWith(cleanNormTerm);
            const bStarts = bCode.startsWith(term) || bName.startsWith(term) || bNorm.startsWith(cleanNormTerm);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;

            return aName.localeCompare(bName);
          });
        }
      }

      // Initial list when no search term is entered - fetch up to 100 active items directly
      const initialItems: any[] = [];
      const seenInit = new Set<string>();
      for (let p = 0; p < 3; p++) {
        const url = `/sap/Items?$select=${baseSelect}&$filter=${encodeURIComponent("Frozen ne 'tYES'")}&$skip=${p * 40}&$top=40`;
        try {
          const response = await api.get(url);
          const items = response.data.value || [];
          for (const it of items) {
            if (it.ItemCode && !seenInit.has(it.ItemCode)) {
              seenInit.add(it.ItemCode);
              if (it.Frozen === 'tNO' || it.Frozen === 'N' || !it.Frozen) {
                initialItems.push(it);
              }
            }
          }
          if (items.length < 40) break;
        } catch {
          // If Frozen filter fails on root list, fallback without filter
          const fallbackUrl = `/sap/Items?$select=${baseSelect}&$skip=${p * 40}&$top=40`;
          const response = await api.get(fallbackUrl);
          const items = response.data.value || [];
          for (const it of items) {
            if (it.ItemCode && !seenInit.has(it.ItemCode)) {
              seenInit.add(it.ItemCode);
              if (it.Frozen === 'tNO' || it.Frozen === 'N' || !it.Frozen) {
                initialItems.push(it);
              }
            }
          }
          if (items.length < 40) break;
        }
      }
      return initialItems;
    } catch (error) {
      return handleApiError(error, 'getItems');
    }
  },

  getItemPriceList1: async (itemCode: string): Promise<{ price: number; currency: string; foundInList1: boolean }> => {
    try {
      const cleanCode = itemCode.trim();
      const response = await api.get(`/sap/Items('${encodeURIComponent(cleanCode)}')?$select=ItemCode,ItemName,ItemPrices`);
      const itemPrices = response.data?.ItemPrices || [];
      const list1 = itemPrices.find((p: any) => Number(p.PriceList) === 1);
      
      if (list1 && typeof list1.Price === 'number' && list1.Price > 0) {
        return {
          price: Number(list1.Price),
          currency: list1.Currency || 'R$',
          foundInList1: true
        };
      }

      // If price is 0 or not found
      return {
        price: list1?.Price !== undefined ? Number(list1.Price) : 0,
        currency: list1?.Currency || 'R$',
        foundInList1: (list1 && Number(list1.Price) > 0) ? true : false
      };
    } catch (error) {
      console.warn(`Erro ao consultar Lista de Preços 1 para o item ${itemCode}:`, error);
      return { price: 0, currency: 'R$', foundInList1: false };
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
    const cleanCode = String(code).trim().replace(/['"]/g, '');
    try {
      const response = await api.get(`/sap/CustosLoc('${cleanCode}')`);
      return response.data;
    } catch (error) {
      try {
        const filterStr = /^\d+$/.test(cleanCode)
          ? `Code eq '${cleanCode}' or DocEntry eq ${cleanCode}`
          : `Code eq '${cleanCode}'`;
        const response2 = await api.get(`/sap/CustosLoc?$filter=${encodeURIComponent(filterStr)}`);
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

  // Helper to sanitize payload for @CUSTOSPESSOAL table in SAP
  sanitizePersonnelCostPayload: (data: any) => {
    if (!data || typeof data !== 'object') return {};

    const allowedFields = new Set([
      'Code',
      'Name',
      'DocEntry',
      'U_DataInicial',
      'U_DataFinal',
      'U_Colaborador',
      'U_VlNormal',
      'U_StandBy',
      'U_QtdDiarias',
      'U_QtdDiariasSt',
      'U_NotNor',
      'U_NotNob',
      'U_HExtraDiu',
      'U_HExtraNot',
      'U_Total',
      'U_TxExtraDiurna',
      'U_HrExtraDiurna',
      'U_TxExtraNot',
      'U_TotalGeral',
      'U_HrExtraNot'
    ]);

    const raw = { ...data };

    // Map frontend field aliases to actual SAP @CUSTOSPESSOAL column names
    if (raw.U_StandBy === undefined && raw.U_StandByRate !== undefined) {
      raw.U_StandBy = Number(raw.U_StandByRate) || 0;
    }
    if (raw.U_QtdDiarias === undefined && raw.U_QtdDiariasNormal !== undefined) {
      raw.U_QtdDiarias = Number(raw.U_QtdDiariasNormal) || 0;
    }
    if (raw.U_QtdDiariasSt === undefined && raw.U_QtdDiariasStandBy !== undefined) {
      raw.U_QtdDiariasSt = Number(raw.U_QtdDiariasStandBy) || 0;
    }
    if (raw.U_NotNor === undefined && raw.U_NoturnoNor !== undefined) {
      raw.U_NotNor = Number(raw.U_NoturnoNor) || 0;
    }
    if (raw.U_NotNob === undefined && raw.U_NoturnoNob !== undefined) {
      raw.U_NotNob = Number(raw.U_NoturnoNob) || 0;
    }

    const cleaned: Record<string, any> = {};
    for (const [key, val] of Object.entries(raw)) {
      if (allowedFields.has(key)) {
        cleaned[key] = val;
      }
    }

    return cleaned;
  },

  createPersonnelCost: async (data: any) => {
    const cleaned = sapService.sanitizePersonnelCostPayload(data);
    try {
      const response = await api.post('/sap/CustosPessoal', cleaned);
      return response.data;
    } catch (error) {
      try {
        const response2 = await api.post('/sap/U_CustosPessoal', cleaned);
        return response2.data;
      } catch (err2) {
        return handleApiError(error, 'createPersonnelCost');
      }
    }
  },

  updatePersonnelCost: async (code: string | number, data: any) => {
    const cleanCode = String(code).trim().replace(/['"]/g, '');
    const cleaned = sapService.sanitizePersonnelCostPayload(data);
    try {
      const response = await api.patch(`/sap/CustosPessoal('${cleanCode}')`, cleaned);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'updatePersonnelCost');
    }
  },

  deletePersonnelCost: async (code: string | number) => {
    const cleanCode = String(code).trim().replace(/['"]/g, '');
    try {
      const response = await api.delete(`/sap/CustosPessoal('${cleanCode}')`);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'deletePersonnelCost');
    }
  },

  createRentalCost: async (data: any) => {
    try {
      const { U_Recurso, U_ValorBase, U_HorasNor, U_HorasNob, U_HENor, U_HENob, ...cleanData } = data;
      if (!cleanData.Name && U_Recurso) {
        cleanData.Name = U_Recurso;
      }
      if (!cleanData.U_VlOnSite && U_ValorBase) {
        cleanData.U_VlOnSite = Number(U_ValorBase) || 0;
      }
      const response = await api.post('/sap/CustosLoc', cleanData);
      return response.data;
    } catch (error) {
      try {
        const { U_Recurso, U_ValorBase, U_HorasNor, U_HorasNob, U_HENor, U_HENob, ...cleanData } = data;
        if (!cleanData.Name && U_Recurso) {
          cleanData.Name = U_Recurso;
        }
        if (!cleanData.U_VlOnSite && U_ValorBase) {
          cleanData.U_VlOnSite = Number(U_ValorBase) || 0;
        }
        const response2 = await api.post('/sap/U_CustosLoc', cleanData);
        return response2.data;
      } catch (err2) {
        return handleApiError(error, 'createRentalCost');
      }
    }
  },

  updateRentalCost: async (code: string | number, data: any) => {
    const cleanCode = String(code).trim().replace(/['"]/g, '');
    const { U_Recurso, U_ValorBase, U_HorasNor, U_HorasNob, U_HENor, U_HENob, ...cleanData } = data;
    if (!cleanData.Name && U_Recurso) {
      cleanData.Name = U_Recurso;
    }
    if (!cleanData.U_VlOnSite && U_ValorBase) {
      cleanData.U_VlOnSite = Number(U_ValorBase) || 0;
    }
    try {
      const response = await api.patch(`/sap/CustosLoc('${cleanCode}')`, cleanData);
      return response.data;
    } catch (error) {
      try {
        const filterStr = /^\d+$/.test(cleanCode)
          ? `Code eq '${cleanCode}' or DocEntry eq ${cleanCode}`
          : `Code eq '${cleanCode}'`;
        const resQuery = await api.get(`/sap/CustosLoc?$filter=${encodeURIComponent(filterStr)}&$select=Code`);
        if (resQuery.data.value && resQuery.data.value.length > 0) {
          const realCode = resQuery.data.value[0].Code;
          const retryPatch = await api.patch(`/sap/CustosLoc('${realCode}')`, cleanData);
          return retryPatch.data;
        }
      } catch {
        // fallback
      }
      return handleApiError(error, 'updateRentalCost');
    }
  },

  deleteRentalCost: async (code: string | number) => {
    const cleanCode = String(code).trim().replace(/['"]/g, '');
    try {
      const response = await api.delete(`/sap/CustosLoc('${cleanCode}')`);
      return response.data;
    } catch (error) {
      try {
        const filterStr = /^\d+$/.test(cleanCode)
          ? `Code eq '${cleanCode}' or DocEntry eq ${cleanCode}`
          : `Code eq '${cleanCode}'`;
        const resQuery = await api.get(`/sap/CustosLoc?$filter=${encodeURIComponent(filterStr)}&$select=Code`);
        if (resQuery.data.value && resQuery.data.value.length > 0) {
          const realCode = resQuery.data.value[0].Code;
          const retryDel = await api.delete(`/sap/CustosLoc('${realCode}')`);
          return retryDel.data;
        }
      } catch {
        // fallback
      }
      return handleApiError(error, 'deleteRentalCost');
    }
  },

  // Quotations (SalesQuotations)
  getQuotations: async (options?: number | ODataQueryOptions) => {
    try {
      const url = buildODataQuery('/sap/Quotations', options, 20, 'DocEntry desc');
      const response = await api.get(url);
      const items = response.data.value || [];

      // Check if search yields WO matches in lines
      if (typeof options === 'object' && options?.search && items.length === 0) {
        const raw = options.search.trim();
        const cleanWo = raw.replace(/^(WO|PROJETO)\s*[:#-]?\s*/i, '').trim();
        const woTarget = cleanWo || raw;
        try {
          const woRes = await api.get(`/sap/SQLQueries('SEARCH_QUOTES_BY_WO')/List?wo='${encodeURIComponent(woTarget)}'`);
          if (woRes.data?.value && woRes.data.value.length > 0) {
            const entries = woRes.data.value.map((r: any) => r.DocEntry).filter(Boolean);
            if (entries.length > 0) {
              const filterEntries = entries.slice(0, 20).map((e: any) => `DocEntry eq ${e}`).join(' or ');
              const fullDocsRes = await api.get(`/sap/Quotations?$filter=${filterEntries}&$orderby=DocEntry desc`);
              if (fullDocsRes.data?.value && fullDocsRes.data.value.length > 0) {
                return fullDocsRes.data.value;
              }
            }
          }
        } catch {
          // ignore error and proceed
        }
      }

      return items;
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
        // Force BPL_IDAssignedToInvoice to 1 for all new sales documents
        sanitized.BPL_IDAssignedToInvoice = 1;
        const project = sanitized.CostingCode4 || sanitized.U_Projeto || '';
        delete sanitized.Project;
        if (project) {
          sanitized.U_Projeto = project;
        }

        if (sanitized.DocumentLines && Array.isArray(sanitized.DocumentLines)) {
          sanitized.DocumentLines = sanitized.DocumentLines.map((line: any) => {
            const lineProj = line.CostingCode4 || project || '';
            const taxaNum = line.Taxa !== undefined && line.Taxa !== null && String(line.Taxa).trim() !== ''
              ? Number(String(line.Taxa).replace(/\s/g, '').replace(',', '.'))
              : (Number(line.CommisionPercent ?? line.CommissionPercent ?? line.Commission) || 0);

            const hasTaxa = !isNaN(taxaNum) && taxaNum > 0;
            const uNItem = line.U_nItem ?? line.U_nITEM ?? line.U_NItem;
            const uItemLoc = line.U_ItemLoc ?? line.U_ITEMLOC;

            return {
              ...line,
              CostingCode: line.CostingCode || 'BR',
              CostingCode2: line.CostingCode2 || 'MATRIZ',
              CostingCode3: line.CostingCode3 || 'OPER_OFF',
              CostingCode4: lineProj || undefined,
              CommisionPercent: hasTaxa ? taxaNum : undefined,
              CommissionPercent: hasTaxa ? taxaNum : undefined,
              Commission: hasTaxa ? taxaNum : undefined,
              DiscountPercent: line.DiscountPercent !== undefined && line.DiscountPercent !== null ? Number(line.DiscountPercent) : undefined,
              U_nItem: hasTaxa ? null : ((uNItem !== null && uNItem !== undefined && uNItem !== '') ? String(uNItem) : null),
              U_ItemLoc: hasTaxa ? null : ((uItemLoc !== null && uItemLoc !== undefined && uItemLoc !== '') ? String(uItemLoc) : null),
              U_B1SYS_RevenueInd2: (line.U_B1SYS_RevenueInd2 && line.U_B1SYS_RevenueInd2 !== '') ? line.U_B1SYS_RevenueInd2 : '1',
              BPL_IDAssignedToInvoice: 1
            };
          });
        }
        if (sanitized.DiscountPercent !== undefined && sanitized.DiscountPercent !== null) {
          sanitized.DiscountPercent = Number(sanitized.DiscountPercent);
        }
        if (sanitized.TotalDiscount !== undefined && sanitized.TotalDiscount !== null && Number(sanitized.TotalDiscount) > 0) {
          sanitized.TotalDiscount = Number(sanitized.TotalDiscount);
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
        // Do NOT send BPL_IDAssignedToInvoice on PATCH to avoid branch change error
        delete sanitized.BPL_IDAssignedToInvoice;
        const project = sanitized.CostingCode4 || sanitized.U_Projeto || '';
        delete sanitized.Project;
        if (project) {
          sanitized.U_Projeto = project;
        }

        if (sanitized.DocumentLines && Array.isArray(sanitized.DocumentLines)) {
          sanitized.DocumentLines = sanitized.DocumentLines.map((line: any) => {
            const lineProj = line.CostingCode4 || project || '';
            const taxaNum = line.Taxa !== undefined && line.Taxa !== null && String(line.Taxa).trim() !== ''
              ? Number(String(line.Taxa).replace(/\s/g, '').replace(',', '.'))
              : (Number(line.CommisionPercent ?? line.CommissionPercent ?? line.Commission) || 0);

            const hasTaxa = !isNaN(taxaNum) && taxaNum > 0;
            const uNItem = line.U_nItem ?? line.U_nITEM ?? line.U_NItem;
            const uItemLoc = line.U_ItemLoc ?? line.U_ITEMLOC;

            return {
              ...line,
              CostingCode: line.CostingCode || 'BR',
              CostingCode2: line.CostingCode2 || 'MATRIZ',
              CostingCode3: line.CostingCode3 || 'OPER_OFF',
              CostingCode4: lineProj || undefined,
              CommisionPercent: hasTaxa ? taxaNum : undefined,
              CommissionPercent: hasTaxa ? taxaNum : undefined,
              Commission: hasTaxa ? taxaNum : undefined,
              DiscountPercent: line.DiscountPercent !== undefined && line.DiscountPercent !== null ? Number(line.DiscountPercent) : undefined,
              U_nItem: hasTaxa ? null : ((uNItem !== null && uNItem !== undefined && uNItem !== '') ? String(uNItem) : null),
              U_ItemLoc: hasTaxa ? null : ((uItemLoc !== null && uItemLoc !== undefined && uItemLoc !== '') ? String(uItemLoc) : null),
              U_B1SYS_RevenueInd2: (line.U_B1SYS_RevenueInd2 && line.U_B1SYS_RevenueInd2 !== '') ? line.U_B1SYS_RevenueInd2 : '1'
            };
          });
        }
        if (sanitized.DiscountPercent !== undefined && sanitized.DiscountPercent !== null) {
          sanitized.DiscountPercent = Number(sanitized.DiscountPercent);
        }
        if (sanitized.TotalDiscount !== undefined && sanitized.TotalDiscount !== null && Number(sanitized.TotalDiscount) > 0) {
          sanitized.TotalDiscount = Number(sanitized.TotalDiscount);
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

  // Orders (SalesOrders) - Exclusivo para MainUsage = 9 (Serviço Prestado)
  getOrders: async (options?: number | ODataQueryOptions) => {
    let skip = 0;
    let top = 20;
    let hasSearch = false;
    if (typeof options === 'number') {
      skip = options;
    } else if (typeof options === 'object' && options !== null) {
      if (options.skip !== undefined) skip = options.skip;
      if (options.top !== undefined) top = options.top;
      if (options.search && options.search.trim()) hasSearch = true;
    }

    try {
      // Quando não há busca específica de texto/WO, pagina diretamente pelos DocEntries com MainUsage = 9
      if (!hasSearch) {
        try {
          const sqlRes = await api.get(`/sap/SQLQueries('GET_ORDERS_SERVICE_9')/List?$skip=${skip}&$top=${top}`);
          if (sqlRes.data?.value && Array.isArray(sqlRes.data.value)) {
            const entries = sqlRes.data.value.map((r: any) => r.DocEntry).filter(Boolean);
            if (entries.length === 0) return [];
            const filterEntries = entries.map((e: any) => `DocEntry eq ${e}`).join(' or ');
            const fullDocsRes = await api.get(`/sap/Orders?$filter=${encodeURIComponent(filterEntries)}&$orderby=DocEntry desc`);
            const list = fullDocsRes.data?.value || [];
            return list.filter(isServiceOrder);
          }
        } catch (sqlErr: any) {
          // Se a query ainda não estiver criada no SAP, registra automaticamente e repete
          try {
            await api.post('/sap/SQLQueries', {
              SqlCode: 'GET_ORDERS_SERVICE_9',
              SqlName: 'Get Sales Orders MainUsage 9',
              SqlText: 'SELECT T0."DocEntry" FROM "RDR12" T0 WHERE T0."MainUsage" = 9 ORDER BY T0."DocEntry" DESC'
            });
            const retryRes = await api.get(`/sap/SQLQueries('GET_ORDERS_SERVICE_9')/List?$skip=${skip}&$top=${top}`);
            if (retryRes.data?.value && Array.isArray(retryRes.data.value)) {
              const entries = retryRes.data.value.map((r: any) => r.DocEntry).filter(Boolean);
              if (entries.length === 0) return [];
              const filterEntries = entries.map((e: any) => `DocEntry eq ${e}`).join(' or ');
              const fullDocsRes = await api.get(`/sap/Orders?$filter=${encodeURIComponent(filterEntries)}&$orderby=DocEntry desc`);
              const list = fullDocsRes.data?.value || [];
              return list.filter(isServiceOrder);
            }
          } catch {
            // Em caso de falha de SQL, segue para a consulta OData normal filtrada
          }
        }
      }

      const url = buildODataQuery('/sap/Orders', options, 20, 'DocEntry desc');
      const response = await api.get(url);
      const items = (response.data.value || []).filter(isServiceOrder);

      // Check if search yields WO matches in lines
      if (typeof options === 'object' && options?.search && items.length === 0) {
        const raw = options.search.trim();
        const cleanWo = raw.replace(/^(WO|PROJETO)\s*[:#-]?\s*/i, '').trim();
        const woTarget = cleanWo || raw;
        try {
          const woRes = await api.get(`/sap/SQLQueries('SEARCH_ORDERS_BY_WO')/List?wo='${encodeURIComponent(woTarget)}'`);
          if (woRes.data?.value && woRes.data.value.length > 0) {
            const entries = woRes.data.value.map((r: any) => r.DocEntry).filter(Boolean);
            if (entries.length > 0) {
              const filterEntries = entries.slice(0, 20).map((e: any) => `DocEntry eq ${e}`).join(' or ');
              const fullDocsRes = await api.get(`/sap/Orders?$filter=${encodeURIComponent(filterEntries)}&$orderby=DocEntry desc`);
              if (fullDocsRes.data?.value && fullDocsRes.data.value.length > 0) {
                return fullDocsRes.data.value.filter(isServiceOrder);
              }
            }
          }
        } catch {
          // ignore error and proceed
        }
      }

      return items;
    } catch (error) {
      if (typeof options === 'object' && options?.search) {
        const raw = options.search.trim();
        const cleanWo = raw.replace(/^(WO|PROJETO)\s*[:#-]?\s*/i, '').trim();
        const woTarget = cleanWo || raw;
        try {
          const woRes = await api.get(`/sap/SQLQueries('SEARCH_ORDERS_BY_WO')/List?wo='${encodeURIComponent(woTarget)}'`);
          if (woRes.data?.value && woRes.data.value.length > 0) {
            const entries = woRes.data.value.map((r: any) => r.DocEntry).filter(Boolean);
            if (entries.length > 0) {
              const filterEntries = entries.slice(0, 20).map((e: any) => `DocEntry eq ${e}`).join(' or ');
              const fullDocsRes = await api.get(`/sap/Orders?$filter=${encodeURIComponent(filterEntries)}&$orderby=DocEntry desc`);
              if (fullDocsRes.data?.value && fullDocsRes.data.value.length > 0) {
                return fullDocsRes.data.value.filter(isServiceOrder);
              }
            }
          }
        } catch {
          // ignore and proceed to fallback
        }
        const numMatch = raw.match(/^\D*(\d+)\D*$/);
        if (numMatch) {
          const numVal = parseInt(numMatch[1], 10);
          if (numVal > 0 && numVal <= 2147483647) {
            try {
              const resNum = await api.get(`/sap/Orders?$filter=DocNum eq ${numVal} or DocEntry eq ${numVal}`);
              if (resNum.data.value && resNum.data.value.length > 0) return resNum.data.value.filter(isServiceOrder);
            } catch (e) {
              console.warn('Fallback DocNum search error:', e);
            }
          }
        }
        try {
          const safe = raw.replace(/'/g, "''").toUpperCase();
          const resText = await api.get(`/sap/Orders?$top=${options.top || 20}&$skip=${options.skip || 0}&$filter=contains(CardName, '${safe}') or contains(CardCode, '${safe}')`);
          if (resText.data.value && resText.data.value.length > 0) return resText.data.value.filter(isServiceOrder);
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
      const headerProject = data.CostingCode4 || data.U_Projeto || '';

      const sanitizedLines = (data.DocumentLines || []).map((line: any) => {
        const uNItem = line.U_nItem ?? line.U_nITEM ?? line.U_NItem;
        const uItemLoc = line.U_ItemLoc ?? line.U_ITEMLOC;
        const lineProject = line.CostingCode4 || headerProject || '';
        const taxaNum = line.Taxa !== undefined && line.Taxa !== null && String(line.Taxa).trim() !== ''
          ? Number(String(line.Taxa).replace(/\s/g, '').replace(',', '.'))
          : (Number(line.CommisionPercent ?? line.CommissionPercent ?? line.Commission) || 0);

        const hasTaxa = !isNaN(taxaNum) && taxaNum > 0;

        return {
          ItemCode: line.ItemCode,
          ItemDescription: line.ItemDescription || line.ItemName || line.Dscription || undefined,
          Quantity: Number(line.Quantity) || 1,
          UnitPrice: Number(line.Price ?? line.UnitPrice ?? 0),
          Usage: line.Usage ? Number(line.Usage) : 9,
          CostingCode: line.CostingCode || 'BR',
          CostingCode2: line.CostingCode2 || 'MATRIZ',
          CostingCode3: line.CostingCode3 || 'OPER_OFF',
          CostingCode4: lineProject || undefined,
          CostingCode5: line.CostingCode5 || undefined,
          CommisionPercent: hasTaxa ? taxaNum : undefined,
          CommissionPercent: hasTaxa ? taxaNum : undefined,
          Commission: hasTaxa ? taxaNum : undefined,
          DiscountPercent: line.DiscountPercent !== undefined && line.DiscountPercent !== null ? Number(line.DiscountPercent) : undefined,
          U_nItem: hasTaxa ? null : ((uNItem !== null && uNItem !== undefined && uNItem !== '') ? String(uNItem) : null),
          U_ItemLoc: hasTaxa ? null : ((uItemLoc !== null && uItemLoc !== undefined && uItemLoc !== '') ? String(uItemLoc) : null),
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
        MainUsage: 9,
        TaxExtension: {
          ...(data.TaxExtension || {}),
          MainUsage: 9
        },
        DocumentLines: sanitizedLines
      };

      if (data.DiscountPercent !== undefined && data.DiscountPercent !== null) {
        payload.DiscountPercent = Number(data.DiscountPercent);
      }
      if (data.TotalDiscount !== undefined && data.TotalDiscount !== null && Number(data.TotalDiscount) > 0) {
        payload.TotalDiscount = Number(data.TotalDiscount);
      }

      if (headerProject) {
        payload.U_Projeto = headerProject;
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
      const headerProject = data.CostingCode4 || data.U_Projeto || '';
      const sanitizedLines = (data.DocumentLines || []).map((line: any, idx: number) => {
        const lineNum = typeof line.LineNum === 'number' ? line.LineNum : idx;
        const uNItem = line.U_nItem ?? line.U_nITEM ?? line.U_NItem;
        const uItemLoc = line.U_ItemLoc ?? line.U_ITEMLOC;
        const lineProject = line.CostingCode4 || headerProject || '';
        const taxaNum = line.Taxa !== undefined && line.Taxa !== null && String(line.Taxa).trim() !== ''
          ? Number(String(line.Taxa).replace(/\s/g, '').replace(',', '.'))
          : (Number(line.CommisionPercent ?? line.CommissionPercent ?? line.Commission) || 0);

        const hasTaxa = !isNaN(taxaNum) && taxaNum > 0;

        return {
          LineNum: lineNum,
          ItemCode: line.ItemCode,
          ItemDescription: line.ItemDescription || line.ItemName || line.Dscription || undefined,
          Quantity: Number(line.Quantity) || 1,
          UnitPrice: Number(line.Price ?? line.UnitPrice ?? 0),
          CostingCode: line.CostingCode || 'BR',
          CostingCode2: line.CostingCode2 || 'MATRIZ',
          CostingCode3: line.CostingCode3 || 'OPER_OFF',
          CostingCode4: lineProject || undefined,
          CostingCode5: line.CostingCode5 || undefined,
          CommisionPercent: hasTaxa ? taxaNum : undefined,
          CommissionPercent: hasTaxa ? taxaNum : undefined,
          Commission: hasTaxa ? taxaNum : undefined,
          DiscountPercent: line.DiscountPercent !== undefined && line.DiscountPercent !== null ? Number(line.DiscountPercent) : undefined,
          U_nItem: hasTaxa ? null : ((uNItem !== null && uNItem !== undefined && uNItem !== '') ? String(uNItem) : null),
          U_ItemLoc: hasTaxa ? null : ((uItemLoc !== null && uItemLoc !== undefined && uItemLoc !== '') ? String(uItemLoc) : null),
          U_B1SYS_RevenueInd2: (line.U_B1SYS_RevenueInd2 && line.U_B1SYS_RevenueInd2 !== '') ? line.U_B1SYS_RevenueInd2 : '1'
        };
      });

      const patchPayload: any = {
        Comments: data.Comments || '',
        NumAtCard: data.NumAtCard || data.U_POCliente || '',
        DocumentLines: sanitizedLines
      };

      if (data.DiscountPercent !== undefined && data.DiscountPercent !== null) {
        patchPayload.DiscountPercent = Number(data.DiscountPercent);
      }
      if (data.TotalDiscount !== undefined && data.TotalDiscount !== null && Number(data.TotalDiscount) > 0) {
        patchPayload.TotalDiscount = Number(data.TotalDiscount);
      }

      if (data.DocDueDate) {
        patchPayload.DocDueDate = data.DocDueDate.split('T')[0];
      }
      if (headerProject) {
        patchPayload.U_Projeto = headerProject;
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
                            fullQuote?.CostingCode4 || 
                            fullQuote?.U_Projeto ||
                            '';

      const lines = (fullQuote.DocumentLines || []).map((line: any, idx: number) => {
        const matchingPassedLine = quotationData?.DocumentLines?.[idx] || 
                                   (quotationData?.DocumentLines && quotationData.DocumentLines.find((l: any) => l.LineNum === line.LineNum));
        const lineProject = line.CostingCode4 || 
                            matchingPassedLine?.CostingCode4 || 
                            headerProject || 
                            '';

        const uNItem = line.U_nItem ?? line.U_nITEM ?? matchingPassedLine?.U_nItem ?? matchingPassedLine?.U_nITEM;
        const uItemLoc = line.U_ItemLoc ?? line.U_ITEMLOC ?? matchingPassedLine?.U_ItemLoc ?? matchingPassedLine?.U_ITEMLOC;
        const taxaNum = matchingPassedLine?.Taxa !== undefined && matchingPassedLine?.Taxa !== null && String(matchingPassedLine.Taxa).trim() !== ''
          ? Number(String(matchingPassedLine.Taxa).replace(/\s/g, '').replace(',', '.'))
          : (Number(line.CommisionPercent ?? line.CommissionPercent ?? line.Commission ?? matchingPassedLine?.CommisionPercent ?? matchingPassedLine?.CommissionPercent) || 0);

        const hasTaxa = !isNaN(taxaNum) && taxaNum > 0;

        return {
          BaseType: 23, // Quotations
          BaseEntry: fullQuote.DocEntry,
          BaseLine: line.LineNum !== undefined && line.LineNum !== null ? line.LineNum : idx,
          Quantity: line.Quantity,
          CostingCode: line.CostingCode || matchingPassedLine?.CostingCode || 'BR',
          CostingCode2: line.CostingCode2 || matchingPassedLine?.CostingCode2 || 'MATRIZ',
          CostingCode3: line.CostingCode3 || matchingPassedLine?.CostingCode3 || 'OPER_OFF',
          CostingCode4: lineProject || undefined,
          CommisionPercent: hasTaxa ? taxaNum : undefined,
          CommissionPercent: hasTaxa ? taxaNum : undefined,
          Commission: hasTaxa ? taxaNum : undefined,
          U_nItem: hasTaxa ? null : ((uNItem !== null && uNItem !== undefined && uNItem !== '') ? String(uNItem) : undefined),
          U_ItemLoc: hasTaxa ? null : ((uItemLoc !== null && uItemLoc !== undefined && uItemLoc !== '') ? String(uItemLoc) : undefined),
          U_B1SYS_RevenueInd2: (line.U_B1SYS_RevenueInd2 && line.U_B1SYS_RevenueInd2 !== '') ? line.U_B1SYS_RevenueInd2 : '1',
          Usage: 9,
          BPL_IDAssignedToInvoice: 1
        };
      });

      const orderData: any = {
        CardCode: fullQuote.CardCode,
        DocDueDate: fullQuote.DocDueDate ? fullQuote.DocDueDate.split('T')[0] : new Date().toISOString().split('T')[0],
        BPL_IDAssignedToInvoice: 1,
        MainUsage: 9,
        TaxExtension: {
          MainUsage: 9
        },
        U_B1SYS_RevenueInd2: fullQuote.U_B1SYS_RevenueInd2 || '1',
        Comments: fullQuote.Comments || quotationData?.Comments || undefined,
        NumAtCard: fullQuote.NumAtCard || quotationData?.NumAtCard || fullQuote.U_POCliente || quotationData?.U_POCliente || undefined,
        DocumentLines: lines
      };

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
