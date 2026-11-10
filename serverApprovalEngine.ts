import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

export interface ApprovalPerson {
  id: number;
  code: string;
  name: string;
  email: string;
}

export interface ApprovalStageRule {
  stageCode: number;
  stageName: string;
  approvers: ApprovalPerson[];
}

export interface ApprovalModelRule {
  code: number;
  name: string;
  description: string;
  active: boolean;
  stages: ApprovalStageRule[];
  authors: ApprovalPerson[];
}

export interface LineApproverDecision {
  stageCode: number;
  stageName: string;
  approverId: number;
  approverCode: string;
  approverName: string;
  approverEmail: string;
  status: 'W' | 'Y' | 'N';
  approvedBy?: string | null;
  approvedAt?: string | null;
  remarks?: string | null;
}

export interface PortalApprovalLine {
  lineNum: number;
  itemCode: string;
  itemDescription: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  costCenter: string; // CostingCode3 (e.g. OPER_OFF, ADM, TI, FIN, etc.)
  branch: string; // CostingCode2 (MATRIZ, MACAE)
  project: string; // CostingCode4
  modelCode: number;
  modelName: string;
  modelDescription: string;
  requiredApprovers: LineApproverDecision[];
}

export interface PortalApprovalRecord {
  id: string; // U_ExternalApprovalId, e.g. PORTAL-APR-46861
  code: number; // Numeric workflow ID for UI display
  draftDocEntry: number;
  draftDocNum?: number | null;
  objectType: string; // '22' (PO), '1470000113' (PR), '204' (DownPayment)
  docObjectCode: string; // 'oPurchaseOrders', 'oPurchaseRequests', 'oPurchaseDownPayments'
  origin: 'PORTAL' | 'SAP_DESKTOP';
  status: 'W' | 'Y' | 'N';
  creationDate: string;
  creationTime: string;
  authorId?: number;
  authorCode?: string;
  authorName: string;
  authorEmail: string;
  cardCode: string;
  cardName: string;
  docTotal: number;
  bplId?: number | null;
  bplName?: string;
  comments: string;
  lines: PortalApprovalLine[];
  convertedDocEntry?: number | null;
  convertedDocNum?: number | null;
  convertedAt?: string | null;
  conversionMethod?: string | null;
  draftPayload?: any;
}

interface ParsedRulesCatalog {
  modelsByCode: Map<number, ApprovalModelRule>;
  modelsByName: Map<string, ApprovalModelRule>;
  modelsList: ApprovalModelRule[];
  authorsById: Map<number, ApprovalPerson>;
  authorsList: ApprovalPerson[];
  approversById: Map<number, ApprovalPerson>;
  approversList: ApprovalPerson[];
  stagesByCode: Map<number, string>;
}

let cachedCatalog: ParsedRulesCatalog | null = null;
const inFlightConversions = new Set<number>();
let inMemoryApprovalsStore: PortalApprovalRecord[] = [];

const isServerless = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);
const STORAGE_DIR = isServerless ? '/tmp' : path.join(process.cwd(), 'data');
const STORAGE_FILE = path.join(STORAGE_DIR, 'portal_approvals.json');

