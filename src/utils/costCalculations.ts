/**
 * Utilitário de Cálculos de Custo de Pessoal
 * Fiel 100% à fórmula do Excel da Qualitech (Modelo de DI.xlsx) e ao SAP Business One:
 * Formula: =(J41*H41)+(I41*K41)+(L41*H41)*8%+(L41*H41)+(M41*I41)+((H41/12*1,5)*N41)+((H41/12)*O41)*8%+(((H41/12*1,5)*O41))
 */

export interface PersonnelCostInput {
  valorNormal: number;           // H41 - Valor Normal da Diária (ex: 500.00)
  qtdDiariasNormal: number;      // J41 - Qtd diárias: Normal (Emb-St) (ex: 9)
  qtdDiariasStandBy: number;     // K41 - Qtd diárias: Stand-by Rate (ex: 1)
  noturnoNormal: number;         // L41 - Noturno Normal (ex: 1)
  noturnoNob: number;            // M41 - Noturno Dobrado / Stand-by (ex: 1)
  hExtraDiurna: number;          // N41 - Horas Extras Diurnas (ex: 1)
  hExtraNoturna: number;         // O41 - Horas Extras Noturnas (ex: 1)
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

  // Componentes de Diárias e Noturnos
  const totalDiariasNormais = J * H;
  const totalDiariasStandBy = I * K;
  const taxaNoturnoNormal = (L * H) * 0.08;
  const adicionalNoturnoNormal = L * H;
  const totalNoturnoNormal = taxaNoturnoNormal + adicionalNoturnoNormal;
  const totalNoturnoDobrado = M * I;

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
  const totalTaxas = taxaNoturnoNormal + totalTxExtraNoturna;
  
  const totalGeral = 
    totalDiariasNormais + 
    totalDiariasStandBy + 
    taxaNoturnoNormal + 
    adicionalNoturnoNormal + 
    totalNoturnoDobrado + 
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
