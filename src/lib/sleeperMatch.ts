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

export function matchToSleeper(
  input: MatchInput,
  sleeperPlayers: SleeperPlayerRecord[],
): MatchOutcome {
  const normalizedName = normalizeName(input.name);
  const normalizedTeam = normalizeTeam(input.team);

  const byNameAndPos = sleeperPlayers.filter(
    (p) => p.normalizedName === normalizedName && p.pos === input.pos,
  );

  if (normalizedTeam) {
    const withTeam = byNameAndPos.filter((p) => p.team === normalizedTeam);
    if (withTeam.length === 1) return { status: 'matched', sleeperId: withTeam[0].id };
  }
  if (byNameAndPos.length === 1) {
    return { status: 'matched', sleeperId: byNameAndPos[0].id };
  }

  const alias = MANUAL_ALIASES[normalizedName];
  if (alias) {
    const aliasCandidates = sleeperPlayers.filter(
      (p) =>
        p.normalizedName === alias &&
        p.pos === input.pos &&
        (!normalizedTeam || p.team === normalizedTeam),
    );
    if (aliasCandidates.length === 1) {
      return { status: 'matched', sleeperId: aliasCandidates[0].id };
    }
  }

  return { status: 'unmatched' };
}
