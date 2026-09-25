/**
 * Utilitário de Cálculos de Custo de Pessoal
 * Fiel 100% à fórmula do Excel da Qualitech (Modelo de DI.xlsx) e ao SAP Business One:
 * Formula Custo: =(J41*H41)+(I41*K41)+(L41*H41)*8%+(L41*H41)+(M41*I41)+((H41/12*1,5)*N41)+((H41/12)*O41)*8%+(((H41/12*1,5)*O41))
 * Formula Diárias Normais (J41): =SE(B41="";0;C41-B41+1-K41-L41)
 */

export interface PersonnelCostInput {
  valorNormal: number;           // H41 - Valor Normal da Diária (ex: 500.00)
  qtdDiariasNormal: number;      // J41 - Qtd diárias: Normal (Emb-St) (ex: 9)
  qtdDiariasStandBy: number;     // K41 - Qtd diárias: Stand-by Rate (ex: 1)
  noturnoNormal: number;         // L41 - Noturno Normal (ex: 1)
  noturnoNob: number;            // M41 - Noturno Dobrado / Stand-by (ex: 1)
  hExtraDiurna: number;          // N41 - Horas Extras Diurnas (ex: 1)
  hExtraNoturna: number;         // O41 - Horas Extras Noturnas (ex: 1)
  qtdDobraColaborador?: number;  // Qtd Dobras de Colaborador (ex: 1, 1.5, 2)
  percDobraColaborador?: number; // Percentual da Dobra (40% ou 50%, padrão 50)
}

/**
 * Converte entradas de horas ou valores decimais aceitando tanto vírgula (,) quanto ponto (.)
 * e também formato de hora (ex: "2:30" => 2.5 horas, "1:15" => 1.25 horas).
 */
export function parseDecimalInput(val: string | number | undefined | null): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const clean = String(val).trim();
  if (!clean) return 0;

  // Suporte a formato HH:MM (ex: 2:30 -> 2.5, 01:15 -> 1.25)
  if (clean.includes(':')) {
    const parts = clean.split(':');
    const hours = parseFloat(parts[0]) || 0;
    const minutes = parseFloat(parts[1]) || 0;
    const sign = hours < 0 ? -1 : 1;
    const result = sign * (Math.abs(hours) + (minutes / 60));
    return Math.round(result * 1000) / 1000;
  }

  // Converte vírgula para ponto
  const normalized = clean.replace(',', '.');
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
}

/**
 * Formata um número para exibição em campos com vírgula (formato brasileiro)
 */
export function formatDecimalInput(val: number | string | undefined | null): string {
  if (val === undefined || val === null || val === '') return '0';
  const num = typeof val === 'number' ? val : parseDecimalInput(val);
  if (isNaN(num) || num === 0) return '0';
  const rounded = Math.round(num * 1000) / 1000;
  return String(rounded).replace('.', ',');
}

/**
 * Converte qualquer formato de data (YYYY-MM-DD, DD/MM/YYYY ou ISO) em [ano, mês, dia] numérico
 */
export function parseDateToParts(dateStr?: string): [number, number, number] | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.trim().split('T')[0];

  if (clean.includes('-')) {
    const parts = clean.split('-').map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return [parts[0], parts[1], parts[2]];
    }
  } else if (clean.includes('/')) {
    const parts = clean.split('/').map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      if (parts[0] > 1000) {
        return [parts[0], parts[1], parts[2]];
      }
      return [parts[2], parts[1], parts[0]];
    }
  }

  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
  }

  return null;
}

/**
 * Calcula a quantidade de dias entre duas datas (inclusive), correspondente a:
 * C41 - B41 + 1 no Excel
 */
