import { normalizeName, normalizeTeam } from '@/lib/sleeperNormalize';

export interface SleeperPlayerRecord {
  id: string;
  name: string;
  normalizedName: string;
  team: string;
  pos: string;
}

export interface MatchInput {
  name: string;
  team: string;
  pos: string;
}

export type MatchOutcome = { status: 'matched'; sleeperId: string } | { status: 'unmatched' };

// Keep in sync with scripts/projections/draftops_projections/aliases.py's MANUAL_ALIASES —
// same purpose (ETR/rankings name spellings that don't normalize-match Sleeper's), duplicated
// here rather than shared across the Python/TS boundary since it's a short, static list.
const MANUAL_ALIASES: Record<string, string> = {
  'bam knight': 'zonovan knight',
  'cameron ward': 'cam ward',
  'chigoziem okonkwo': 'chig okonkwo',
  'christopher rodriguez': 'chris rodriguez',
  'hollywood brown': 'marquise brown',
  'josh palmer': 'joshua palmer',
  'ken walker': 'kenneth walker',
  'kenneth gainwell': 'kenny gainwell',
  'nathaniel dell': 'tank dell',
  'nick singleton': 'nicholas singleton',
};

export interface SleeperPlayerIndex {
  byNamePos: Map<string, SleeperPlayerRecord[]>;
}

// Groups the pool by `${normalizedName}|${pos}` once so a batch of matches (e.g. every row in an
// uploaded CSV) doesn't rescan the full pool per lookup. Build once per batch, not per row.
export function buildSleeperPlayerIndex(sleeperPlayers: SleeperPlayerRecord[]): SleeperPlayerIndex {
  const byNamePos = new Map<string, SleeperPlayerRecord[]>();
  for (const p of sleeperPlayers) {
    const key = `${p.normalizedName}|${p.pos}`;
    const existing = byNamePos.get(key);
    if (existing) existing.push(p);
    else byNamePos.set(key, [p]);
  }
  return { byNamePos };
}

export function matchToSleeperIndexed(input: MatchInput, index: SleeperPlayerIndex): MatchOutcome {
  const normalizedName = normalizeName(input.name);
  const normalizedTeam = normalizeTeam(input.team);

  const byNameAndPos = index.byNamePos.get(`${normalizedName}|${input.pos}`) ?? [];

  if (normalizedTeam) {
    const withTeam = byNameAndPos.filter((p) => p.team === normalizedTeam);
    if (withTeam.length === 1) return { status: 'matched', sleeperId: withTeam[0].id };
  }
  if (byNameAndPos.length === 1) {
    return { status: 'matched', sleeperId: byNameAndPos[0].id };
  }

  const alias = MANUAL_ALIASES[normalizedName];
  if (alias) {
    const aliasCandidates = (index.byNamePos.get(`${alias}|${input.pos}`) ?? []).filter(
      (p) => !normalizedTeam || p.team === normalizedTeam,
    );
    if (aliasCandidates.length === 1) {
      return { status: 'matched', sleeperId: aliasCandidates[0].id };
    }
  }

  return { status: 'unmatched' };
}

export function matchToSleeper(
  input: MatchInput,
  sleeperPlayers: SleeperPlayerRecord[],
): MatchOutcome {
  return matchToSleeperIndexed(input, buildSleeperPlayerIndex(sleeperPlayers));
}