export function loadApprovalRulesCatalog(): ParsedRulesCatalog {
  if (cachedCatalog) return cachedCatalog;

  const candidatePaths = [
    path.join(process.cwd(), 'artefatos', 'regrasdeaprovacao.xlsx'),
    path.join(process.env.LAMBDA_TASK_ROOT || '/var/task', 'artefatos', 'regrasdeaprovacao.xlsx')
  ];
  const excelPath = candidatePaths.find(p => fs.existsSync(p)) || candidatePaths[0];
  const modelsByCode = new Map<number, ApprovalModelRule>();
  const modelsByName = new Map<string, ApprovalModelRule>();
  const authorsById = new Map<number, ApprovalPerson>();
  const approversById = new Map<number, ApprovalPerson>();
  const stagesByCode = new Map<number, string>();

  if (!fs.existsSync(excelPath)) {
    console.warn('regrasdeaprovacao.xlsx not found at:', excelPath);
    cachedCatalog = {
      modelsByCode,
      modelsByName,
      modelsList: [],
      authorsById,
      authorsList: [],
      approversById,
      approversList: [],
      stagesByCode
    };
    return cachedCatalog;
  }

  const xlsxLib: any = (XLSX as any).default || XLSX;
  const fileBuffer = fs.readFileSync(excelPath);
  const wb = xlsxLib.read(fileBuffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = xlsxLib.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const templateDescriptions = new Map<string, { desc: string; active: boolean }>();
  for (let i = 1; i <= 156 && i < rows.length; i++) {
    const [nome, desc, , , ativo] = rows[i];
    if (nome && String(nome).trim()) {
      templateDescriptions.set(String(nome).trim(), {
        desc: String(desc || '').trim(),
        active: String(ativo || 'Y').trim().toUpperCase() === 'Y'
      });
    }
  }

  const tempStagesMap = new Map<number, Map<number, { stageName: string; approvers: Map<number, ApprovalPerson> }>>();
  const tempAuthorsMap = new Map<number, Map<number, ApprovalPerson>>();

  for (let i = 158; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;
    const code = Number(row[0]);
    const name = String(row[1] || '').trim();
    if (isNaN(code) || !name) continue;

    const idAutor = Number(row[2]);
    const codAutor = String(row[3] || '').trim();
    const nomeAutor = String(row[4] || '').trim();
    const emailAutor = String(row[5] || '').trim();

    const codEtapa = Number(row[6]);
    const nomeEtapa = String(row[7] || '').trim();
    const idAprov = Number(row[8]);
    const codAprov = String(row[9] || '').trim();
    const nomeAprov = String(row[10] || '').trim();
    const emailAprov = String(row[11] || '').trim();

    if (!modelsByCode.has(code)) {
      const meta = templateDescriptions.get(name);
      const modelObj: ApprovalModelRule = {
        code,
        name,
        description: meta?.desc || inferDescriptionFromModelName(name),
        active: meta?.active ?? true,
        stages: [],
        authors: []
      };
      modelsByCode.set(code, modelObj);
      modelsByName.set(name.toUpperCase(), modelObj);
      tempStagesMap.set(code, new Map());
      tempAuthorsMap.set(code, new Map());
    }

    if (idAutor && nomeAutor && !nomeAutor.toUpperCase().includes('DESATIVADO')) {
      const authorPerson: ApprovalPerson = {
        id: idAutor,
        code: codAutor,
        name: nomeAutor,
        email: emailAutor
      };
      authorsById.set(idAutor, authorPerson);
      tempAuthorsMap.get(code)?.set(idAutor, authorPerson);
    }

    if (codEtapa && nomeEtapa) {
      stagesByCode.set(codEtapa, nomeEtapa);
    }

    if (codEtapa && idAprov && nomeAprov && !nomeAprov.toUpperCase().includes('DESATIVADO')) {
      const approverPerson: ApprovalPerson = {
        id: idAprov,
        code: codAprov,
        name: nomeAprov,
        email: emailAprov
      };
      approversById.set(idAprov, approverPerson);

      const mStages = tempStagesMap.get(code)!;
      if (!mStages.has(codEtapa)) {
        mStages.set(codEtapa, { stageName: nomeEtapa, approvers: new Map() });
      }
      mStages.get(codEtapa)!.approvers.set(idAprov, approverPerson);
    }
  }

  for (const [code, model] of modelsByCode.entries()) {
    const stMap = tempStagesMap.get(code);
    if (stMap) {
      model.stages = Array.from(stMap.entries()).map(([stageCode, st]) => ({
        stageCode,
        stageName: st.stageName,
        approvers: Array.from(st.approvers.values())
      }));
    }
    const auMap = tempAuthorsMap.get(code);
    if (auMap) {
      model.authors = Array.from(auMap.values());
    }
  }

  const modelsList = Array.from(modelsByCode.values()).sort((a, b) => a.name.localeCompare(b.name));
  const authorsList = Array.from(authorsById.values()).sort((a, b) => a.name.localeCompare(b.name));
  const approversList = Array.from(approversById.values()).sort((a, b) => a.name.localeCompare(b.name));

  cachedCatalog = {
    modelsByCode,
    modelsByName,
    modelsList,
    authorsById,
    authorsList,
    approversById,
    approversList,
    stagesByCode
  };
  return cachedCatalog;
}

function inferDescriptionFromModelName(name: string): string {
  const upper = name.toUpperCase();
  if (upper.startsWith('NFAD ')) {
    return upper.includes('[F]') || upper.endsWith(' F') ? 'Adiantamento - MACAÉ' : 'Adiantamento';
  }
  if (upper.startsWith('NF ')) {
    return upper.includes('[F]') ? 'Nota Fiscal de Entrada - MACAÉ' : 'Nota Fiscal de Entrada';
  }
  return upper.includes('[F]') ? 'Pedidos de Compra - MACAÉ' : 'Pedidos de Compra';
}

// Normalize Cost Center code from line CostingCode3 / CostingCode4
function normalizeCostCenterKey(rawCostCenter: string): string {
  const clean = String(rawCostCenter || 'OPER_OFF').toUpperCase().trim();
  if (clean.includes('OPER_OFF') || clean.includes('OPEROFF') || clean.includes('OPOFF') || clean === 'OFFSHORE') return 'OPEROFF';
  if (clean.includes('OPER_ON') || clean.includes('OPERON') || clean === 'ONSHORE') return 'OPERON';
  if (clean.includes('DIR_REG') || clean.includes('DIRREG')) return 'DIR_REG';
  if (clean.startsWith('ADM')) return 'ADM';
  if (clean.startsWith('COM')) return 'COM';
  if (clean.startsWith('DIR')) return 'DIR';
  if (clean.startsWith('FIN')) return 'FIN';
  if (clean.startsWith('MAT')) return 'MAT';
  if (clean.startsWith('QC') || clean.startsWith('QUAL')) return 'QC';
  if (clean.startsWith('QSMS') || clean.startsWith('SMS') || clean.startsWith('HSE')) return 'QSMS';
  if (clean.startsWith('RH') || clean.startsWith('DP')) return 'RH';
  if (clean.startsWith('SUPRI') || clean.startsWith('COMPRA')) return 'SUPRI';
  if (clean.startsWith('TI') || clean.startsWith('INFO')) return 'TI';
  if (clean.startsWith('PER')) return 'PER';
  if (clean.startsWith('ENG')) return 'ENG';
  if (clean.startsWith('JUR')) return 'JUR';
  if (clean.startsWith('MKT') || clean.startsWith('MARK')) return 'MKT';
  if (clean.startsWith('PMO')) return 'PMO';
  if (clean.startsWith('INOV')) return 'INOV';
  if (clean.startsWith('TREIN')) return 'TREIN';
  if (clean.startsWith('BASE')) return 'BASE';
  return clean;
}

// Match a single line to the exact model in regrasdeaprovacao.xlsx based on DocType, Cost Center, Branch, and Value
export function resolveApprovalModelForLine(
  objectType: string,
  costCenterRaw: string,
  branchRaw: string,
  amountForBracket: number
): ApprovalModelRule {
  const catalog = loadApprovalRulesCatalog();
  const cc = normalizeCostCenterKey(costCenterRaw);
  const isMacae = String(branchRaw || '').toUpperCase().includes('MACA') || String(branchRaw) === '3';
  const bracket: '0_10' | '10_100' | 'OVER_100' =
    amountForBracket <= 10000 ? '0_10' : amountForBracket <= 100000 ? '10_100' : 'OVER_100';

  const isDownPayment = objectType === '204' || objectType === 'oPurchaseDownPayments';
  const isInvoice = objectType === '18' || objectType === 'oPurchaseInvoices';

  const candidates = catalog.modelsList.filter(m => {
    const upperName = m.name.toUpperCase();
    if (isDownPayment) {
      return upperName.startsWith('NFAD ');
    }
    if (isInvoice) {
      return upperName.startsWith('NF ') && !upperName.startsWith('NFAD ');
    }
    return !upperName.startsWith('NF ') && !upperName.startsWith('NFAD ');
  });

  // Filter by Cost Center
  const ccMatches = candidates.filter(m => {
    const upper = m.name.toUpperCase().replace(/^NFAD\s+/, '').replace(/^NF\s+/, '');
    if (cc === 'DIR_REG') return upper.startsWith('DIR_REG') || upper.startsWith('DIRREG');
    if (cc === 'DIR') return upper.startsWith('DIR ') || upper.startsWith('DIR ENTRE');
    if (cc === 'OPEROFF') return upper.startsWith('OPEROFF') || upper.startsWith('OPOFF');
    if (cc === 'OPERON') return upper.startsWith('OPERON');
    return upper.startsWith(cc + ' ');
  });

  const pool = ccMatches.length > 0 ? ccMatches : candidates;

  // Filter by Value Bracket
  const bracketMatches = pool.filter(m => {
    const upper = m.name.toUpperCase();
    if (bracket === '0_10') {
      return upper.includes('0 A 10') || upper.includes('0 - 10') || upper.includes('ATE 10K') || upper.includes('0K E 10K');
    }
    if (bracket === '10_100') {
      return upper.includes('10K A 100') || upper.includes('10 A 100') || upper.includes('10 - 100') || upper.includes('10K E 100K') || upper.includes('10K ATE 100K') || upper.includes('10 100');
    }
    return upper.includes('ACIMA') || upper.includes('ACIM') || upper.includes('ACI ') || upper.includes('MAIOR QUE 100K') || upper.includes('ACIMA 10K');
  });

  const bracketPool = bracketMatches.length > 0 ? bracketMatches : pool;

  // Prefer branch [F] when Macaé
  if (isMacae) {
    const macaeMatch = bracketPool.find(m => m.name.toUpperCase().includes('[F]') || m.name.toUpperCase().endsWith(' F'));
    if (macaeMatch) return macaeMatch;
  } else {
    const matrizMatch = bracketPool.find(m => !m.name.toUpperCase().includes('[F]') && !m.name.toUpperCase().endsWith(' F'));
    if (matrizMatch) return matrizMatch;
  }

  if (bracketPool.length > 0) return bracketPool[0];

  // Fallback default rule if none matched
  return (
    catalog.modelsByName.get('OPEROFF 0 A 10K (N)') ||
    catalog.modelsList[0] || {
      code: 412,
      name: 'OPEROFF 0 a 10k (N)',
      description: 'Pedidos de Compra (N)',
      active: true,
      stages: [
        {
          stageCode: 26,
          stageName: 'GERENTE OPERACIONAL',
          approvers: [{ id: 54, code: 'Gerente_Operações', name: 'Fabio Sousa', email: 'fabio.sousa@qualitechirm.com' }]
        }
      ],
      authors: []
    }
  );
}

export function buildPortalApprovalLines(
  objectType: string,
  headerData: any,
  rawLines: any[]
): { lines: PortalApprovalLine[]; docTotal: number } {
  let docTotal = 0;
  const computedLines = (rawLines || []).map((l: any, idx: number) => {
    const qty = Number(l.Quantity) || 1;
    const price = Number(l.UnitPrice ?? l.Price) || 0;
    const lineTotal = qty * price;
    docTotal += lineTotal;
    return { raw: l, idx, qty, price, lineTotal };
  });

  const effectiveDocTotal = Number(headerData?.DocTotal) || docTotal;

  const lines: PortalApprovalLine[] = computedLines.map(({ raw, idx, qty, price, lineTotal }) => {
    const costCenter = String(raw.CostingCode3 || raw.CostingCode4 || headerData?.CostingCode3 || 'OPER_OFF').trim();
    const branch = String(
      raw.CostingCode2 ||
        (headerData?.BPL_IDAssignedToInvoice === 3 || headerData?.BPLID === 3 ? 'MACAE' : 'MATRIZ')
    ).trim();
    const project = String(raw.CostingCode4 || raw.ProjectCode || 'BASE').trim();

    // Evaluate bracket using line total (or document total if line has same cost center)
    const bracketAmount = Math.max(lineTotal, effectiveDocTotal);
    const matchedModel = resolveApprovalModelForLine(objectType, costCenter, branch, bracketAmount);

    const requiredApprovers: LineApproverDecision[] = matchedModel.stages.map(st => {
      const primaryApprover = st.approvers[0] || {
        id: 54,
        code: 'Aprovador',
        name: st.stageName,
        email: ''
      };
      return {
        stageCode: st.stageCode,
        stageName: st.stageName,
        approverId: primaryApprover.id,
        approverCode: primaryApprover.code,
        approverName: st.approvers.map(a => a.name).join(' / ') || primaryApprover.name,
        approverEmail: st.approvers.map(a => a.email).filter(Boolean).join(', '),
        status: 'W',
        approvedBy: null,
        approvedAt: null,
        remarks: null
      };
    });

    return {
      lineNum: raw.LineNum !== undefined ? Number(raw.LineNum) : idx,
      itemCode: raw.ItemCode || '',
      itemDescription: raw.ItemDescription || raw.ItemName || raw.Dscription || raw.ItemCode || `Item ${idx + 1}`,
      quantity: qty,
      unitPrice: price,
      lineTotal,
      costCenter,
      branch,
      project,
      modelCode: matchedModel.code,
      modelName: matchedModel.name,
      modelDescription: matchedModel.description,
      requiredApprovers
    };
  });

  return { lines, docTotal: effectiveDocTotal };
}

export function readPortalApprovalsStore(): PortalApprovalRecord[] {
  try {
    if (!fs.existsSync(STORAGE_FILE)) return inMemoryApprovalsStore;
    const raw = fs.readFileSync(STORAGE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      inMemoryApprovalsStore = parsed;
      return parsed;
    }
    return inMemoryApprovalsStore;
  } catch (e) {
    console.warn('Error reading portal_approvals.json:', e);
    return inMemoryApprovalsStore;
  }
}

export function writePortalApprovalsStore(records: PortalApprovalRecord[]): void {
  inMemoryApprovalsStore = records;
  try {
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(records, null, 2), 'utf8');
  } catch (e) {
    try {
      fs.writeFileSync('/tmp/portal_approvals.json', JSON.stringify(records, null, 2), 'utf8');
    } catch (tmpErr) {
      console.warn('Fallback to in-memory approvals store:', tmpErr);
    }
  }
}

