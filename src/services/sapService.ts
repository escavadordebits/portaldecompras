import axios from 'axios';
import { SAP_CONFIG } from '../config/sapConfig';
import { matchPartnerQuery } from '../utils/taxUtils';

const api = axios.create({
  baseURL: '/api',
  timeout: 65000 // Slightly longer than server timeout
});

// In-memory cache for customers, suppliers, active branches (OBPL), buyers, usages, payment terms, payment methods, and accounting lookups
let _cachedCustomers: any[] | null = null;
let _cachedCustomersPromise: Promise<any[]> | null = null;
let _cachedSuppliers: any[] | null = null;
let _cachedSuppliersPromise: Promise<any[]> | null = null;
let _cachedBusinessPlaces: any[] | null = null;
let _cachedBuyers: any[] | null = null;
let _cachedBuyersPromise: Promise<any[]> | null = null;
let _cachedUsages: any[] | null = null;
let _cachedUsagesPromise: Promise<any[]> | null = null;
let _cachedPaymentTerms: any[] | null = null;
let _cachedPaymentTermsPromise: Promise<any[]> | null = null;
let _cachedPaymentMethods: any[] | null = null;
let _cachedDimensions: any[] | null = null;
let _cachedDistributionRules: any[] | null = null;
let _cachedDistributionRulesPromise: Promise<any[]> | null = null;
let _cachedProjects: any[] | null = null;
let _cachedProjectsPromise: Promise<any[]> | null = null;

// In-memory & local cache for personnel costs (@CUSTOSPESSOAL)
const _personnelCostsCache: Record<string, any> = {};