export function calculateDaysBetween(startDateStr?: string, endDateStr?: string): number {
  if (!startDateStr || startDateStr.trim() === '') return 0;
  const finalStr = (endDateStr && endDateStr.trim() !== '') ? endDateStr : startDateStr;

  const startParts = parseDateToParts(startDateStr);
  const endParts = parseDateToParts(finalStr);

  if (!startParts || !endParts) return 0;

  const startUtc = Date.UTC(startParts[0], startParts[1] - 1, startParts[2]);
  const endUtc = Date.UTC(endParts[0], endParts[1] - 1, endParts[2]);

  const diffDays = Math.round((endUtc - startUtc) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 0;

  // Formula Excel: Final - Inicio + 1 (dias corridos inclusivos)
  return diffDays + 1;
}

/**
 * Fórmula oficial do Excel (Célula J41):
 * =SE(B41="";0;C41-B41+1-K41-L41)
 *
 * Onde:
 * B41: Data Inicial
 * C41: Data Final
 * K41: Qtd Diárias Stand-by (50%)
 * L41: Noturno Normal
 */
export function calculateNormalDiarias(
  startDateStr?: string,
  endDateStr?: string,
  qtdStandBy: number = 0,
  noturnoNormal: number = 0
): number {
  if (!startDateStr || startDateStr.trim() === '') return 0;

  const totalDays = calculateDaysBetween(startDateStr, endDateStr);
  if (totalDays <= 0) return 0;

  const k = Math.max(0, Number(qtdStandBy) || 0);
  const l = Math.max(0, Number(noturnoNormal) || 0);
  const result = totalDays - k - l;
  return Math.max(0, result);
}

export interface PersonnelCostBreakdown {
  // Valores Base
  valorNormal: number;
  standByRate: number;              // I41 - 50% de valorNormal
  valorHora: number;                // H41 / 12
  
  // Quantidades
  qtdDiariasNormal: number;
  qtdDiariasStandBy: number;
  noturnoNormal: number;
  noturnoNob: number;
  hExtraDiurna: number;
  hExtraNoturna: number;

  // Subtotais de Diárias e Noturnos
  totalDiariasNormais: number;      // J * H
  totalDiariasNormal: number;       // Alias for totalDiariasNormais
  totalDiariasStandBy: number;      // I * K
  taxaNoturnoNormal: number;        // (L * H) * 0.08
  adicionalNoturnoNormal: number;   // L * H
  totalNoturnoNormal: number;       // (L * H * 0.08) + (L * H)
  totalNoturnoDobrado: number;      // M * I
  totalNoturnoNob: number;          // M * I (Alias)

  // Dobra de Colaborador (Proposta Comercial - 40% ou 50%)
  qtdDobraColaborador: number;
  percDobraColaborador: number;     // 40 ou 50 (%)
  unitDobraColaborador: number;     // H * (perc / 100)
  totalDobraColaborador: number;    // Qtd * unitDobra

  // Taxas e Horas Extras (Valores Unitários por hora e Totais)
  unitHrExtraDiurna: number;        // (H / 12) * 1.5
  totalHrExtraDiurna: number;       // ((H / 12) * 1.5) * N
  totalHExtraDiurna: number;        // Alias for totalHrExtraDiurna
  unitTxExtraDiurna: number;        // 0.00
  totalTxExtraDiurna: number;       // 0.00
  unitHrExtraNoturna: number;       // (H / 12) * 1.5
  totalHrExtraNoturna: number;      // ((H / 12) * 1.5) * O
  totalHExtraNoturna: number;       // ((H / 12 * 1.5) * O) + ((H / 12 * O) * 0.08)
  unitTxExtraNoturna: number;       // (H / 12) * 0.08
  totalTxExtraNoturna: number;      // ((H / 12) * 0.08) * O

  // Totais Consolidados
  totalTaxas: number;               // taxaNoturnoNormal + totalTxExtraNoturna
  taxasNoturnas: number;            // taxaNoturnoNormal + totalTxExtraNoturna
  totalGeral: number;               // Soma exata de todos os componentes
}

export function calculatePersonnelCost(input: Partial<PersonnelCostInput>): PersonnelCostBreakdown {
  const H = Math.max(0, Number(input.valorNormal) || 0);
  const I = H * 0.5; // 50% Stand-by Rate
  const J = Math.max(0, Number(input.qtdDiariasNormal) || 0);
  const K = Math.max(0, Number(input.qtdDiariasStandBy) || 0);
  const L = Math.max(0, Number(input.noturnoNormal) || 0);
  const M = Math.max(0, Number(input.noturnoNob) || 0);
  const N = Math.max(0, Number(input.hExtraDiurna) || 0);
  const O = Math.max(0, Number(input.hExtraNoturna) || 0);
  const P = Math.max(0, Number(input.qtdDobraColaborador) || 0);
  const percDobra = (input.percDobraColaborador !== undefined && Number(input.percDobraColaborador) > 0)
    ? Number(input.percDobraColaborador)
    : 50;

  // Componentes de Diárias e Noturnos
  const totalDiariasNormais = J * H;
  const totalDiariasStandBy = I * K;
  const taxaNoturnoNormal = (L * H) * 0.08;
  const adicionalNoturnoNormal = L * H;
  const totalNoturnoNormal = taxaNoturnoNormal + adicionalNoturnoNormal;
  const totalNoturnoDobrado = M * I;

  // Dobra de Colaborador (40% ou 50% do Valor Normal da Diária conforme Proposta Comercial)
  const unitDobraColaborador = H * (percDobra / 100);
  const totalDobraColaborador = P * unitDobraColaborador;

  // Componentes de Horas Extras
  const valorHoraBase = H > 0 ? H / 12 : 0;
  const unitHrExtraDiurna = valorHoraBase * 1.5;
  const totalHrExtraDiurna = unitHrExtraDiurna * N;
  
  const unitTxExtraDiurna = 0;
  const totalTxExtraDiurna = 0;

  const unitHrExtraNoturna = valorHoraBase * 1.5;
  const totalHrExtraNoturna = unitHrExtraNoturna * O;

  const unitTxExtraNoturna = valorHoraBase * 0.08;
  const totalTxExtraNoturna = unitTxExtraNoturna * O;
  const totalHExtraNoturna = totalHrExtraNoturna + totalTxExtraNoturna;

  // Consolidados
  const totalTaxas = taxaNoturnoNormal + totalTxExtraNoturna + totalDobraColaborador;
  
  const totalGeral = 
    totalDiariasNormais + 
    totalDiariasStandBy + 
    taxaNoturnoNormal + 
    adicionalNoturnoNormal + 
    totalNoturnoDobrado + 
    totalDobraColaborador +
    totalHrExtraDiurna + 
    totalTxExtraNoturna + 
    totalHrExtraNoturna;

  return {
    valorNormal: H,
    standByRate: I,
    valorHora: valorHoraBase,
    qtdDiariasNormal: J,
    qtdDiariasStandBy: K,
    noturnoNormal: L,
    noturnoNob: M,
    hExtraDiurna: N,
    hExtraNoturna: O,
    qtdDobraColaborador: P,
    percDobraColaborador: percDobra,
    unitDobraColaborador,
    totalDobraColaborador,
    totalDiariasNormais,
    totalDiariasNormal: totalDiariasNormais,
    totalDiariasStandBy,
    taxaNoturnoNormal,
    adicionalNoturnoNormal,
    totalNoturnoNormal,
    totalNoturnoDobrado,
    totalNoturnoNob: totalNoturnoDobrado,
    unitHrExtraDiurna,
    totalHrExtraDiurna,
    totalHExtraDiurna: totalHrExtraDiurna,
    unitTxExtraDiurna,
    totalTxExtraDiurna,
    unitHrExtraNoturna,
    totalHrExtraNoturna,
    totalHExtraNoturna,
    unitTxExtraNoturna,
    totalTxExtraNoturna,
    totalTaxas,
    taxasNoturnas: totalTaxas,
    totalGeral
  };
}