export function registerPortalDraftApproval(params: {
  draftDocEntry: number;
  draftDocNum?: number | null;
  objectType: string;
  docObjectCode: string;
  authorEmail?: string;
  authorName?: string;
  headerData: any;
  rawLines: any[];
  draftPayload: any;
}): PortalApprovalRecord {
  const catalog = loadApprovalRulesCatalog();
  const store = readPortalApprovalsStore();

  // Check if already exists for this draftDocEntry
  const existingIdx = store.findIndex(r => r.draftDocEntry === params.draftDocEntry);
  if (existingIdx !== -1) {
    return store[existingIdx];
  }

  const { lines, docTotal } = buildPortalApprovalLines(params.objectType, params.headerData, params.rawLines);

  // Match author in catalog by email or name if possible
  const emailLower = String(params.authorEmail || params.headerData?.RequesterEmail || '').toLowerCase().trim();
  const matchedAuthor = catalog.authorsList.find(
    a => (emailLower && a.email.toLowerCase() === emailLower) ||
      (params.authorName && a.name.toLowerCase().includes(params.authorName.toLowerCase()))
  );

  const now = new Date();
  const isoDate = now.toISOString().split('T')[0] + 'T00:00:00Z';
  const timeStr = now.toTimeString().split(' ')[0];

  const record: PortalApprovalRecord = {
    id: `PORTAL-APR-${params.draftDocEntry}`,
    code: 900000 + Number(params.draftDocEntry),
    draftDocEntry: Number(params.draftDocEntry),
    draftDocNum: params.draftDocNum || Number(params.draftDocEntry),
    objectType: params.objectType,
    docObjectCode: params.docObjectCode,
    origin: 'PORTAL',
    status: 'W',
    creationDate: isoDate,
    creationTime: timeStr,
    authorId: matchedAuthor?.id,
    authorCode: matchedAuthor?.code || 'PORTAL_USER',
    authorName: matchedAuthor?.name || params.authorName || params.authorEmail || 'Usuário Portal de Compras',
    authorEmail: params.authorEmail || matchedAuthor?.email || '',
    cardCode: params.headerData?.CardCode || '',
    cardName: params.headerData?.CardName || params.headerData?.RequesterName || params.headerData?.CardCode || 'Solicitação Interna',
    docTotal,
    bplId: params.headerData?.BPL_IDAssignedToInvoice || params.headerData?.BPLID || null,
    bplName: (params.headerData?.BPL_IDAssignedToInvoice === 3 || params.headerData?.BPLID === 3) ? 'QUALITECH MACAÉ' : 'QUALITECH MATRIZ',
    comments: params.headerData?.Comments || '',
    lines,
    convertedDocEntry: null,
    convertedDocNum: null,
    convertedAt: null,
    conversionMethod: null,
    draftPayload: params.draftPayload
  };

  store.unshift(record);
  writePortalApprovalsStore(store);
  return record;
}

export function acquireConversionLock(draftDocEntry: number): boolean {
  if (inFlightConversions.has(draftDocEntry)) return false;
  inFlightConversions.add(draftDocEntry);
  return true;
}

export function releaseConversionLock(draftDocEntry: number): void {
  inFlightConversions.delete(draftDocEntry);
}

/**
 * Security check: Confirms if the logged-in user's email strictly matches the stage approver's email.
 */
export function isEmailAuthorizedForStage(
  loggedEmail?: string | null,
  stageApproverEmail?: string | null
): boolean {
  const cleanUserEmail = String(loggedEmail || '').trim().toLowerCase();
  if (!cleanUserEmail) return false;
  const stageEmails = String(stageApproverEmail || '')
    .split(/[,;/]+/)
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  return stageEmails.includes(cleanUserEmail);
}


