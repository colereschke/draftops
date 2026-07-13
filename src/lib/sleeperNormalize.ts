const SUFFIX_RE = /\b(jr|sr|ii|iii|iv|v)\.?\b/gi;
const MIDDLE_INITIAL_RE = /\b[a-z]\b/gi;
const WHITESPACE_RE = /\s+/g;

const TEAM_ALIASES: Record<string, string> = {
  ARI: 'ARI',
  ARZ: 'ARI',
  ATL: 'ATL',
  BAL: 'BAL',
  BLT: 'BAL',
  BUF: 'BUF',
  CAR: 'CAR',
  CHI: 'CHI',
  CIN: 'CIN',
  CLE: 'CLE',
  CLV: 'CLE',
  DAL: 'DAL',
  DEN: 'DEN',
  DET: 'DET',
  GB: 'GB',
  HOU: 'HOU',
  HST: 'HOU',
  IND: 'IND',
  JAC: 'JAX',
  JAX: 'JAX',
  KC: 'KC',
  LA: 'LAR',
  LAC: 'LAC',
  LAR: 'LAR',
  LV: 'LV',
  OAK: 'LV',
  MIA: 'MIA',
  MIN: 'MIN',
  NE: 'NE',
  NO: 'NO',
  NYG: 'NYG',
  NYJ: 'NYJ',
  PHI: 'PHI',
  PIT: 'PIT',
  SEA: 'SEA',
  SF: 'SF',
  TB: 'TB',
  TEN: 'TEN',
  WFT: 'WAS',
  WAS: 'WAS',
  WSH: 'WAS',
};

export function normalizeName(name: string): string {
  let normalized = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks left by NFKD
    .toLowerCase()
    .trim()
    .replace(/\./g, '')
    .replace(/'/g, '')
    .replace(/-/g, '')
    .replace(/,/g, '');
  normalized = normalized.replace(SUFFIX_RE, '');
  normalized = normalized.replace(MIDDLE_INITIAL_RE, '');
  return normalized.replace(WHITESPACE_RE, ' ').trim();
}

export function normalizeTeam(team: string | null | undefined): string {
  if (!team) return '';
  const raw = team.trim().toUpperCase();
  if (raw === '' || raw === 'FA' || raw === '-' || raw === '—' || raw === '–') return '';
  return TEAM_ALIASES[raw] ?? raw;
}

export function normalizePosition(
  position: string | null | undefined,
): 'QB' | 'RB' | 'WR' | 'TE' | null {
  if (!position) return null;
  const normalized = position.trim().toUpperCase();
  if (normalized === 'QB' || normalized === 'RB' || normalized === 'WR' || normalized === 'TE') {
    return normalized;
  }
  return null;
}
