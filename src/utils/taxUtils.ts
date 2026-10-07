export function formatTaxId(val?: string | null): string {
  if (!val) return '-';
  const clean = String(val).trim().replace(/\D/g, '');
  if (clean.length === 14) {
    return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  if (clean.length === 11) {
    return clean.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  return String(val).trim() || '-';
}

export function normalizeSearchTerm(str?: string | null): string {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function matchPartnerQuery(bp: any, query?: string | null): boolean {
  if (!query || !query.trim()) return true;
  const rawQ = normalizeSearchTerm(query);
  const digitsQ = query.replace(/\D/g, '');

  const code = normalizeSearchTerm(bp.CardCode);
  const name = normalizeSearchTerm(bp.CardName || bp.RequesterName);
  const tax = normalizeSearchTerm(bp.FederalTaxID || bp.TaxId0);
  const taxDigits = (bp.FederalTaxID || bp.TaxId0 || '').replace(/\D/g, '');

  // 1. Direct code or name contains
  if (code.includes(rawQ) || name.includes(rawQ)) return true;

  // 2. CNPJ digits match
  if (digitsQ.length >= 3 && taxDigits.includes(digitsQ)) return true;

  // 3. Normalized alphanumeric match (ignores spaces, dots, hyphens, slashes)
  const cleanName = name.replace(/[^a-z0-9]/g, '');
  const cleanQ = rawQ.replace(/[^a-z0-9]/g, '');
  if (cleanQ.length >= 2 && cleanName.includes(cleanQ)) return true;

  // 4. Flexible / phonetic / vowel-tolerant: e.g. "forsea" vs "foresea"
  const consonantsName = cleanName.replace(/[aeiou]/g, '');
  const consonantsQ = cleanQ.replace(/[aeiou]/g, '');
  if (consonantsQ.length >= 3 && consonantsName.includes(consonantsQ)) return true;

  // 5. Multi-token match: all typed words present in name or code
  const tokens = rawQ.split(/\s+/).filter(t => t.length >= 2);
  if (tokens.length > 1 && tokens.every(t => name.includes(t) || code.includes(t))) return true;

  return false;
}