export const getCachedPersonnelCost = (cleanCode: string): any => {
  if (!cleanCode) return null;
  const key = String(cleanCode).trim().replace(/['"]/g, '');
  if (_personnelCostsCache[key]) return _personnelCostsCache[key];
  try {
    const raw = localStorage.getItem('qualitech_cached_pers_costs_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed[key]) {
        _personnelCostsCache[key] = parsed[key];
        return parsed[key];
      }
    }
  } catch {}
  return null;
};

export const setCachedPersonnelCost = (cleanCode: string, data: any): void => {
  if (!cleanCode || !data) return;
  const key = String(cleanCode).trim().replace(/['"]/g, '');
  _personnelCostsCache[key] = { ...(_personnelCostsCache[key] || {}), ...data, Code: key };
  try {
    const raw = localStorage.getItem('qualitech_cached_pers_costs_v1');
    const existing = raw ? JSON.parse(raw) : {};
    existing[key] = _personnelCostsCache[key];
    localStorage.setItem('qualitech_cached_pers_costs_v1', JSON.stringify(existing));
  } catch {}
};

// Helper to normalize SAP Company database name
export const normalizeSapCompany = (comp?: string): string => {
  if (!comp) return 'SBO_QUALITECH';
  const trimmed = comp.trim();
  if (!trimmed || trimmed === 'QUALITECH' || trimmed === 'SBO_QUALITECH_') {
    return 'SBO_QUALITECH';
  }
  const upper = trimmed.toUpperCase();
  if (upper === 'QAS' || upper === 'QUALITECH_QAS' || upper === 'SBO_QUALITECH_QAS') {
    return 'SBO_QUALITECH_QAS';
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

  // Always resolve company directly from active user profile first (priority over stale storage)
  let rawCompany: string | null = null;
  try {
    const activeUserStr = sessionStorage.getItem('sap_portal_active_user') || localStorage.getItem('sap_portal_active_user');
    if (activeUserStr) {
      const activeUser = JSON.parse(activeUserStr);
      if (activeUser?.sapCompany) {
        rawCompany = activeUser.sapCompany;
      }
    }
  } catch (e) {
    console.error('Error resolving active company from user profile', e);
  }

  if (!rawCompany) {
    rawCompany = sessionStorage.getItem('sap_portal_company') || localStorage.getItem('sap_portal_company');
  }
  
  const currentCompany = normalizeSapCompany(rawCompany || SAP_CONFIG.defaultCompany);
  sessionStorage.setItem('sap_portal_company', currentCompany);
  localStorage.setItem('sap_portal_company', currentCompany);

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
  wo?: string;
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
    // Does not treat Business Partner codes like "C000028" or "F000123" as document numbers
    const isCardCode = /^[CcFf]\d+$/i.test(raw);
    const numMatch = !isCardCode ? raw.match(/^\D*(\d+)\D*$/) : null;
    const numVal = numMatch ? parseInt(numMatch[1], 10) : NaN;
    // SAP 32-bit signed int max is 2147483647
    const hasValidDocNum = !isCardCode && !isNaN(numVal) && numVal > 0 && numVal <= 2147483647;

    const safeSearch = raw.replace(/'/g, "''");
    const upper = safeSearch.toUpperCase();
    const lower = safeSearch.toLowerCase();

    const clauses: string[] = [];

    if (hasValidDocNum) {
      clauses.push(`DocNum eq ${numVal}`);
      clauses.push(`DocEntry eq ${numVal}`);
    }

    if (isCardCode) {
      clauses.push(`CardCode eq '${upper}'`);
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
  if (doc._wo && String(doc._wo).trim() !== '') return String(doc._wo).trim();

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

export function calculateUDataPgtoFromPymntGroup(pymntGroup?: string | number | null, baseDateStr?: string): string {
  const base = baseDateStr ? new Date(`${String(baseDateStr).split('T')[0]}T12:00:00`) : new Date();
  const safeBase = isNaN(base.getTime()) ? new Date() : base;
  const rawStr = String(pymntGroup ?? '').trim();
  const match = rawStr.match(/\d+/);
  const parsedDays = match ? parseInt(match[0], 10) : 0;
  const daysToAdd = !isNaN(parsedDays) && parsedDays > 0 ? parsedDays - 1 : 0;
  const target = new Date(safeBase);
  target.setDate(target.getDate() + daysToAdd);
  const yyyy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const dd = String(target.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export interface SapMarketingObjectMeta {
  objType: string;
  tableName: string;
  linesTableName: string;
  docObjectCode: string;
  serviceLayerEndpoint: string;
  labelPt: string;
}

export const SAP_MARKETING_OBJECTS_CATALOG: SapMarketingObjectMeta[] = [
  {
    objType: '1470000113',
    tableName: 'OPRQ',
    linesTableName: 'PRQ1',
    docObjectCode: 'oPurchaseRequest',
    serviceLayerEndpoint: 'PurchaseRequests',
    labelPt: 'Solicitação de compra'
  },
  {
    objType: '540000006',
    tableName: 'OPQT',
    linesTableName: 'PQT1',
    docObjectCode: '540000006',
    serviceLayerEndpoint: 'PurchaseQuotations',
    labelPt: 'Oferta de compra (Cotação)'
  },
  {
    objType: '22',
    tableName: 'OPOR',
    linesTableName: 'POR1',
    docObjectCode: 'oPurchaseOrders',
    serviceLayerEndpoint: 'PurchaseOrders',
    labelPt: 'Pedido de compra'
  },
  {
    objType: '20',
    tableName: 'OPDN',
    linesTableName: 'PDN1',
    docObjectCode: 'oPurchaseDeliveryNotes',
    serviceLayerEndpoint: 'PurchaseDeliveryNotes',
    labelPt: 'Recebimento de mercadorias'
  },
  {
    objType: '21',
    tableName: 'ORPD',
    linesTableName: 'RPD1',
    docObjectCode: 'oPurchaseReturns',
    serviceLayerEndpoint: 'PurchaseReturns',
    labelPt: 'Devolução de mercadorias'
  },
  {
    objType: '18',
    tableName: 'OPCH',
    linesTableName: 'PCH1',
    docObjectCode: 'oPurchaseInvoices',
    serviceLayerEndpoint: 'PurchaseInvoices',
    labelPt: 'Nota fiscal de entrada'
  },
  {
    objType: '19',
    tableName: 'ORPC',
    linesTableName: 'RPC1',
    docObjectCode: 'oPurchaseCreditNotes',
    serviceLayerEndpoint: 'PurchaseCreditNotes',
    labelPt: 'Dev. nota fiscal de entrada'
  },
  {
    objType: '204',
    tableName: 'ODPO',
    linesTableName: 'DPO1',
    docObjectCode: 'oPurchaseDownPayments',
    serviceLayerEndpoint: 'PurchaseDownPayments',
    labelPt: 'Solicitação de adiantamento para fornecedor / Adiantamento para fornecedor'
  },
  {
    objType: '69',
    tableName: 'OIPF',
    linesTableName: 'IPF1',
    docObjectCode: 'oLandedCosts',
    serviceLayerEndpoint: 'LandedCosts',
    labelPt: 'Despesas de importação'
  },
  {
    objType: '112',
    tableName: 'ODRF',
    linesTableName: 'DRF1',
    docObjectCode: 'oDrafts',
    serviceLayerEndpoint: 'Drafts',
    labelPt: 'Esboço de documento'
  }
];

export function resolveMarketingObjectMeta(input?: string | number | null, fallbackInput?: string | number | null): SapMarketingObjectMeta {
  const candidates = [input, fallbackInput]
    .map(v => String(v ?? '').trim())
    .filter(Boolean);

  for (const raw of candidates) {
    const upper = raw.toUpperCase();
    if ((upper === '112' || upper === 'ODRF' || upper === 'ODRAFTS' || upper === 'DRAFTS') && candidates.length > 1 && raw === candidates[0]) {
      continue;
    }
    const exact = SAP_MARKETING_OBJECTS_CATALOG.find(
      m =>
        m.objType.toUpperCase() === upper ||
        m.docObjectCode.toUpperCase() === upper ||
        m.tableName.toUpperCase() === upper ||
        m.linesTableName.toUpperCase() === upper ||
        m.serviceLayerEndpoint.toUpperCase() === upper
    );
    if (exact) return exact;

    if (upper.includes('PURCHASEREQUEST') || upper.includes('OPRQ') || upper.includes('SOLICIT')) {
      return SAP_MARKETING_OBJECTS_CATALOG[0]; // 1470000113
    }
    if (upper.includes('PURCHASEQUOTATION') || upper.includes('OPQT') || upper.includes('OFERTA') || upper.includes('COTAC')) {
      return SAP_MARKETING_OBJECTS_CATALOG[1]; // 540000006
    }
    if (upper.includes('PURCHASEORDER') || upper.includes('OPOR')) {
      return SAP_MARKETING_OBJECTS_CATALOG[2]; // 22
    }
    if (upper.includes('DELIVERYNOTE') || upper.includes('OPDN') || upper.includes('RECEBIMENTO')) {
      return SAP_MARKETING_OBJECTS_CATALOG[3]; // 20
    }
    if (upper.includes('PURCHASERETURN') || upper.includes('ORPD') || (upper.includes('DEVOLU') && !upper.includes('NOTA'))) {
      return SAP_MARKETING_OBJECTS_CATALOG[4]; // 21
    }
    if (upper.includes('PURCHASEINVOICE') || upper.includes('OPCH') || upper.includes('NOTA FISCAL DE ENTRADA')) {
      return SAP_MARKETING_OBJECTS_CATALOG[5]; // 18
    }
    if (upper.includes('CREDITNOTE') || upper.includes('ORPC') || upper.includes('DEV. NOTA')) {
      return SAP_MARKETING_OBJECTS_CATALOG[6]; // 19
    }
    if (upper.includes('DOWNPAYMENT') || upper.includes('ODPO') || upper.includes('ADIANTAMENTO')) {
      return SAP_MARKETING_OBJECTS_CATALOG[7]; // 204
    }
    if (upper.includes('LANDEDCOST') || upper.includes('OIPF') || upper.includes('IMPORTA')) {
      return SAP_MARKETING_OBJECTS_CATALOG[8]; // 69
    }
  }

  return SAP_MARKETING_OBJECTS_CATALOG[2]; // 22 - OPOR
}

let cachedUnifiedApprovals: { data: any[]; timestamp: number } | null = null;
async function fetchCachedUnifiedApprovals(): Promise<any[]> {
  const now = Date.now();
  if (cachedUnifiedApprovals && (now - cachedUnifiedApprovals.timestamp < 15000)) {
    return cachedUnifiedApprovals.data;
  }
  try {
    const res = await api.get('/approvals/unified');
    const list = Array.isArray(res.data?.approvals) ? res.data.approvals : [];
    cachedUnifiedApprovals = { data: list, timestamp: now };
    return list;
  } catch {
    return cachedUnifiedApprovals ? cachedUnifiedApprovals.data : [];
  }
}

async function mergePendingPortalDraftsForObjectType(effectiveDocs: any[], targetObjType: string): Promise<any[]> {
  try {
    const meta = resolveMarketingObjectMeta(targetObjType);
    const approvals = await fetchCachedUnifiedApprovals();
    const matchingDrafts = approvals.filter((rec: any) => {
      const recMeta = resolveMarketingObjectMeta(rec.objectType, rec.docObjectCode);
      const isPending = rec.status === 'W' && !rec.convertedDocEntry;
      return recMeta.objType === meta.objType && isPending && rec.draftDocEntry;
    });

    if (matchingDrafts.length === 0) return effectiveDocs;

    const existingEntries = new Set(effectiveDocs.map((d: any) => Number(d.DocEntry)));
    const draftItems = matchingDrafts
      .filter((rec: any) => !existingEntries.has(Number(rec.draftDocEntry)))
      .map((rec: any) => {
        const payload = rec.draftPayload || {};
        return {
          ...payload,
          DocEntry: Number(rec.draftDocEntry),
          DocNum: rec.draftDocNum || rec.draftDocEntry,
          CardCode: rec.cardCode || payload.CardCode || '',
          CardName: rec.cardName || payload.CardName || rec.authorName || '',
          RequesterName: payload.RequesterName || rec.authorName || '',
          RequesterEmail: payload.RequesterEmail || rec.authorEmail || '',
          DocDate: payload.DocDate || rec.creationDate || new Date().toISOString(),
          DocTotal: rec.docTotal ?? payload.DocTotal ?? 0,
          BPL_IDAssignedToInvoice: rec.bplId ?? payload.BPL_IDAssignedToInvoice,
          BPLID: rec.bplId ?? payload.BPLID,
          BPLName: rec.bplName || payload.BPLName,
          Comments: rec.comments || payload.Comments || '',
          DocumentStatus: 'bost_Open',
          DocObjectCode: meta.docObjectCode,
          ObjectType: meta.objType,
          TargetTable: meta.tableName,
          DraftObjectType: '112',
          DraftTable: 'ODRF',
          _isDraft: true,
          _approvalStatus: rec.status || 'W',
          DocumentLines: Array.isArray(payload.DocumentLines) && payload.DocumentLines.length > 0
            ? payload.DocumentLines
            : (rec.lines || []).map((l: any) => ({
                LineNum: l.lineNum,
                ItemCode: l.itemCode,
                ItemDescription: l.itemDescription,
                Quantity: l.quantity,
                Price: l.unitPrice,
                UnitPrice: l.unitPrice,
                LineTotal: l.lineTotal,
                CostingCode2: l.branch,
                CostingCode3: l.costCenter,
                CostingCode4: l.project
              }))
        };
      });

    return [...draftItems, ...effectiveDocs];
  } catch {
    return effectiveDocs;
  }
}

async function getDraftsForDocObjectCode(
  docObjectCode: string,
  targetObjType: string,
  options?: number | (ODataQueryOptions & { draftsOnly?: boolean })
): Promise<any[]> {
  try {
    const meta = resolveMarketingObjectMeta(targetObjType, docObjectCode);
    let skip = 0;
    let top = 20;
    let search = '';
    if (typeof options === 'number') {
      skip = options;
    } else if (typeof options === 'object' && options !== null) {
      if (options.skip !== undefined) skip = options.skip;
      if (options.top !== undefined) top = options.top;
      if (options.search) search = options.search.trim();
    }

    const codeVariants = Array.from(new Set([
      docObjectCode,
      meta.docObjectCode,
      meta.objType,
      targetObjType,
      ...(meta.objType === '1470000113' ? ['oPurchaseRequest', 'oPurchaseRequests', '1470000113'] : []),
      ...(meta.objType === '540000006' ? ['540000006', 'oPurchaseQuotations', 'oPurchaseQuotation'] : []),
      ...(meta.objType === '22' ? ['oPurchaseOrders', '22'] : []),
      ...(meta.objType === '204' ? ['oPurchaseDownPayments', '204'] : [])
    ].filter(Boolean)));
    const baseFilter = codeVariants.length > 1
      ? `(${codeVariants.map(c => `DocObjectCode eq '${c}'`).join(' or ')})`
      : `DocObjectCode eq '${docObjectCode}'`;
    let url = `/sap/Drafts?$filter=${encodeURIComponent(baseFilter)}&$orderby=DocEntry desc&$top=${top}&$skip=${skip}`;

    let draftsFromSap: any[] = [];
    try {
      const res = await api.get(url);
      draftsFromSap = Array.isArray(res.data?.value) ? res.data.value : [];
    } catch (sapErr: any) {
      console.warn(`[getDraftsForDocObjectCode] Erro ao buscar rascunhos de ${docObjectCode}:`, sapErr?.message);
    }

    const mappedSapDrafts = draftsFromSap.map((d: any) => ({
      ...d,
      DocObjectCode: docObjectCode,
      ObjectType: meta.objType,
      TargetTable: meta.tableName,
      DraftObjectType: '112',
      DraftTable: 'ODRF',
      _isDraft: true,
      DocumentStatus: d.DocumentStatus || 'bost_Open'
    }));

    return await mergePendingPortalDraftsForObjectType(mappedSapDrafts, targetObjType);
  } catch {
    return [];
  }
}

export const sapService = {
  isServiceOrder,
  SAP_MARKETING_OBJECTS_CATALOG,
  resolveMarketingObjectMeta,
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

  getPurchaseOrders: async (options?: number | (ODataQueryOptions & { draftsOnly?: boolean })) => {
    try {
      if (typeof options === 'object' && Boolean(options?.draftsOnly)) {
        return await getDraftsForDocObjectCode('oPurchaseOrders', '22', options);
      }
      const url = buildODataQuery('/sap/PurchaseOrders', options, 20, 'DocEntry desc');
      const response = await api.get(url);
      const list = response.data.value || [];
      return await mergePendingPortalDraftsForObjectType(list, '22');
    } catch (error) {
      if (typeof options === 'object' && options?.search) {
        try {
          const fallbackUrl = `/sap/PurchaseOrders?$orderby=DocEntry desc&$top=${options.top || 50}&$skip=${options.skip || 0}`;
          const response2 = await api.get(fallbackUrl);
          return await mergePendingPortalDraftsForObjectType(response2.data.value || [], '22');
        } catch {
          return handleApiError(error, 'getPurchaseOrders');
        }
      }
      return handleApiError(error, 'getPurchaseOrders');
    }
  },

  getPurchaseRequests: async (options?: number | (ODataQueryOptions & { draftsOnly?: boolean })) => {
    try {
      if (typeof options === 'object' && Boolean(options?.draftsOnly)) {
        return await getDraftsForDocObjectCode('oPurchaseRequests', '1470000113', options);
      }
      const url = buildODataQuery('/sap/PurchaseRequests', options, 20, 'DocEntry desc');
      const response = await api.get(url);
      const list = response.data.value || [];
      return await mergePendingPortalDraftsForObjectType(list, '1470000113');
    } catch (error) {
      if (typeof options === 'object' && options?.search) {
        try {
          const fallbackUrl = `/sap/PurchaseRequests?$orderby=DocEntry desc&$top=${options.top || 50}&$skip=${options.skip || 0}`;
          const response2 = await api.get(fallbackUrl);
          return await mergePendingPortalDraftsForObjectType(response2.data.value || [], '1470000113');
        } catch {
          return handleApiError(error, 'getPurchaseRequests');
        }
      }
      return handleApiError(error, 'getPurchaseRequests');
    }
  },

  getPurchaseQuotations: async (options?: number | (ODataQueryOptions & { draftsOnly?: boolean })) => {
    try {
      if (typeof options === 'object' && Boolean(options?.draftsOnly)) {
        return await getDraftsForDocObjectCode('oPurchaseQuotations', '540000006', options);
      }
      const url = buildODataQuery('/sap/PurchaseQuotations', options, 20, 'DocEntry desc');
      const response = await api.get(url);
      const list = response.data.value || [];
      return await mergePendingPortalDraftsForObjectType(list, '540000006');
    } catch (error) {
      if (typeof options === 'object' && options?.search) {
        try {
          const fallbackUrl = `/sap/PurchaseQuotations?$orderby=DocEntry desc&$top=${options.top || 50}&$skip=${options.skip || 0}`;
          const response2 = await api.get(fallbackUrl);
          return await mergePendingPortalDraftsForObjectType(response2.data.value || [], '540000006');
        } catch {
          return handleApiError(error, 'getPurchaseQuotations');
        }
      }
      return handleApiError(error, 'getPurchaseQuotations');
    }
  },

  getPurchaseDownPayments: async (options?: number | (ODataQueryOptions & { draftsOnly?: boolean })) => {
    try {
      if (typeof options === 'object' && Boolean(options?.draftsOnly)) {
        return await getDraftsForDocObjectCode('oPurchaseDownPayments', '204', options);
      }
      const url = buildODataQuery('/sap/PurchaseDownPayments', options, 20, 'DocEntry desc');
      const response = await api.get(url);
      const list = response.data.value || [];
      return await mergePendingPortalDraftsForObjectType(list, '204');
    } catch (error) {
      return handleApiError(error, 'getPurchaseDownPayments');
    }
  },

  getPurchaseOrder: async (docEntry: number, isDraft = false) => {
    try {
      if (isDraft) {
        try {
          const draftRes = await api.get(`/sap/Drafts(${docEntry})`);
          if (draftRes.data) {
            return {
              ...draftRes.data,
              DocEntry: docEntry,
              ObjectType: '22',
              TargetTable: 'OPOR',
              DraftObjectType: '112',
              DraftTable: 'ODRF',
              _isDraft: true
            };
          }
        } catch {}
      }
      try {
        const draftCheck = await api.get(`/approvals/draft-detail/${docEntry}`);
        if (draftCheck.data?.approvalRecord?.objectType === '22' && !draftCheck.data?.approvalRecord?.convertedDocEntry && draftCheck.data?.draftData) {
          return {
            ...draftCheck.data.draftData,
            DocEntry: docEntry,
            ObjectType: '22',
            TargetTable: 'OPOR',
            DraftObjectType: '112',
            DraftTable: 'ODRF',
            _isDraft: true
          };
        }
      } catch {}
      const response = await api.get(`/sap/PurchaseOrders(${docEntry})`);
      return response.data;
    } catch (error) {
      try {
        const draftRes = await api.get(`/sap/Drafts(${docEntry})`);
        if (draftRes.data) return { ...draftRes.data, _isDraft: true, DraftObjectType: '112', DraftTable: 'ODRF' };
      } catch {}
      return handleApiError(error, 'getPurchaseOrder');
    }
  },

  getPurchaseRequest: async (docEntry: number, isDraft = false) => {
    try {
      if (isDraft) {
        try {
          const draftRes = await api.get(`/sap/Drafts(${docEntry})`);
          if (draftRes.data) {
            return {
              ...draftRes.data,
              DocEntry: docEntry,
              ObjectType: '1470000113',
              TargetTable: 'OPRQ',
              DraftObjectType: '112',
              DraftTable: 'ODRF',
              _isDraft: true
            };
          }
        } catch {}
      }
      try {
        const draftCheck = await api.get(`/approvals/draft-detail/${docEntry}`);
        if (draftCheck.data?.approvalRecord?.objectType === '1470000113' && !draftCheck.data?.approvalRecord?.convertedDocEntry && draftCheck.data?.draftData) {
          return {
            ...draftCheck.data.draftData,
            DocEntry: docEntry,
            ObjectType: '1470000113',
            TargetTable: 'OPRQ',
            DraftObjectType: '112',
            DraftTable: 'ODRF',
            _isDraft: true
          };
        }
      } catch {}
      const response = await api.get(`/sap/PurchaseRequests(${docEntry})`);
      return response.data;
    } catch (error) {
      try {
        const draftRes = await api.get(`/sap/Drafts(${docEntry})`);
        if (draftRes.data) return { ...draftRes.data, _isDraft: true, DraftObjectType: '112', DraftTable: 'ODRF' };
      } catch {}
      return handleApiError(error, 'getPurchaseRequest');
    }
  },

  getPurchaseDownPayment: async (docEntry: number, isDraft = false) => {
    try {
      if (isDraft) {
        try {
          const draftRes = await api.get(`/sap/Drafts(${docEntry})`);
          if (draftRes.data) {
            return {
              ...draftRes.data,
              DocEntry: docEntry,
              ObjectType: '204',
              TargetTable: 'ODPO',
              DraftObjectType: '112',
              DraftTable: 'ODRF',
              _isDraft: true
            };
          }
        } catch {}
      }
      try {
        const draftCheck = await api.get(`/approvals/draft-detail/${docEntry}`);
        if (draftCheck.data?.approvalRecord?.objectType === '204' && !draftCheck.data?.approvalRecord?.convertedDocEntry && draftCheck.data?.draftData) {
          return {
            ...draftCheck.data.draftData,
            DocEntry: docEntry,
            ObjectType: '204',
            TargetTable: 'ODPO',
            DraftObjectType: '112',
            DraftTable: 'ODRF',
            _isDraft: true
          };
        }
      } catch {}
      const response = await api.get(`/sap/PurchaseDownPayments(${docEntry})`);
      return response.data;
    } catch (error) {
      try {
        const draftRes = await api.get(`/sap/Drafts(${docEntry})`);
        if (draftRes.data) return { ...draftRes.data, _isDraft: true, DraftObjectType: '112', DraftTable: 'ODRF' };
      } catch {}
      return handleApiError(error, 'getPurchaseDownPayment');
    }
  },

  createPurchaseOrder: async (data: any, userEmail?: string, asDraft = false) => {
    try {
      const today = calculateUDataPgtoFromPymntGroup('');
      const headerProject = data.CostingCode4 || data.U_Projeto || data.ProjectCode || data.Project || '';
      const rawHeaderUsage = data.MainUsage ?? data.TaxExtension?.MainUsage ?? data.Usage ?? (data.DocumentLines || []).find((l: any) => l.Usage)?.Usage;
      const headerUsage = rawHeaderUsage ? parseInt(String(rawHeaderUsage), 10) : undefined;
      const paymentGroupCode = data.PaymentGroupCode !== undefined && data.PaymentGroupCode !== null && data.PaymentGroupCode !== ''
        ? parseInt(String(data.PaymentGroupCode), 10)
        : undefined;
      let uDataPgto = data.U_DataPgto || data.U_dataPgto;
      if (!uDataPgto) {
        if (paymentGroupCode !== undefined && !isNaN(paymentGroupCode) && paymentGroupCode !== -1) {
          try {
            const ptRes = await api.get(`/sap/PaymentTermsTypes(${paymentGroupCode})`);
            const pymntGroup = ptRes.data?.PaymentTermsGroupName ?? ptRes.data?.PymntGroup ?? ptRes.data?.U_DiasPC;
            uDataPgto = calculateUDataPgtoFromPymntGroup(pymntGroup, data.DocDate || today);
          } catch {
            uDataPgto = data.DocDate || today;
          }
        } else {
          uDataPgto = data.DocDate || today;
        }
      }
      const docCurrency = data.DocCurrency || 'R$';
      const formattedData: any = {
        ...data,
        DocDate: data.DocDate || today,
        TaxDate: data.TaxDate || today,
        DocCurrency: docCurrency,
        U_DataPgto: uDataPgto,
        ...(paymentGroupCode !== undefined && !isNaN(paymentGroupCode) ? { PaymentGroupCode: paymentGroupCode } : {}),
        ...(headerUsage ? {
          MainUsage: headerUsage,
          TaxExtension: {
            ...(data.TaxExtension || {}),
            MainUsage: headerUsage
          }
        } : {}),
        DocumentLines: (data.DocumentLines || []).map((line: any) => {
          const lineProject = line.CostingCode4 || line.ProjectCode || line.Project || headerProject || 'BASE';
          const lineUsage = line.Usage ? parseInt(String(line.Usage), 10) : headerUsage;
          const lineCurrency = line.Currency || docCurrency;
          return {
            ItemCode: line.ItemCode,
            ItemDescription: line.ItemDescription || line.ItemName || line.Dscription || undefined,
            Quantity: line.Quantity,
            UnitPrice: line.Price !== undefined ? line.Price : (line.UnitPrice || 0),
            Currency: lineCurrency,
            ...(line.MeasureUnit ? { MeasureUnit: line.MeasureUnit } : {}),
            ...(line.UoMCode ? { UoMCode: line.UoMCode } : (line.MeasureUnit ? { UoMCode: line.MeasureUnit } : {})),
            CostingCode: line.CostingCode || 'BR',
            CostingCode2: line.CostingCode2 || 'MATRIZ',
            CostingCode3: line.CostingCode3 || 'OPER_OFF',
            CostingCode4: lineProject,
            CostingCode5: line.CostingCode5 || undefined,
            Usage: lineUsage || undefined,
            ...(line.BaseType !== undefined ? {
              BaseType: line.BaseType,
              BaseEntry: line.BaseEntry,
              BaseLine: line.BaseLine
            } : {})
          };
        })
      };

      delete formattedData.Project;
      delete formattedData.ProjectCode;
      if (headerProject) {
        formattedData.U_Projeto = headerProject;
      }

      // Save as Draft in SAP and register for line-by-line approval
      try {
        const draftRes = await api.post('/approvals/create-draft', {
          docObjectCode: 'oPurchaseOrders',
          objectType: '22',
          payload: formattedData,
          userEmail: userEmail || data.RequesterEmail,
          userName: data.RequesterName,
          standaloneDraft: Boolean(asDraft || data._standaloneDraft || data._asDraft)
        });
        if (draftRes.data && draftRes.data.draftDocEntry) {
          return {
            ...draftRes.data.sapDraft,
            DocEntry: draftRes.data.draftDocEntry,
            DocNum: draftRes.data.draftDocNum || draftRes.data.draftDocEntry,
            _isDraft: true,
            _portalApproval: draftRes.data.approvalRecord
          };
        }
      } catch (draftErr: any) {
        console.warn('Draft endpoint error, falling back to direct /sap/Drafts:', draftErr?.message);
      }

      const response = await api.post('/sap/Drafts', {
        ...formattedData,
        DocObjectCode: 'oPurchaseOrders'
      });
      return response.data;
    } catch (error) {
      return handleApiError(error, 'createPurchaseOrder');
    }
  },

  createPurchaseRequest: async (data: any, userEmail?: string, asDraft = false) => {
    try {
      const today = calculateUDataPgtoFromPymntGroup('');
      const headerProject = data.CostingCode4 || data.U_Projeto || data.ProjectCode || data.Project || '';
      const rawHeaderUsage = data.MainUsage ?? data.TaxExtension?.MainUsage ?? data.Usage ?? (data.DocumentLines || []).find((l: any) => l.Usage)?.Usage;
      const headerUsage = rawHeaderUsage ? parseInt(String(rawHeaderUsage), 10) : undefined;
      const paymentGroupCode = data.PaymentGroupCode !== undefined && data.PaymentGroupCode !== null && data.PaymentGroupCode !== ''
        ? parseInt(String(data.PaymentGroupCode), 10)
        : undefined;
      let uDataPgto = data.U_DataPgto || data.U_dataPgto;
      if (!uDataPgto) {
        if (paymentGroupCode !== undefined && !isNaN(paymentGroupCode) && paymentGroupCode !== -1) {
          try {
            const ptRes = await api.get(`/sap/PaymentTermsTypes(${paymentGroupCode})`);
            const pymntGroup = ptRes.data?.PaymentTermsGroupName ?? ptRes.data?.PymntGroup ?? ptRes.data?.U_DiasPC;
            uDataPgto = calculateUDataPgtoFromPymntGroup(pymntGroup, data.DocDate || today);
          } catch {
            uDataPgto = data.DocDate || today;
          }
        } else {
          uDataPgto = data.DocDate || today;
        }
      }
      const reqDateStr = String(data.RequriedDate || data.RequiredDate || data.ReqDate || data.DocDueDate || today).split('T')[0];
      const formattedData: any = {
        ...data,
        DocDate: String(data.DocDate || today).split('T')[0],
        TaxDate: String(data.TaxDate || today).split('T')[0],
        DocDueDate: String(data.DocDueDate || reqDateStr).split('T')[0],
        RequriedDate: reqDateStr,
        RequesterEmail: userEmail,
        U_DataPgto: uDataPgto,
        ...(paymentGroupCode !== undefined && !isNaN(paymentGroupCode) ? { PaymentGroupCode: paymentGroupCode } : {}),
        ...(headerUsage ? {
          MainUsage: headerUsage,
          TaxExtension: {
            ...(data.TaxExtension || {}),
            MainUsage: headerUsage
          }
        } : {}),
        DocumentLines: (data.DocumentLines || []).map((line: any) => {
          const lineProject = line.CostingCode4 || line.ProjectCode || line.Project || headerProject || 'BASE';
          const lineUsage = line.Usage ? parseInt(String(line.Usage), 10) : headerUsage;
          const lineReqDate = String(line.RequiredDate || line.RequriedDate || reqDateStr).split('T')[0];
          return {
            ItemCode: line.ItemCode,
            ItemDescription: line.ItemDescription || line.ItemName || line.Dscription || undefined,
            Quantity: line.Quantity,
            UnitPrice: line.Price !== undefined ? line.Price : (line.UnitPrice || 0),
            ...(line.MeasureUnit ? { MeasureUnit: line.MeasureUnit } : {}),
            ...(line.UoMCode ? { UoMCode: line.UoMCode } : (line.MeasureUnit ? { UoMCode: line.MeasureUnit } : {})),
            RequiredDate: lineReqDate,
            ShipDate: lineReqDate,
            CostingCode: line.CostingCode || 'BR',
            CostingCode2: line.CostingCode2 || 'MATRIZ',
            CostingCode3: line.CostingCode3 || 'OPER_OFF',
            CostingCode4: lineProject,
            CostingCode5: line.CostingCode5 || undefined,
            Usage: lineUsage || undefined
          };
        })
      };
      delete formattedData.ReqDate;
      delete formattedData.RequiredDate;
      delete formattedData.Project;
      delete formattedData.ProjectCode;
      if (headerProject) formattedData.U_Projeto = headerProject;

      // Save as Draft in SAP and register for line-by-line approval
      try {
        const draftRes = await api.post('/approvals/create-draft', {
          docObjectCode: 'oPurchaseRequest',
          objectType: '1470000113',
          payload: formattedData,
          userEmail,
          userName: data.RequesterName,
          standaloneDraft: Boolean(asDraft || data._standaloneDraft || data._asDraft)
        });
        if (draftRes.data && draftRes.data.draftDocEntry) {
          return {
            ...draftRes.data.sapDraft,
            DocEntry: draftRes.data.draftDocEntry,
            DocNum: draftRes.data.draftDocNum || draftRes.data.draftDocEntry,
            ObjectType: '1470000113',
            TargetTable: 'OPRQ',
            DraftObjectType: '112',
            DraftTable: 'ODRF',
            _isDraft: true,
            _portalApproval: draftRes.data.approvalRecord
          };
        }
      } catch (draftErr: any) {
        console.warn('Draft endpoint error, falling back to direct /sap/Drafts:', draftErr?.message);
      }

      const response = await api.post('/sap/Drafts', {
        ...formattedData,
        DocObjectCode: 'oPurchaseRequest',
        ObjectType: '1470000113'
      });
      return {
        ...response.data,
        ObjectType: '1470000113',
        TargetTable: 'OPRQ',
        DraftObjectType: '112',
        DraftTable: 'ODRF',
        _isDraft: true
      };
    } catch (error) {
      return handleApiError(error, 'createPurchaseRequest');
    }
  },

  getPurchaseQuotation: async (docEntry: number, isDraft = false) => {
    try {
      if (isDraft) {
        try {
          const draftRes = await api.get(`/sap/Drafts(${docEntry})`);
          if (draftRes.data) {
            return {
              ...draftRes.data,
              DocEntry: docEntry,
              ObjectType: '540000006',
              TargetTable: 'OPQT',
              DraftObjectType: '112',
              DraftTable: 'ODRF',
              _isDraft: true
            };
          }
        } catch {}
      }
      try {
        const draftCheck = await api.get(`/approvals/draft-detail/${docEntry}`);
        if (draftCheck.data?.approvalRecord?.objectType === '540000006' && !draftCheck.data?.approvalRecord?.convertedDocEntry && draftCheck.data?.draftData) {
          return {
            ...draftCheck.data.draftData,
            DocEntry: docEntry,
            ObjectType: '540000006',
            TargetTable: 'OPQT',
            DraftObjectType: '112',
            DraftTable: 'ODRF',
            _isDraft: true
          };
        }
      } catch {}
      const response = await api.get(`/sap/PurchaseQuotations(${docEntry})`);
      return response.data;
    } catch (error) {
      try {
        const draftRes = await api.get(`/sap/Drafts(${docEntry})`);
        if (draftRes.data) {
          return {
            ...draftRes.data,
            DocEntry: docEntry,
            ObjectType: '540000006',
            TargetTable: 'OPQT',
            DraftObjectType: '112',
            DraftTable: 'ODRF',
            _isDraft: true
          };
        }
      } catch {}
      return handleApiError(error, 'getPurchaseQuotation');
    }
  },

  updatePurchaseQuotation: async (docEntry: number, data: any, isDraft = false, userEmail?: string) => {
    try {
      if (isDraft || data?._isDraft) {
        const cleanData = { ...data };
        delete cleanData._isDraft;
        const draftRes = await api.patch(`/approvals/draft/${docEntry}`, {
          objectType: '540000006',
          docObjectCode: 'oPurchaseQuotations',
          payload: cleanData,
          userEmail
        });
        return draftRes.data;
      }
      try {
        const response = await api.patch(`/sap/PurchaseQuotations(${docEntry})`, data);
        return response.data;
      } catch (err: any) {
        if (err?.response?.status === 404 || err?.response?.status === 400) {
          const draftRes = await api.patch(`/approvals/draft/${docEntry}`, {
            objectType: '540000006',
            docObjectCode: 'oPurchaseQuotations',
            payload: data,
            userEmail
          });
          return draftRes.data;
        }
        throw err;
      }
    } catch (error) {
      return handleApiError(error, 'updatePurchaseQuotation');
    }
  },

  createPurchaseQuotation: async (data: any, userEmail?: string, asDraft = false) => {
    try {
      const today = calculateUDataPgtoFromPymntGroup('');
      const headerProject = data.CostingCode4 || data.U_Projeto || data.ProjectCode || data.Project || '';
      const rawHeaderUsage = data.MainUsage ?? data.TaxExtension?.MainUsage ?? data.Usage ?? (data.DocumentLines || []).find((l: any) => l.Usage)?.Usage;
      const headerUsage = rawHeaderUsage ? parseInt(String(rawHeaderUsage), 10) : undefined;
      const paymentGroupCode = data.PaymentGroupCode !== undefined && data.PaymentGroupCode !== null && data.PaymentGroupCode !== ''
        ? parseInt(String(data.PaymentGroupCode), 10)
        : undefined;
      let uDataPgto = data.U_DataPgto || data.U_dataPgto;
      if (!uDataPgto) {
        if (paymentGroupCode !== undefined && !isNaN(paymentGroupCode) && paymentGroupCode !== -1) {
          try {
            const ptRes = await api.get(`/sap/PaymentTermsTypes(${paymentGroupCode})`);
            const pymntGroup = ptRes.data?.PaymentTermsGroupName ?? ptRes.data?.PymntGroup ?? ptRes.data?.U_DiasPC;
            uDataPgto = calculateUDataPgtoFromPymntGroup(pymntGroup, data.DocDate || today);
          } catch {
            uDataPgto = data.DocDate || today;
          }
        } else {
          uDataPgto = data.DocDate || today;
        }
      }
      const reqDateStr = String(data.RequriedDate || data.RequiredDate || data.ReqDate || data.DocDueDate || today).split('T')[0];
      const docCurrency = data.DocCurrency || 'R$';
      const formattedData: any = {
        ...data,
        DocDate: String(data.DocDate || today).split('T')[0],
        TaxDate: String(data.TaxDate || today).split('T')[0],
        DocDueDate: String(data.DocDueDate || reqDateStr).split('T')[0],
        RequriedDate: reqDateStr,
        DocCurrency: docCurrency,
        RequesterEmail: userEmail || data.RequesterEmail,
        U_DataPgto: uDataPgto,
        ...(paymentGroupCode !== undefined && !isNaN(paymentGroupCode) ? { PaymentGroupCode: paymentGroupCode } : {}),
        ...(headerUsage ? {
          MainUsage: headerUsage,
          TaxExtension: {
            ...(data.TaxExtension || {}),
            MainUsage: headerUsage
          }
        } : {}),
        DocumentLines: (data.DocumentLines || []).map((line: any) => {
          const lineProject = line.CostingCode4 || line.ProjectCode || line.Project || headerProject || 'BASE';
          const lineUsage = line.Usage ? parseInt(String(line.Usage), 10) : headerUsage;
          const lineReqDate = String(line.RequiredDate || line.RequriedDate || reqDateStr).split('T')[0];
          const lineCurrency = line.Currency || docCurrency;
          return {
            ItemCode: line.ItemCode,
            ItemDescription: line.ItemDescription || line.ItemName || line.Dscription || undefined,
            Quantity: line.Quantity,
            UnitPrice: line.Price !== undefined ? line.Price : (line.UnitPrice || 0),
            Currency: lineCurrency,
            ...(line.MeasureUnit ? { MeasureUnit: line.MeasureUnit } : {}),
            ...(line.UoMCode ? { UoMCode: line.UoMCode } : (line.MeasureUnit ? { UoMCode: line.MeasureUnit } : {})),
            RequiredDate: lineReqDate,
            ShipDate: lineReqDate,
            CostingCode: line.CostingCode || 'BR',
            CostingCode2: line.CostingCode2 || 'MATRIZ',
            CostingCode3: line.CostingCode3 || 'OPER_OFF',
            CostingCode4: lineProject,
            CostingCode5: line.CostingCode5 || undefined,
            Usage: lineUsage || undefined,
            ...(line.BaseType !== undefined ? {
              BaseType: line.BaseType,
              BaseEntry: line.BaseEntry,
              BaseLine: line.BaseLine
            } : {})
          };
        })
      };
      delete formattedData.ReqDate;
      delete formattedData.RequiredDate;
      delete formattedData.Project;
      delete formattedData.ProjectCode;
      if (headerProject) formattedData.U_Projeto = headerProject;

      // Save as Draft in SAP ODRF (112) with target ObjType 540000006 (OPQT / oPurchaseQuotations) and register for line-by-line approval
      try {
        const draftRes = await api.post('/approvals/create-draft', {
          docObjectCode: '540000006',
          objectType: '540000006',
          payload: formattedData,
          userEmail: userEmail || data.RequesterEmail,
          userName: data.RequesterName,
          standaloneDraft: Boolean(asDraft || data._standaloneDraft || data._asDraft)
        });
        if (draftRes.data && draftRes.data.draftDocEntry) {
          return {
            ...draftRes.data.sapDraft,
            DocEntry: draftRes.data.draftDocEntry,
            DocNum: draftRes.data.draftDocNum || draftRes.data.draftDocEntry,
            ObjectType: '540000006',
            TargetTable: 'OPQT',
            DraftObjectType: '112',
            DraftTable: 'ODRF',
            _isDraft: true,
            _portalApproval: draftRes.data.approvalRecord
          };
        }
      } catch (draftErr: any) {
        console.warn('Draft endpoint error for PurchaseQuotation (540000006), falling back to direct /sap/Drafts:', draftErr?.message);
      }

      const response = await api.post('/sap/Drafts', {
        ...formattedData,
        DocObjectCode: '540000006',
        ObjectType: '540000006'
      });
      return {
        ...response.data,
        ObjectType: '540000006',
        TargetTable: 'OPQT',
        DraftObjectType: '112',
        DraftTable: 'ODRF',
        _isDraft: true
      };
    } catch (error) {
      return handleApiError(error, 'createPurchaseQuotation');
    }
  },

  createPurchaseDownPayment: async (data: any, userEmail?: string, asDraft = false) => {
    try {
      const today = calculateUDataPgtoFromPymntGroup('');
      const headerProject = data.CostingCode4 || data.U_Projeto || data.ProjectCode || data.Project || '';
      const rawHeaderUsage = data.MainUsage ?? data.TaxExtension?.MainUsage ?? data.Usage ?? (data.DocumentLines || []).find((l: any) => l.Usage)?.Usage;
      const headerUsage = rawHeaderUsage ? parseInt(String(rawHeaderUsage), 10) : undefined;
      const paymentGroupCode = data.PaymentGroupCode !== undefined && data.PaymentGroupCode !== null && data.PaymentGroupCode !== ''
        ? parseInt(String(data.PaymentGroupCode), 10)
        : undefined;
      let uDataPgto = data.U_DataPgto || data.U_dataPgto;
      if (!uDataPgto) {
        if (paymentGroupCode !== undefined && !isNaN(paymentGroupCode) && paymentGroupCode !== -1) {
          try {
            const ptRes = await api.get(`/sap/PaymentTermsTypes(${paymentGroupCode})`);
            const pymntGroup = ptRes.data?.PaymentTermsGroupName ?? ptRes.data?.PymntGroup ?? ptRes.data?.U_DiasPC;
            uDataPgto = calculateUDataPgtoFromPymntGroup(pymntGroup, data.DocDate || today);
          } catch {
            uDataPgto = data.DocDate || today;
          }
        } else {
          uDataPgto = data.DocDate || today;
        }
      }
      const formattedData: any = {
        ...data,
        DocDate: data.DocDate || today,
        TaxDate: data.TaxDate || today,
        DocType: 'dDocument_Items',
        DownPaymentType: 'dptInvoice',
        RequesterEmail: userEmail || data.RequesterEmail,
        U_DataPgto: uDataPgto,
        ...(paymentGroupCode !== undefined && !isNaN(paymentGroupCode) ? { PaymentGroupCode: paymentGroupCode } : {}),
        ...(headerUsage ? {
          MainUsage: headerUsage,
          TaxExtension: {
            ...(data.TaxExtension || {}),
            MainUsage: headerUsage
          }
        } : {}),
        DocumentLines: (data.DocumentLines || []).map((line: any) => {
          const lineProject = line.CostingCode4 || line.ProjectCode || line.Project || headerProject || 'BASE';
          const lineUsage = line.Usage ? parseInt(String(line.Usage), 10) : headerUsage;
          return {
            ItemCode: line.ItemCode,
            ItemDescription: line.ItemDescription || line.ItemName || line.Dscription || undefined,
            Quantity: line.Quantity,
            UnitPrice: line.Price !== undefined ? line.Price : (line.UnitPrice || 0),
            ...(line.MeasureUnit ? { MeasureUnit: line.MeasureUnit } : {}),
            ...(line.UoMCode ? { UoMCode: line.UoMCode } : (line.MeasureUnit ? { UoMCode: line.MeasureUnit } : {})),
            CostingCode: line.CostingCode || 'BR',
            CostingCode2: line.CostingCode2 || 'MATRIZ',
            CostingCode3: line.CostingCode3 || 'OPER_OFF',
            CostingCode4: lineProject,
            CostingCode5: line.CostingCode5 || undefined,
            Usage: lineUsage || undefined
          };
        })
      };
      delete formattedData.Project;
      delete formattedData.ProjectCode;
      if (headerProject) formattedData.U_Projeto = headerProject;

      // Save as Draft in SAP ODRF (112) with target ObjType 204 (ODPO / oPurchaseDownPayments) and register for line-by-line approval
      try {
        const draftRes = await api.post('/approvals/create-draft', {
          docObjectCode: 'oPurchaseDownPayments',
          objectType: '204',
          payload: formattedData,
          userEmail: userEmail || data.RequesterEmail,
          userName: data.RequesterName
        });
        if (draftRes.data && draftRes.data.draftDocEntry) {
          return {
            ...draftRes.data.sapDraft,
            DocEntry: draftRes.data.draftDocEntry,
            DocNum: draftRes.data.draftDocNum || draftRes.data.draftDocEntry,
            ObjectType: '204',
            TargetTable: 'ODPO',
            DraftObjectType: '112',
            DraftTable: 'ODRF',
            _isDraft: true,
            _portalApproval: draftRes.data.approvalRecord
          };
        }
      } catch (draftErr: any) {
        console.warn('Draft endpoint error, falling back to direct /sap/Drafts:', draftErr?.message);
      }

      const response = await api.post('/sap/Drafts', {
        ...formattedData,
        DocObjectCode: 'oPurchaseDownPayments',
        ObjectType: '204'
      });
      return {
        ...response.data,
        ObjectType: '204',
        TargetTable: 'ODPO',
        DraftObjectType: '112',
        DraftTable: 'ODRF',
        _isDraft: true
      };
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

  updatePurchaseOrder: async (docEntry: number, data: any, isDraft = false, userEmail?: string) => {
    try {
      if (isDraft || data?._isDraft) {
        const cleanData = { ...data };
        delete cleanData._isDraft;
        const draftRes = await api.patch(`/approvals/draft/${docEntry}`, {
          objectType: '22',
          docObjectCode: 'oPurchaseOrders',
          payload: cleanData,
          userEmail
        });
        return draftRes.data;
      }
      const response = await api.patch(`/sap/PurchaseOrders(${docEntry})`, data);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'updatePurchaseOrder');
    }
  },

  updatePurchaseRequest: async (docEntry: number, data: any, isDraft = false, userEmail?: string) => {
    try {
      if (isDraft || data?._isDraft) {
        const cleanData = { ...data };
        delete cleanData._isDraft;
        const draftRes = await api.patch(`/approvals/draft/${docEntry}`, {
          objectType: '1470000113',
          docObjectCode: 'oPurchaseRequests',
          payload: cleanData,
          userEmail
        });
        return draftRes.data;
      }
      const response = await api.patch(`/sap/PurchaseRequests(${docEntry})`, data);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'updatePurchaseRequest');
    }
  },

  updatePurchaseDownPayment: async (docEntry: number, data: any, isDraft = false, userEmail?: string) => {
    try {
      if (isDraft || data?._isDraft) {
        const cleanData = { ...data };
        delete cleanData._isDraft;
        const draftRes = await api.patch(`/approvals/draft/${docEntry}`, {
          objectType: '204',
          docObjectCode: 'oPurchaseDownPayments',
          payload: cleanData,
          userEmail
        });
        return draftRes.data;
      }
      const response = await api.patch(`/sap/PurchaseDownPayments(${docEntry})`, data);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'updatePurchaseDownPayment');
    }
  },

  /**
   * Generic Marketing Document Creation as Draft (ODRF - ObjType 112) for all 10 SAP Object Types:
   * 1470000113 (OPRQ), 540000006 (OPQT), 22 (OPOR), 20 (OPDN), 21 (ORPD), 18 (OPCH), 19 (ORPC), 204 (ODPO), 69 (OIPF), 112 (ODRF)
   */
  createMarketingDocumentDraft: async (objectTypeOrCode: string | number, data: any, userEmail?: string) => {
    try {
      const meta = resolveMarketingObjectMeta(objectTypeOrCode, data?.DocObjectCode);
      const draftRes = await api.post('/approvals/create-draft', {
        docObjectCode: meta.docObjectCode,
        objectType: meta.objType,
        payload: data,
        userEmail: userEmail || data?.RequesterEmail,
        userName: data?.RequesterName
      });
      return draftRes.data;
    } catch (error) {
      return handleApiError(error, 'createMarketingDocumentDraft');
    }
  },

  /**
   * Generic Marketing Document Update (PATCH) for both Drafts (ODRF - 112) and Effective Documents
   */
  updateMarketingDocument: async (
    objectTypeOrCode: string | number,
    docEntry: number,
    data: any,
    isDraft = false,
    userEmail?: string
  ) => {
    try {
      const meta = resolveMarketingObjectMeta(objectTypeOrCode, data?.DocObjectCode);
      if (isDraft || data?._isDraft || meta.objType === '112') {
        const cleanData = { ...data };
        delete cleanData._isDraft;
        const draftRes = await api.patch(`/approvals/draft/${docEntry}`, {
          objectType: meta.objType,
          docObjectCode: meta.docObjectCode,
          payload: cleanData,
          userEmail
        });
        return draftRes.data;
      }
      const response = await api.patch(`/sap/${meta.serviceLayerEndpoint}(${docEntry})`, data);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'updateMarketingDocument');
    }
  },

  /**
   * Generic Marketing Document Cancellation / Deletion for both Drafts (ODRF - 112) and Effective Documents
   */
  cancelMarketingDocument: async (
    objectTypeOrCode: string | number,
    docEntry: number,
    isDraft = false,
    reason?: string,
    userEmail?: string
  ) => {
    try {
      const meta = resolveMarketingObjectMeta(objectTypeOrCode);
      const response = await api.post('/approvals/cancel-document', {
        docEntry,
        objectType: meta.objType,
        docObjectCode: meta.docObjectCode,
        isDraft,
        reason,
        userEmail
      });
      return response.data;
    } catch (error) {
      return handleApiError(error, 'cancelMarketingDocument');
    }
  },

  getBusinessPartners: async (name?: string) => {
    try {
      // Include BPFiscalTaxIDCollection, EmailAddress, Currency, and PayTermsGrpCode
      let url = "/sap/BusinessPartners?$select=CardCode,CardName,FederalTaxID,Frozen,CardType,EmailAddress,PayTermsGrpCode,Currency,DefaultCurrency,BPCurrenciesCollection,BPFiscalTaxIDCollection&$top=100";
      let filter = "(CardType eq 'cSupplier' or CardType eq 'S') and startswith(CardCode, 'F')";
      if (name && name.trim()) {
        const safe = name.trim().replace(/'/g, "''");
        const upper = safe.toUpperCase();
        filter += ` and (contains(CardName, '${safe}') or contains(CardName, '${upper}') or contains(CardCode, '${upper}'))`;
      }
      const response = await api.get(`${url}&$filter=${filter}`);
      
      // Map to extract CNPJ/CPF from BPFiscalTaxIDCollection if FederalTaxID is empty
      const partners = (response.data.value || []).map((bp: any) => {
        let taxId = bp.FederalTaxID;
        if (!taxId && bp.BPFiscalTaxIDCollection && bp.BPFiscalTaxIDCollection.length > 0) {
          const fiscalEntry = bp.BPFiscalTaxIDCollection.find((f: any) => f.TaxId0 || f.TaxId4);
          if (fiscalEntry) {
            taxId = fiscalEntry.TaxId0 || fiscalEntry.TaxId4;
          }
        }
        return { ...bp, FederalTaxID: taxId };
      });

      // Strictly filter active suppliers whose CardCode starts with 'F' (excluding 'CO')
      return partners.filter((bp: any) => {
        const codeUpper = String(bp.CardCode || '').trim().toUpperCase();
        const isF = codeUpper.startsWith('F') && !codeUpper.startsWith('CO');
        const isActive = bp.Frozen === 'tNO' || bp.Frozen === 'N' || !bp.Frozen;
        return isF && isActive;
      });
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
      let url = "/sap/BusinessPartners?$select=CardCode,CardName,FederalTaxID,Frozen,CardType,EmailAddress,PayTermsGrpCode,Currency,DefaultCurrency,BPCurrenciesCollection,BPFiscalTaxIDCollection&$top=100";
      let filter = "";
      if (partnerType === 'supplier') {
        filter = "(CardType eq 'cSupplier' or CardType eq 'S') and startswith(CardCode, 'F')";
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
        const activeList = list.filter((bp: any) => {
          const isActive = bp.Frozen === 'tNO' || bp.Frozen === 'N' || !bp.Frozen;
          if (!isActive) return false;
          if (partnerType === 'supplier') {
            const codeUpper = String(bp.CardCode || '').trim().toUpperCase();
            if (!codeUpper.startsWith('F') || codeUpper.startsWith('CO')) return false;
          }
          return true;
        });
        if (query && query.trim()) {
          return activeList.filter((bp: any) => matchPartnerQuery(bp, query));
        }
        return activeList;
      } catch (err) {
        const fallbackRes = await api.get("/sap/BusinessPartners?$select=CardCode,CardName,FederalTaxID,Frozen,CardType&$top=150");
        const list = fallbackRes.data?.value || [];
        return list.filter((bp: any) => {
          if (bp.Frozen === 'tYES' || bp.Frozen === 'Y') return false;
          if (partnerType === 'supplier') {
            const codeUpper = String(bp.CardCode || '').trim().toUpperCase();
            if ((bp.CardType !== 'cSupplier' && bp.CardType !== 'S') || !codeUpper.startsWith('F') || codeUpper.startsWith('CO')) {
              return false;
            }
          }
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
      const baseSelect = "ItemCode,ItemName,Frozen,ItemPrices,PurchaseUnit,SalesUnit,InventoryUOM";

      if (sanitizedName) {
        const allItems: any[] = [];
        const seenCodes = new Set<string>();

        // 1. Direct ItemCode lookup attempt (instant and exact in SAP)
        const directCode = sanitizedName.toUpperCase().trim();
        try {
          const directRes = await api.get(`/sap/Items('${encodeURIComponent(directCode)}')?$select=${baseSelect}`);
          if (directRes.data && directRes.data.ItemCode) {
            const it = directRes.data;
            if (it.Frozen === 'tNO' || it.Frozen === 'N' || !it.Frozen) {
              seenCodes.add(it.ItemCode);
              allItems.push(it);
            }
          }
        } catch {}

        // Build rich search variants to match case-sensitive & accent-sensitive SAP DB
        const rawTokens = sanitizedName.split(/\s+/).filter(Boolean);
        const searchTargets = Array.from(new Set([sanitizedName, ...rawTokens]));
        
        const variants = new Set<string>();

        for (const target of searchTargets) {
          if (!target) continue;
          
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

        // Build combined filter clauses in batches of 3 variants
        const batchSize = 3;
        const batches: string[][] = [];
        for (let i = 0; i < variantList.length; i += batchSize) {
          batches.push(variantList.slice(i, i + batchSize));
        }

        await Promise.all(
          batches.slice(0, 5).map(async (batch) => {
            const orConditions: string[] = [];
            for (const v of batch) {
              const safeV = v.replace(/'/g, "''");
              orConditions.push(`contains(ItemName, '${safeV}')`);
              orConditions.push(`contains(ItemCode, '${safeV}')`);
              orConditions.push(`startswith(ItemCode, '${safeV}')`);
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
                // Fallback for single variant if combined OData fails: search BOTH ItemCode and ItemName
                try {
                  for (const singleV of batch) {
                    const fallbackFilter = `(startswith(ItemCode, '${singleV}') or contains(ItemCode, '${singleV}') or contains(ItemName, '${singleV}')) and Frozen ne 'tYES'`;
                    const fallbackUrl = `/sap/Items?$select=${baseSelect}&$filter=${encodeURIComponent(fallbackFilter)}&$skip=${skip}&$top=40`;
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

        // Sort items by relevance: exact match or startsWith first on ItemCode, then on ItemName
        const term = sanitizedName.toUpperCase();
        const cleanNormTerm = sanitizedName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

        return allItems.sort((a, b) => {
          const aCode = (a.ItemCode || '').toUpperCase();
          const bCode = (b.ItemCode || '').toUpperCase();
          const aName = (a.ItemName || '').toUpperCase();
          const bName = (b.ItemName || '').toUpperCase();
          const aNorm = aName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const bNorm = bName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

          // Exact match on Code
          if (aCode === term && bCode !== term) return -1;
          if (bCode === term && aCode !== term) return 1;

          // Exact match on Name
          if (aName === term && bName !== term) return -1;
          if (bName === term && aName !== term) return 1;

          // Code starts with
          const aCodeStarts = aCode.startsWith(term);
          const bCodeStarts = bCode.startsWith(term);
          if (aCodeStarts && !bCodeStarts) return -1;
          if (!aCodeStarts && bCodeStarts) return 1;

          // Name starts with
          const aNameStarts = aName.startsWith(term) || aNorm.startsWith(cleanNormTerm);
          const bNameStarts = bName.startsWith(term) || bNorm.startsWith(cleanNormTerm);
          if (aNameStarts && !bNameStarts) return -1;
          if (!aNameStarts && bNameStarts) return 1;

          return aCode.localeCompare(bCode) || aName.localeCompare(bName);
        });
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
      const response = await api.get(`/sap/Items('${encodeURIComponent(cleanCode)}')?$select=ItemCode,ItemName,ItemPrices,PurchaseUnit,SalesUnit,InventoryUOM`);
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

  getBusinessPlaces: async (forceRefresh = false) => {
    const defaultActiveBranches = [
      {
        BPLID: 1,
        BPLName: 'QUALITECH INSPECAO, REPARO E MANUTENCAO LTDA',
        AliasName: 'MATRIZ',
        FederalTaxID: '17.417.147/0001-84',
        Disabled: 'tNO'
      },
      {
        BPLID: 3,
        BPLName: 'QUALITECH MACAE',
        AliasName: 'MACAÉ',
        FederalTaxID: '17.417.147/0003-46',
        Disabled: 'tNO'
      },
      {
        BPLID: 4,
        BPLName: 'QUALITECH MAGE',
        AliasName: 'MAGÉ',
        FederalTaxID: '17.417.147/0002-65',
        Disabled: 'tNO'
      }
    ];

    if (!forceRefresh && _cachedBusinessPlaces && _cachedBusinessPlaces.length > 0) {
      return _cachedBusinessPlaces;
    }

    if (!forceRefresh && typeof window !== 'undefined') {
      try {
        const cachedStr = sessionStorage.getItem('sap_cached_active_bpl_v2');
        if (cachedStr) {
          const parsed = JSON.parse(cachedStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            _cachedBusinessPlaces = parsed;
            return parsed;
          }
        }
      } catch {}
    }

    try {
      // Query OBPL (BusinessPlaces) filtering only active branches (Disabled eq 'tNO')
      const response = await api.get("/sap/BusinessPlaces?$filter=Disabled eq 'tNO'&$select=BPLID,BPLName,AliasName,FederalTaxID,Disabled&$top=100");
      const activeBranches = (response.data?.value || []).filter(
        (b: any) => b.Disabled === 'tNO' || b.Disabled === 'N' || !b.Disabled
      );
      const finalBranches = activeBranches.length > 0 ? activeBranches : defaultActiveBranches;
      _cachedBusinessPlaces = finalBranches;
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('sap_cached_active_bpl_v2', JSON.stringify(finalBranches));
        } catch {}
      }
      return finalBranches;
    } catch (error) {
      try {
        const fallbackRes = await api.get("/sap/BusinessPlaces?$top=100");
        const active = (fallbackRes.data?.value || []).filter(
          (b: any) => b.Disabled === 'tNO' || b.Disabled === 'N' || !b.Disabled
        );
        const finalBranches = active.length > 0 ? active : defaultActiveBranches;
        _cachedBusinessPlaces = finalBranches;
        return finalBranches;
      } catch {
        return defaultActiveBranches;
      }
    }
  },

  getDistributionRules: async (forceRefresh = false) => {
    if (!forceRefresh && _cachedDistributionRules && _cachedDistributionRules.length > 0) {
      return _cachedDistributionRules;
    }
    if (!forceRefresh && typeof window !== 'undefined') {
      try {
        const cachedStr = sessionStorage.getItem('sap_cached_dist_rules_v2');
        if (cachedStr) {
          const parsed = JSON.parse(cachedStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            _cachedDistributionRules = parsed;
            return parsed;
          }
        }
      } catch {}
    }
    if (!forceRefresh && _cachedDistributionRulesPromise) {
      return _cachedDistributionRulesPromise;
    }

    _cachedDistributionRulesPromise = (async () => {
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
        
        const mapped = results.map((r: any) => ({
          FactorCode: r.CenterCode || r.OcrCode,
          FactorDescription: r.CenterName || r.OcrName,
          InWhichDimension: r.InWhichDimension || r.DimCode
        }));
        if (mapped.length > 0) {
          _cachedDistributionRules = mapped;
          try { sessionStorage.setItem('sap_cached_dist_rules_v2', JSON.stringify(mapped)); } catch {}
        }
        return mapped;
      } catch (error: any) {
        console.warn('ProfitCenters failed, falling back to DistributionRules...');
        try {
          const response = await api.get("/sap/DistributionRules?$select=FactorCode,FactorDescription,InWhichDimension&$top=1000");
          const mapped = (response.data.value || []).map((r: any) => ({
            FactorCode: r.FactorCode || r.OcrCode,
            FactorDescription: r.FactorDescription || r.OcrName,
            InWhichDimension: r.InWhichDimension || r.DimCode
          }));
          if (mapped.length > 0) {
            _cachedDistributionRules = mapped;
            try { sessionStorage.setItem('sap_cached_dist_rules_v2', JSON.stringify(mapped)); } catch {}
          }
          return mapped;
        } catch (e) {
          try {
            const response = await api.get("/sap/DistributionRules?$top=1000");
            const mapped = (response.data.value || []).map((r: any) => ({
              FactorCode: r.FactorCode || r.OcrCode,
              FactorDescription: r.FactorDescription || r.OcrName,
              InWhichDimension: r.InWhichDimension || r.DimCode
            }));
            if (mapped.length > 0) {
              _cachedDistributionRules = mapped;
              try { sessionStorage.setItem('sap_cached_dist_rules_v2', JSON.stringify(mapped)); } catch {}
            }
            return mapped;
          } catch (e2) {
            return _cachedDistributionRules || [];
          }
        }
      } finally {
        _cachedDistributionRulesPromise = null;
      }
    })();

    return _cachedDistributionRulesPromise;
  },

  getDimensions: async (forceRefresh = false) => {
    if (!forceRefresh && _cachedDimensions && _cachedDimensions.length > 0) {
      return _cachedDimensions;
    }
    if (!forceRefresh && typeof window !== 'undefined') {
      try {
        const cachedStr = sessionStorage.getItem('sap_cached_dimensions_v2');
        if (cachedStr) {
          const parsed = JSON.parse(cachedStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            _cachedDimensions = parsed;
            return parsed;
          }
        }
      } catch {}
    }

    try {
      // Try with filter first
      const response = await api.get("/sap/Dimensions?$filter=IsActive eq 'tYES'&$top=100");
      const mapped = (response.data.value || []).map((d: any) => ({
        ...d,
        DimensionCode: d.DimensionCode || d.DimensionNumber || d.Number || d.Code
      }));
      if (mapped.length > 0) {
        _cachedDimensions = mapped;
        try { sessionStorage.setItem('sap_cached_dimensions_v2', JSON.stringify(mapped)); } catch {}
      }
      return mapped;
    } catch (error: any) {
      try {
        // Try without filter if tYES/IsActive fails
        const response = await api.get("/sap/Dimensions?$top=100");
        const mapped = (response.data.value || [])
          .filter((d: any) => d.IsActive === 'tYES' || d.IsActive === 'Y' || d.Active === 'tYES')
          .map((d: any) => ({
            ...d,
            DimensionCode: d.DimensionCode || d.DimensionNumber || d.Number || d.Code
          }));
        if (mapped.length > 0) {
          _cachedDimensions = mapped;
          try { sessionStorage.setItem('sap_cached_dimensions_v2', JSON.stringify(mapped)); } catch {}
        }
        return mapped;
      } catch (e) {
        return _cachedDimensions || [];
      }
    }
  },

  getProjects: async (forceRefresh = false) => {
    if (!forceRefresh && _cachedProjects && _cachedProjects.length > 0) {
      return _cachedProjects;
    }
    if (!forceRefresh && typeof window !== 'undefined') {
      try {
        const cachedStr = sessionStorage.getItem('sap_cached_projects_v2');
        if (cachedStr) {
          const parsed = JSON.parse(cachedStr);
          if (Array.isArray(parsed) && parsed.length > 1) {
            _cachedProjects = parsed;
            return parsed;
          }
        }
      } catch {}
    }
    if (!forceRefresh && _cachedProjectsPromise) {
      return _cachedProjectsPromise;
    }

    _cachedProjectsPromise = (async () => {
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

        const finalProjects = Array.from(map.values());
        if (finalProjects.length > 1) {
          _cachedProjects = finalProjects;
          try { sessionStorage.setItem('sap_cached_projects_v2', JSON.stringify(finalProjects)); } catch {}
        }
        return finalProjects;
      } catch (error: any) {
        return _cachedProjects || [{ Code: 'BASE', Name: 'BASE' }];
      } finally {
        _cachedProjectsPromise = null;
      }
    })();

    return _cachedProjectsPromise;
  },

  getBuyers: async (forceRefresh = false) => {
    if (!forceRefresh && _cachedBuyers && _cachedBuyers.length > 0) {
      return _cachedBuyers;
    }
    if (!forceRefresh && typeof window !== 'undefined') {
      try {
        const cachedStr = sessionStorage.getItem('sap_cached_buyers_v3');
        if (cachedStr) {
          const parsed = JSON.parse(cachedStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            _cachedBuyers = parsed;
            return parsed;
          }
        }
      } catch {}
    }
    if (!forceRefresh && _cachedBuyersPromise) {
      return _cachedBuyersPromise;
    }

    _cachedBuyersPromise = (async () => {
      try {
        // Helper to fetch all pages if server/SAP returns pages of 20
        const fetchAllPages = async (initialUrl: string, fallbackUrl?: string, maxPages = 15): Promise<any[]> => {
          const collected: any[] = [];
          let currentUrl: string | null = initialUrl;
          let pageCount = 0;

          while (currentUrl && pageCount < maxPages) {
            pageCount++;
            let res: any;
            try {
              res = await api.get(currentUrl);
            } catch (err) {
              if (pageCount === 1 && fallbackUrl) {
                res = await api.get(fallbackUrl);
              } else {
                break;
              }
            }
            const data = res?.data;
            const list = data?.value || [];
            if (Array.isArray(list) && list.length > 0) {
              collected.push(...list);
            }
            const next = data?.['odata.nextLink'];
            if (next) {
              currentUrl = next.startsWith('/sap/') ? next : `/sap/${next}`;
            } else if (list.length === 20 && pageCount === 1 && !currentUrl.includes('$skip=')) {
              // In case nextLink was omitted on a 20-item page
              const sep = initialUrl.includes('?') ? '&' : '?';
              currentUrl = `${initialUrl}${sep}$skip=${collected.length}`;
            } else if (list.length === 20 && currentUrl.includes('$skip=')) {
              currentUrl = currentUrl.replace(/\$skip=\d+/, `$skip=${collected.length}`);
            } else {
              currentUrl = null;
            }
          }
          return collected;
        };

        const [spList, sapUsers] = await Promise.all([
          fetchAllPages(
            '/sap/SalesPersons?$top=500&$select=SalesEmployeeCode,SalesEmployeeName,Active,Email,Telephone,Mobile',
            '/sap/SalesPersons?$top=500'
          ),
          fetchAllPages(
            '/sap/Users?$top=500&$select=InternalKey,UserCode,UserName,eMail,MobilePhoneNumber',
            '/sap/Users?$top=500'
          ).catch(() => [])
        ]);

        const allBuyers: any[] = [];
        const seenCodes = new Set<number>();

        for (const item of spList) {
          const code = Number(item.SalesEmployeeCode);
          if (code === -1) continue; // -1 ("-Nenhum comprador-") is rendered as default option in UI
          const isActive = item.Active === 'tYES' || item.Active === 'Y' || !item.Active;
          if (!isNaN(code) && !seenCodes.has(code) && isActive) {
            seenCodes.add(code);
            const rawName = String(item.SalesEmployeeName || '').trim();
            if (!rawName || rawName.toLowerCase().includes('nenhum comprador') || rawName.toLowerCase().includes('nenhum vendedor')) {
              continue;
            }
            const nameNorm = rawName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const matchedUser = sapUsers.find((u: any) => {
              const uName = String(u.UserName || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              const uCode = String(u.UserCode || '').trim().toLowerCase();
              const uMail = String(u.eMail || '').trim().toLowerCase();
              const iMail = String(item.Email || '').trim().toLowerCase();
              return (
                (iMail && uMail && iMail === uMail) ||
                (uName && nameNorm && (uName === nameNorm || uName.includes(nameNorm) || nameNorm.includes(uName))) ||
                (uCode && nameNorm && uCode === nameNorm)
              );
            });

            const email = String(item.Email || matchedUser?.eMail || '').trim();
            const phone = String(item.Telephone || item.Mobile || matchedUser?.MobilePhoneNumber || '').trim();
            const mobile = String(item.Mobile || matchedUser?.MobilePhoneNumber || phone || '').trim();

            allBuyers.push({
              SalesEmployeeCode: code,
              SalesEmployeeName: rawName,
              Email: email,
              Telephone: phone,
              Mobile: mobile,
              Phone: phone,
              // Aliases used by ListOrdersView & Solicitações de Compra
              code: code,
              name: rawName,
              contactEmail: email,
              contactPhone: phone
            });
          }
        }

        // Sort alphabetically by buyer name
        allBuyers.sort((a, b) => String(a.SalesEmployeeName || '').localeCompare(String(b.SalesEmployeeName || ''), 'pt-BR'));

        if (allBuyers.length > 0) {
          _cachedBuyers = allBuyers;
          try { sessionStorage.setItem('sap_cached_buyers_v3', JSON.stringify(allBuyers)); } catch {}
        }
        return allBuyers;
      } catch (error) {
        console.error('Erro ao buscar compradores (OSLP/OUSR):', error);
        return _cachedBuyers || [];
      } finally {
        _cachedBuyersPromise = null;
      }
    })();

    return _cachedBuyersPromise;
  },

  getPaymentTerms: async (forceRefresh = false) => {
    if (!forceRefresh && _cachedPaymentTerms && _cachedPaymentTerms.length > 0) {
      return _cachedPaymentTerms;
    }
    if (!forceRefresh && typeof window !== 'undefined') {
      try {
        const cachedStr = sessionStorage.getItem('sap_cached_payment_terms_v3');
        if (cachedStr) {
          const parsed = JSON.parse(cachedStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            _cachedPaymentTerms = parsed;
            return parsed;
          }
        }
      } catch {}
    }
    if (!forceRefresh && _cachedPaymentTermsPromise) {
      return _cachedPaymentTermsPromise;
    }

    _cachedPaymentTermsPromise = (async () => {
      try {
        const allTerms: any[] = [];
        const seenGroups = new Set<number>();

        const addItems = (list: any[]) => {
          for (const item of list) {
            const grpNum = Number(item.GroupNumber ?? item.GroupNum);
            if (!isNaN(grpNum) && !seenGroups.has(grpNum)) {
              seenGroups.add(grpNum);
              allTerms.push({
                GroupNumber: grpNum,
                GroupNum: grpNum,
                PaymentTermsGroupName: item.PaymentTermsGroupName ?? item.PymntGroup ?? String(grpNum),
                PymntGroup: item.PaymentTermsGroupName ?? item.PymntGroup ?? String(grpNum),
                U_DiasPC: item.U_DiasPC
              });
            }
          }
        };

        // Fetch in a single request using Prefer: odata.maxpagesize=1000
        const firstRes = await api.get('/sap/PaymentTermsTypes?$top=500');
        const firstList = firstRes.data?.value || [];
        addItems(firstList);

        // Fallback pagination only if server returned exactly 20 items (in case a proxy stripped Prefer header)
        if (firstList.length === 20) {
          for (let skip = 20; skip < 200; skip += 20) {
            const response = await api.get(`/sap/PaymentTermsTypes?$skip=${skip}&$top=20`);
            const list = response.data?.value || [];
            if (list.length === 0) break;
            addItems(list);
            if (list.length < 20) break;
          }
        }

        if (allTerms.length > 0) {
          _cachedPaymentTerms = allTerms;
          try { sessionStorage.setItem('sap_cached_payment_terms_v3', JSON.stringify(allTerms)); } catch {}
        }
        return allTerms;
      } catch (error) {
        console.error('Erro ao buscar condições de pagamento (OCTG):', error);
        return _cachedPaymentTerms || [];
      } finally {
        _cachedPaymentTermsPromise = null;
      }
    })();

    return _cachedPaymentTermsPromise;
  },

  getPaymentMethods: async (forceRefresh = false) => {
    const defaultMethods = [
      { PaymentMethodCode: 'P-TRF-ITA-43410', Description: 'P-TRF-ITA-43410 - Transferência Itaú' },
      { PaymentMethodCode: 'P-BOL-ITA-43410', Description: 'P-BOL-ITA-43410 - Boleto Itaú' },
      { PaymentMethodCode: 'PIX', Description: 'PIX Bancário' },
      { PaymentMethodCode: 'CARTAO', Description: 'Cartão Corporativo' }
    ];

    if (!forceRefresh && _cachedPaymentMethods && _cachedPaymentMethods.length > 0) {
      return _cachedPaymentMethods;
    }
    if (!forceRefresh && typeof window !== 'undefined') {
      try {
        const cachedStr = sessionStorage.getItem('sap_cached_payment_methods_v3');
        if (cachedStr) {
          const parsed = JSON.parse(cachedStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            _cachedPaymentMethods = parsed;
            return parsed;
          }
        }
      } catch {}
    }

    try {
      const response = await api.get('/sap/WizardPaymentMethods?$select=PaymentMethodCode,Description,Type&$top=500');
      const rawList = response.data?.value || [];
      const map = new Map<string, { PaymentMethodCode: string; Description: string }>();

      // Always seed default Qualitech methods first
      for (const dm of defaultMethods) {
        map.set(dm.PaymentMethodCode, dm);
      }

      for (const item of rawList) {
        const code = String(item.PaymentMethodCode || '').trim();
        if (!code) continue;
        // Include Outgoing (boptOutgoing / P-) or all active payment methods
        const desc = String(item.Description || '').trim();
        if (!map.has(code)) {
          map.set(code, {
            PaymentMethodCode: code,
            Description: desc && !desc.includes(code) ? `${code} - ${desc}` : (desc || code)
          });
        }
      }

      const finalMethods = Array.from(map.values());
      _cachedPaymentMethods = finalMethods;
      try { sessionStorage.setItem('sap_cached_payment_methods_v3', JSON.stringify(finalMethods)); } catch {}
      return finalMethods;
    } catch {
      _cachedPaymentMethods = defaultMethods;
      return defaultMethods;
    }
  },

  getUsages: async (forceRefresh = false) => {
    if (!forceRefresh && _cachedUsages && _cachedUsages.length > 0) {
      return _cachedUsages;
    }
    if (!forceRefresh && typeof window !== 'undefined') {
      try {
        const cachedStr = sessionStorage.getItem('sap_cached_usages_v3');
        if (cachedStr) {
          const parsed = JSON.parse(cachedStr);
          if (Array.isArray(parsed) && parsed.length > 20) {
            _cachedUsages = parsed;
            return parsed;
          }
        }
      } catch {}
    }
    if (!forceRefresh && _cachedUsagesPromise) {
      return _cachedUsagesPromise;
    }

    _cachedUsagesPromise = (async () => {
      // Helper to fetch all pages of an usage endpoint (even if capped at 20 per page)
      const fetchAllUsagePages = async (baseEndpoint: string, mapFn?: (u: any) => { ID: any; Usage: string; Descr?: string }): Promise<any[]> => {
        const mapById = new Map<string, { ID: number | string; Usage: string; Descr?: string }>();
        let nextUrl: string | null = baseEndpoint;
        let pageCount = 0;

        while (nextUrl && pageCount < 25) {
          pageCount++;
          const response: any = await api.get(nextUrl);
          const data = response?.data;
          const list = data?.value || [];
          if (!Array.isArray(list) || list.length === 0) break;

          let newItemsAdded = 0;
          for (const rawItem of list) {
            const mapped = mapFn
              ? mapFn(rawItem)
              : {
                  ID: rawItem.ID ?? rawItem.AbsEntry ?? rawItem.Code,
                  Usage: String(rawItem.Usage ?? rawItem.UsageDescription ?? rawItem.Descr ?? '').trim(),
                  Descr: String(rawItem.Descr ?? rawItem.UsageDescription ?? '').trim()
                };
            const idKey = String(mapped.ID ?? '').trim();
            if (idKey && mapped.Usage && !mapById.has(idKey)) {
              mapById.set(idKey, mapped);
              newItemsAdded++;
            }
          }

          const odataNext = data?.['odata.nextLink'];
          if (odataNext) {
            nextUrl = odataNext.startsWith('/sap/') ? odataNext : `/sap/${odataNext}`;
          } else if (list.length === 20 && newItemsAdded > 0) {
            // If SAP returned 20 items without odata.nextLink (e.g., if Prefer header was stripped), paginate manually with $skip
            const cleanBase = baseEndpoint.replace(/[?&]\$skip=\d+/g, '');
            const sep = cleanBase.includes('?') ? '&' : '?';
            nextUrl = `${cleanBase}${sep}$skip=${mapById.size}`;
          } else {
            nextUrl = null;
          }
        }

        return Array.from(mapById.values()).sort((a, b) => Number(a.ID) - Number(b.ID));
      };

      const endpointsToTry: Array<{ url: string; mapFn?: (u: any) => { ID: any; Usage: string; Descr?: string } }> = [
        { url: '/sap/NotaFiscalUsage?$select=ID,Usage&$top=1000' },
        { url: '/sap/NotaFiscalUsage?$top=1000' },
        { url: '/sap/Usages?$select=ID,Usage&$top=1000' },
        { url: '/sap/Usage?$select=ID,Usage&$top=1000' },
        {
          url: '/sap/FiscalInventoryUsages?$select=AbsEntry,Usage&$top=1000',
          mapFn: (u: any) => ({ ID: u.AbsEntry, Usage: String(u.Usage || '').trim() })
        },
        { url: '/sap/Usages?$top=1000' }
      ];

      for (const candidate of endpointsToTry) {
        try {
          const allUsages = await fetchAllUsagePages(candidate.url, candidate.mapFn);
          if (allUsages.length > 0) {
            _cachedUsages = allUsages;
            try { sessionStorage.setItem('sap_cached_usages_v3', JSON.stringify(allUsages)); } catch {}
            return allUsages;
          }
        } catch (err) {
          // Try next endpoint
        }
      }

      console.error('All getUsages fallbacks failed.');
      return _cachedUsages || [];
    })().finally(() => {
      _cachedUsagesPromise = null;
    });

    return _cachedUsagesPromise;
  },

  prefetchPurchaseLookups: () => {
    // Warm up all purchase dropdown caches in the background with zero blocking
    setTimeout(() => {
      sapService.getBusinessPlaces().catch(() => {});
      sapService.getUsages().catch(() => {});
      sapService.getBuyers().catch(() => {});
      sapService.getPaymentTerms().catch(() => {});
      sapService.getPaymentMethods().catch(() => {});
      sapService.getDimensions().catch(() => {});
      sapService.getDistributionRules().catch(() => {});
      sapService.getProjects().catch(() => {});
    }, 50);
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
      const response = await api.get('/sap/PurchaseDeliveryNotes?$select=DocEntry,DocNum,DocDate,DocTotal,CardCode,CardName,U_IPF,U_Atendimento,U_Prazo,U_Quantidade,U_Documentacao,U_Qualidade,U_Status,U_Aviso_IPF&$orderby=DocDate desc,DocEntry desc&$top=50');
      return response.data?.value || [];
    } catch (error) {
      try {
        const response2 = await api.get('/sap/U_QLT_QLDADE?$top=50');
        return response2.data?.value || [];
      } catch (err2) {
        console.warn('Quality records endpoint not found in SAP, returning empty list');
        return [];
      }
    }
  },

  getSupplierReceipts: async (cardCode?: string) => {
    try {
      let url = `/sap/PurchaseDeliveryNotes?$select=DocEntry,DocNum,DocDate,DocTotal,CardCode,CardName,DocumentLines&$orderby=DocDate desc,DocEntry desc&$top=20`;
      if (cardCode && cardCode.trim()) {
        const safeCode = cardCode.trim().replace(/'/g, "''");
        url = `/sap/PurchaseDeliveryNotes?$select=DocEntry,DocNum,DocDate,DocTotal,CardCode,CardName,DocumentLines&$filter=CardCode eq '${safeCode}'&$orderby=DocDate desc,DocEntry desc&$top=20`;
      }
      const response = await api.get(url);
      return response.data?.value || [];
    } catch (error) {
      console.warn('Erro ao buscar recebimentos do fornecedor:', error);
      return [];
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

    if (data.DocEntry) {
      try {
        const patchRes = await api.patch(`/sap/PurchaseDeliveryNotes(${data.DocEntry})`, {
          U_Atendimento: formattedData.U_Atendimento,
          U_Prazo: formattedData.U_Prazo,
          U_Quantidade: formattedData.U_Quantidade,
          U_Documentacao: formattedData.U_Documentacao,
          U_Qualidade: formattedData.U_Qualidade,
          U_IPF: formattedData.U_IPF,
          U_Aviso_IPF: formattedData.U_Aviso_IPF,
          U_Status: formattedData.U_Status
        });
        return patchRes.data || { success: true, ...formattedData };
      } catch (patchErr) {
        console.warn('Could not patch PurchaseDeliveryNotes with evaluation:', patchErr);
      }
    }

    try {
      const response = await api.post('/sap/U_QLT_QLDADE', formattedData);
      return response.data;
    } catch (error) {
      try {
        const response2 = await api.post('/sap/QLT_QLDADE', formattedData);
        return response2.data;
      } catch (err2) {
        return { success: true, localOnly: true, ...formattedData };
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

  getCachedPersonnelCost,
  setCachedPersonnelCost,

  getPersonnelCost: async (code: string | number) => {
    const cleanCode = String(code).trim().replace(/['"]/g, '');
    if (!cleanCode) return null;
    const cached = getCachedPersonnelCost(cleanCode);
    try {
      const response = await api.get(`/sap/CustosPessoal('${cleanCode}')`);
      if (response.data) {
        setCachedPersonnelCost(cleanCode, response.data);
        return { ...(cached || {}), ...response.data };
      }
    } catch (error) {
      try {
        const filterStr = /^\d+$/.test(cleanCode)
          ? `Code eq '${cleanCode}' or DocEntry eq ${cleanCode}`
          : `Code eq '${cleanCode}'`;
        const response2 = await api.get(`/sap/CustosPessoal?$filter=${encodeURIComponent(filterStr)}`);
        if (response2.data.value && response2.data.value.length > 0) {
          const item = response2.data.value[0];
          setCachedPersonnelCost(cleanCode, item);
          return { ...(cached || {}), ...item };
        }
      } catch (err2) {
        // continue
      }
      try {
        const response3 = await api.get(`/sap/U_CustosPessoal('${cleanCode}')`);
        if (response3.data) {
          setCachedPersonnelCost(cleanCode, response3.data);
          return { ...(cached || {}), ...response3.data };
        }
      } catch (err3) {
        // continue
      }
      try {
        const filterStr = /^\d+$/.test(cleanCode)
          ? `Code eq '${cleanCode}' or DocEntry eq ${cleanCode}`
          : `Code eq '${cleanCode}'`;
        const response4 = await api.get(`/sap/U_CustosPessoal?$filter=${encodeURIComponent(filterStr)}`);
        if (response4.data.value && response4.data.value.length > 0) {
          const item = response4.data.value[0];
          setCachedPersonnelCost(cleanCode, item);
          return { ...(cached || {}), ...item };
        }
      } catch (err4) {
        // continue
      }
      if (cached) return cached;
      return handleApiError(error, 'getPersonnelCost');
    }
    return cached;
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
    if (data.Code) {
      setCachedPersonnelCost(String(data.Code).trim(), { ...data, ...cleaned });
    }
    try {
      const response = await api.post('/sap/CustosPessoal', cleaned);
      if (response.data?.Code) {
        setCachedPersonnelCost(String(response.data.Code).trim(), response.data);
      }
      return response.data;
    } catch (error) {
      try {
        const response2 = await api.post('/sap/U_CustosPessoal', cleaned);
        if (response2.data?.Code) {
          setCachedPersonnelCost(String(response2.data.Code).trim(), response2.data);
        }
        return response2.data;
      } catch (err2) {
        return handleApiError(error, 'createPersonnelCost');
      }
    }
  },

  updatePersonnelCost: async (code: string | number, data: any) => {
    const cleanCode = String(code).trim().replace(/['"]/g, '');
    const cleaned = sapService.sanitizePersonnelCostPayload(data);
    setCachedPersonnelCost(cleanCode, { ...data, ...cleaned, Code: cleanCode });
    try {
      const response = await api.patch(`/sap/CustosPessoal('${cleanCode}')`, cleaned);
      return response.data;
    } catch (error) {
      try {
        const response2 = await api.patch(`/sap/U_CustosPessoal('${cleanCode}')`, cleaned);
        return response2.data;
      } catch (err2) {
        return handleApiError(error, 'updatePersonnelCost');
      }
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
      const explicitWo = typeof options === 'object' && options?.wo ? options.wo.trim() : '';
      const url = buildODataQuery('/sap/Quotations', options, 20, 'DocEntry desc');
      const response = await api.get(url);
      const items: any[] = response.data.value || [];

      // Check if explicit WO or search yields WO matches in lines/header
      if (typeof options === 'object' && (explicitWo || (options?.search && items.length === 0))) {
        const raw = explicitWo || (options?.search || '').trim();
        const cleanWo = raw.replace(/^(WO|PROJETO)\s*[:#-]?\s*/i, '').trim();
        const woTarget = cleanWo || raw;
        const safeWo = woTarget.replace(/'/g, "''");
        const mergedMap = new Map<number, any>();
        items.forEach(it => {
          if (it?.DocEntry) mergedMap.set(Number(it.DocEntry), it);
        });

        try {
          let woRes;
          try {
            woRes = await api.get(`/sap/SQLQueries('SEARCH_QUOTES_BY_WO')/List?wo='${encodeURIComponent(woTarget)}'`);
          } catch {
            try {
              await api.post('/sap/SQLQueries', {
                SqlCode: 'SEARCH_QUOTES_BY_WO',
                SqlName: 'Search Sales Quotations by WO',
                SqlText: 'SELECT T0."DocEntry" FROM "QUT1" T0 WHERE T0."OcrCode4" = :wo GROUP BY T0."DocEntry" ORDER BY T0."DocEntry" DESC'
              });
              woRes = await api.get(`/sap/SQLQueries('SEARCH_QUOTES_BY_WO')/List?wo='${encodeURIComponent(woTarget)}'`);
            } catch {}
          }
          if (woRes?.data?.value && woRes.data.value.length > 0) {
            const entries = woRes.data.value.map((r: any) => r.DocEntry).filter(Boolean);
            if (entries.length > 0) {
              const filterEntries = entries.slice(0, 40).map((e: any) => `DocEntry eq ${e}`).join(' or ');
              const fullDocsRes = await api.get(`/sap/Quotations?$filter=${encodeURIComponent(filterEntries)}&$orderby=DocEntry desc`);
              (fullDocsRes.data?.value || []).forEach((d: any) => {
                if (d?.DocEntry) mergedMap.set(Number(d.DocEntry), d);
              });
            }
          }
        } catch {}

        try {
          const headerWoRes = await api.get(
            `/sap/Quotations?$filter=${encodeURIComponent(`U_Projeto eq '${safeWo}' or contains(U_Projeto, '${safeWo}')`)}&$orderby=DocEntry desc&$top=50`
          );
          (headerWoRes.data?.value || []).forEach((d: any) => {
            if (d?.DocEntry) mergedMap.set(Number(d.DocEntry), d);
          });
        } catch {}

        if (explicitWo && mergedMap.size === 0) {
          try {
            const recentRes = await api.get(`/sap/Quotations?$orderby=DocEntry desc&$top=100`);
            (recentRes.data?.value || []).forEach((d: any) => {
              if (d?.DocEntry && getDocumentWO(d).toLowerCase().includes(woTarget.toLowerCase())) {
                mergedMap.set(Number(d.DocEntry), d);
              }
            });
          } catch {}
        }

        if (mergedMap.size > 0) {
          return Array.from(mergedMap.values()).sort((a, b) => Number(b.DocEntry || 0) - Number(a.DocEntry || 0));
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

      const explicitWo = typeof options === 'object' && options?.wo ? options.wo.trim() : '';
      const url = buildODataQuery('/sap/Orders', options, 20, 'DocEntry desc');
      const response = await api.get(url);
      const items: any[] = (response.data.value || []).filter(isServiceOrder);

      // Check if explicit WO or search yields WO matches in lines/header
      if (typeof options === 'object' && (explicitWo || (options?.search && items.length === 0))) {
        const raw = explicitWo || (options?.search || '').trim();
        const cleanWo = raw.replace(/^(WO|PROJETO)\s*[:#-]?\s*/i, '').trim();
        const woTarget = cleanWo || raw;
        const safeWo = woTarget.replace(/'/g, "''");
        const mergedMap = new Map<number, any>();
        items.forEach(it => {
          if (it?.DocEntry) mergedMap.set(Number(it.DocEntry), it);
        });

        try {
          let woRes;
          try {
            woRes = await api.get(`/sap/SQLQueries('SEARCH_ORDERS_BY_WO')/List?wo='${encodeURIComponent(woTarget)}'`);
          } catch {
            try {
              await api.post('/sap/SQLQueries', {
                SqlCode: 'SEARCH_ORDERS_BY_WO',
                SqlName: 'Search Sales Orders by WO',
                SqlText: 'SELECT T0."DocEntry" FROM "RDR1" T0 WHERE (T0."OcrCode4" = :wo OR T0."Project" = :wo OR T0."CostingCode4" = :wo) GROUP BY T0."DocEntry" ORDER BY T0."DocEntry" DESC'
              });
              woRes = await api.get(`/sap/SQLQueries('SEARCH_ORDERS_BY_WO')/List?wo='${encodeURIComponent(woTarget)}'`);
            } catch {}
          }
          if (woRes?.data?.value && woRes.data.value.length > 0) {
            const entries = woRes.data.value.map((r: any) => r.DocEntry).filter(Boolean);
            if (entries.length > 0) {
              const filterEntries = entries.slice(0, 40).map((e: any) => `DocEntry eq ${e}`).join(' or ');
              const fullDocsRes = await api.get(`/sap/Orders?$filter=${encodeURIComponent(filterEntries)}&$orderby=DocEntry desc`);
              (fullDocsRes.data?.value || []).filter(isServiceOrder).forEach((d: any) => {
                if (d?.DocEntry) {
                  d._wo = woTarget;
                  d.CostingCode4 = d.CostingCode4 || woTarget;
                  d.U_Projeto = d.U_Projeto || woTarget;
                  mergedMap.set(Number(d.DocEntry), d);
                }
              });
            }
          }
        } catch {}

        try {
          const headerWoRes = await api.get(
            `/sap/Orders?$filter=${encodeURIComponent(`U_Projeto eq '${safeWo}' or contains(U_Projeto, '${safeWo}')`)}&$orderby=DocEntry desc&$top=50`
          );
          (headerWoRes.data?.value || []).filter(isServiceOrder).forEach((d: any) => {
            if (d?.DocEntry) mergedMap.set(Number(d.DocEntry), d);
          });
        } catch {}

        // Fallback: scan recent service orders when searching by WO directly so partial/line-level CostingCode4 matches are always returned
        if (explicitWo) {
          const hasMatchingWoYet = Array.from(mergedMap.values()).some(d =>
            getDocumentWO(d).toLowerCase().includes(woTarget.toLowerCase())
          );
          if (!hasMatchingWoYet) {
            try {
              const sqlRes = await api.get(`/sap/SQLQueries('GET_ORDERS_SERVICE_9')/List?$skip=0&$top=100`);
              if (sqlRes.data?.value && Array.isArray(sqlRes.data.value)) {
                const entries = sqlRes.data.value.map((r: any) => r.DocEntry).filter(Boolean);
                for (let i = 0; i < entries.length; i += 25) {
                  const batch = entries.slice(i, i + 25);
                  const filterEntries = batch.map((e: any) => `DocEntry eq ${e}`).join(' or ');
                  const fullDocsRes = await api.get(`/sap/Orders?$filter=${encodeURIComponent(filterEntries)}&$orderby=DocEntry desc`);
                  (fullDocsRes.data?.value || []).filter(isServiceOrder).forEach((d: any) => {
                    if (d?.DocEntry && getDocumentWO(d).toLowerCase().includes(woTarget.toLowerCase())) {
                      mergedMap.set(Number(d.DocEntry), d);
                    }
                  });
                }
              }
            } catch {}
          }
        }

        if (mergedMap.size > 0) {
          return Array.from(mergedMap.values()).sort((a, b) => Number(b.DocEntry || 0) - Number(a.DocEntry || 0));
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
  },

  // Unified Approval Center Services
  getApprovalsCatalog: async () => {
    try {
      const response = await api.get('/approvals/catalog');
      return response.data;
    } catch (error) {
      return handleApiError(error, 'getApprovalsCatalog');
    }
  },

  getUnifiedApprovals: async () => {
    try {
      const response = await api.get('/approvals/unified');
      return response.data;
    } catch (error) {
      return handleApiError(error, 'getUnifiedApprovals');
    }
  },

  getApprovalDraftDetail: async (draftEntry: number) => {
    try {
      const response = await api.get(`/approvals/draft-detail/${draftEntry}`);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'getApprovalDraftDetail');
    }
  },

  decideUnifiedApproval: async (payload: {
    draftDocEntry: number;
    decision: 'ardApproved' | 'ardNotApproved';
    remarks?: string;
    approverName?: string;
    approverEmail?: string;
    lineNum?: number;
    stageCode?: number;
    approveAllLines?: boolean;
  }) => {
    try {
      const response = await api.post('/approvals/decide', payload);
      return response.data;
    } catch (error) {
      return handleApiError(error, 'decideUnifiedApproval');
    }
  },

  // Get currencies linked to a Business Partner (supports multi-currency '##' or BPCurrenciesCollection)
  getPartnerCurrencies: async (cardCode?: string): Promise<string[]> => {
    const standardCurrencies = ['R$', 'USD', 'EUR', 'GBP', 'CAD', 'CHF'];
    if (!cardCode) return standardCurrencies;
    try {
      const bp = await sapService.getBusinessPartner(cardCode);
      if (!bp) return standardCurrencies;
      const set = new Set<string>(['R$']);
      if (bp.Currency && bp.Currency !== '##') {
        set.add(bp.Currency);
      }
      if (bp.DefaultCurrency && bp.DefaultCurrency !== '##') {
        set.add(bp.DefaultCurrency);
      }
      if (Array.isArray(bp.BPCurrenciesCollection) && bp.BPCurrenciesCollection.length > 0) {
        bp.BPCurrenciesCollection.forEach((c: any) => {
          if (c.Include === 'tYES' || c.Include === 'Y' || !c.Include) {
            if (c.CurrencyCode) set.add(c.CurrencyCode);
          }
        });
      }
      // Always include common foreign currencies so user can select one or more currencies for the PO
      standardCurrencies.forEach(c => set.add(c));
      return Array.from(set);
    } catch {
      return standardCurrencies;
    }
  },

  // Build SAP B1 Relationship Map (Mapa de Relações: Documento Base -> Documento Atual -> Documento Destino)
  getDocumentRelationshipMap: async (doc: any, currentTypeHint?: string) => {
    if (!doc) return { baseDocs: [], currentDoc: null, targetDocs: [] };

    const inferTypeLabel = (objCodeOrHint?: string | number) => {
      const s = String(objCodeOrHint || '').toLowerCase();
      if (s === '1470000113' || s.includes('request') || s.includes('solicit')) return 'Solicitação de Compra';
      if (s === '540000006' || s.includes('quotation') || s.includes('oferta') || s.includes('cotac')) return 'Oferta de Compra (Cotação)';
      if (s === '204' || s.includes('down')) return 'Adiantamento a Fornecedor';
      if (s === '18' || s.includes('invoice')) return 'Nota Fiscal de Entrada';
      return 'Pedido de Compra';
    };

    const currentDocNode = {
      docEntry: doc.DocEntry,
      docNum: doc.DocNum || doc.DocEntry,
      typeLabel: inferTypeLabel(currentTypeHint || doc.DocObjectCode),
      date: doc.DocDate || doc.CreationDate,
      partnerName: doc.CardName || doc.RequesterName || doc.CardCode || '-',
      total: Number(doc.DocTotal || 0),
      currency: doc.DocCurrency || 'R$',
      status: doc.DocumentStatus === 'bost_Close' || doc.Cancelled === 'tYES' ? 'Fechado' : 'Aberto',
      isDraft: Boolean(doc._isDraft || doc.DocObjectCode)
    };

    const baseDocs: any[] = [];
    const targetDocs: any[] = [];
    const seenBaseKeys = new Set<string>();
    const seenTargetKeys = new Set<string>();

    // 1. Inspect lines for BaseType & BaseEntry
    const lines = Array.isArray(doc.DocumentLines) ? doc.DocumentLines : [];
    for (const line of lines) {
      const baseType = line.BaseType !== undefined && line.BaseType !== null ? Number(line.BaseType) : -1;
      const baseEntry = line.BaseEntry !== undefined && line.BaseEntry !== null ? Number(line.BaseEntry) : null;
      if (baseEntry && baseEntry > 0 && baseType !== -1) {
        const key = `${baseType}-${baseEntry}`;
        if (!seenBaseKeys.has(key)) {
          seenBaseKeys.add(key);
          try {
            let baseEndpoint = 'PurchaseOrders';
            if (baseType === 1470000113) baseEndpoint = 'PurchaseRequests';
            else if (baseType === 540000006) baseEndpoint = 'PurchaseQuotations';
            const res = await api.get(`/sap/${baseEndpoint}(${baseEntry})`);
            const bData = res.data;
            if (bData && bData.DocEntry) {
              baseDocs.push({
                docEntry: bData.DocEntry,
                docNum: bData.DocNum || bData.DocEntry,
                typeLabel: inferTypeLabel(baseType),
                date: bData.DocDate,
                partnerName: bData.CardName || bData.RequesterName || bData.CardCode || '-',
                total: Number(bData.DocTotal || 0),
                currency: bData.DocCurrency || 'R$',
                status: bData.DocumentStatus === 'bost_Close' ? 'Fechado' : 'Aberto'
              });
            }
          } catch {}
        }
      }
    }

    // 2. Also parse Comments for "Baseado em Oferta de compra XXXX" or "REQ YYYY" or "Solicitação ZZZZ"
    const commentsStr = String(doc.Comments || '');
    const ofertaMatches = Array.from(commentsStr.matchAll(/(?:oferta(?:\s+de\s+compra)?|cotac[aã]o)\s*(?:n[º°]?\s*|#)?(\d+)/gi));
    for (const m of ofertaMatches) {
      const num = Number(m[1]);
      if (num > 0) {
        try {
          const qRes = await api.get(`/sap/PurchaseQuotations?$filter=DocNum eq ${num} or DocEntry eq ${num}&$top=1`);
          const qDoc = qRes.data?.value?.[0];
          if (qDoc && !seenBaseKeys.has(`540000006-${qDoc.DocEntry}`)) {
            seenBaseKeys.add(`540000006-${qDoc.DocEntry}`);
            baseDocs.push({
              docEntry: qDoc.DocEntry,
              docNum: qDoc.DocNum || qDoc.DocEntry,
              typeLabel: 'Oferta de Compra (Cotação)',
              date: qDoc.DocDate,
              partnerName: qDoc.CardName || qDoc.CardCode || '-',
              total: Number(qDoc.DocTotal || 0),
              currency: qDoc.DocCurrency || 'R$',
              status: qDoc.DocumentStatus === 'bost_Close' ? 'Fechado' : 'Aberto'
            });
          }
        } catch {}
      }
    }

    const reqMatches = Array.from(commentsStr.matchAll(/(?:req|solicita[cç][aã]o(?:\s+de\s+compra)?)\s*(?:n[º°]?\s*|#)?(\d+)/gi));
    for (const m of reqMatches) {
      const num = Number(m[1]);
      if (num > 0) {
        try {
          const rRes = await api.get(`/sap/PurchaseRequests?$filter=DocNum eq ${num} or DocEntry eq ${num}&$top=1`);
          const rDoc = rRes.data?.value?.[0];
          if (rDoc && !seenBaseKeys.has(`1470000113-${rDoc.DocEntry}`)) {
            seenBaseKeys.add(`1470000113-${rDoc.DocEntry}`);
            baseDocs.push({
              docEntry: rDoc.DocEntry,
              docNum: rDoc.DocNum || rDoc.DocEntry,
              typeLabel: 'Solicitação de Compra',
              date: rDoc.DocDate,
              partnerName: rDoc.RequesterName || rDoc.Requester || '-',
              total: Number(rDoc.DocTotal || 0),
              currency: rDoc.DocCurrency || 'R$',
              status: rDoc.DocumentStatus === 'bost_Close' ? 'Fechado' : 'Aberto'
            });
          }
        } catch {}
      }
    }

    // 3. Look for Target Documents (downstream documents referencing this document's DocNum or DocEntry)
    const docNum = doc.DocNum || doc.DocEntry;
    if (docNum) {
      const searchCollections = [
        { endpoint: 'PurchaseQuotations', label: 'Oferta de Compra (Cotação)' },
        { endpoint: 'PurchaseOrders', label: 'Pedido de Compra' },
        { endpoint: 'PurchaseDownPayments', label: 'Adiantamento a Fornecedor' }
      ];
      await Promise.all(
        searchCollections.map(async col => {
          try {
            const res = await api.get(
              `/sap/${col.endpoint}?$filter=contains(Comments, '${docNum}')&$top=10&$orderby=DocEntry desc`
            );
            const list = res.data?.value || [];
            for (const tDoc of list) {
              if (tDoc.DocEntry === doc.DocEntry && col.label === currentDocNode.typeLabel) continue;
              const tKey = `${col.endpoint}-${tDoc.DocEntry}`;
              if (!seenTargetKeys.has(tKey)) {
                seenTargetKeys.add(tKey);
                targetDocs.push({
                  docEntry: tDoc.DocEntry,
                  docNum: tDoc.DocNum || tDoc.DocEntry,
                  typeLabel: col.label,
                  date: tDoc.DocDate,
                  partnerName: tDoc.CardName || tDoc.RequesterName || tDoc.CardCode || '-',
                  total: Number(tDoc.DocTotal || 0),
                  currency: tDoc.DocCurrency || 'R$',
                  status: tDoc.DocumentStatus === 'bost_Close' ? 'Fechado' : 'Aberto'
                });
              }
            }
          } catch {}
        })
      );
    }

    return {
      baseDocs,
      currentDoc: currentDocNode,
      targetDocs
    };
  }
};
