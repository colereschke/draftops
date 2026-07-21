import { CsvParseError, parseCsv } from '@/lib/csv';
import { scaleRankingValue } from '@/lib/scaleRankingValue';
import { normalizeName } from '@/lib/sleeperNormalize';
import type { Position } from '@/types';

export interface ParsedRankingRow {
  name: string;
  team: string;
  pos: Position;
  age: number | null;
  sfRank: number;
  budget: number;
  ceiling: number;
  floor: number;
  notes: string;
}

export type RankingsParseResult =
  { ok: true; rows: ParsedRankingRow[] } | { ok: false; errors: string[] };

const REQUIRED_HEADERS = ['Player', 'Team', 'Position', 'Age', '2QBAuction'] as const;
export const RANKINGS_CSV_LIMITS = {
  maxBytes: 1024 * 1024,
  maxRows: 2000,
  maxFieldLength: 10000,
  maxErrors: 25,
} as const;

const POSITION_MAP: Record<string, Position> = {
  QB: 'QB',
  RB: 'RB',
  WR: 'WR',
  TE: 'TE',
  PICK: 'PICK',
};

interface KeptRow {
  name: string;
  team: string;
  pos: Position;
  age: number | null;
  notes: string;
  rawValue: number;
  explicitRank: number | null;
}

export function parseRankingsCsv(csvText: string): RankingsParseResult {
  let headers: string[];
  let rawRows: Record<string, string>[];

  try {
    ({ headers, rows: rawRows } = parseCsv(csvText, RANKINGS_CSV_LIMITS));
  } catch (error) {
    if (error instanceof CsvParseError) {
      return { ok: false, errors: [error.message] };
    }
    throw error;
  }

  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    return { ok: false, errors: [`Missing required column(s): ${missing.join(', ')}`] };
  }
  const hasExplicitRank = headers.includes('SF/TE Prem');

  const errors: string[] = [];
  let errorsTruncated = false;
  const addError = (message: string) => {
    if (errors.length < RANKINGS_CSV_LIMITS.maxErrors) {
      errors.push(message);
    } else {
      errorsTruncated = true;
    }
  };
  const kept: KeptRow[] = [];
  const playerIdentities = new Set<string>();
  const explicitRanks = new Set<number>();

  rawRows.forEach((row, i) => {
    const rowNum = i + 2;
    const pos = POSITION_MAP[row.Position?.trim().toUpperCase() ?? ''];
    if (!pos) return;

    const name = row.Player?.trim();
    if (!name) {
      addError(`Row ${rowNum}: missing Player name`);
      return;
    }

    let age: number | null = null;
    if (pos !== 'PICK') {
      const ageRaw = row.Age?.trim();
      const parsedAge = Number(ageRaw);
      if (!ageRaw || !Number.isFinite(parsedAge) || parsedAge < 0 || parsedAge > 100) {
        addError(`Row ${rowNum} (${name}): invalid Age "${ageRaw ?? ''}"`);
        return;
      }
      age = parsedAge;
    }

    const valueRaw = row['2QBAuction']?.trim().replace(/^\$/, '');
    const parsedValue = Number(valueRaw);
    if (
      valueRaw === undefined ||
      valueRaw === '' ||
      !Number.isFinite(parsedValue) ||
      parsedValue < 0 ||
      parsedValue > 1000000
    ) {
      addError(`Row ${rowNum} (${name}): invalid 2QBAuction value "${row['2QBAuction'] ?? ''}"`);
      return;
    }

    let explicitRank: number | null = null;
    if (hasExplicitRank) {
      const rankRaw = row['SF/TE Prem']?.trim();
      const parsedRank = Number(rankRaw);
      if (
        !rankRaw ||
        !Number.isFinite(parsedRank) ||
        !Number.isInteger(parsedRank) ||
        parsedRank < 1 ||
        parsedRank > 10000
      ) {
        addError(`Row ${rowNum} (${name}): invalid SF/TE Prem "${rankRaw ?? ''}"`);
        return;
      }
      explicitRank = parsedRank;
    }

    const playerIdentity = `${normalizeName(name)}:${pos}`;
    if (playerIdentities.has(playerIdentity)) {
      addError(`Row ${rowNum} (${name}): duplicate player identity`);
      return;
    }
    playerIdentities.add(playerIdentity);

    if (explicitRank !== null) {
      if (explicitRanks.has(explicitRank)) {
        addError(`Row ${rowNum} (${name}): duplicate explicit rank ${explicitRank}`);
        return;
      }
      explicitRanks.add(explicitRank);
    }

    kept.push({
      name,
      team: row.Team?.trim() ?? '',
      pos,
      age,
      notes: row.Notes?.trim() ?? '',
      rawValue: parsedValue,
      explicitRank,
    });
  });

  if (errors.length > 0) {
    return {
      ok: false,
      errors: errorsTruncated
        ? [
            ...errors,
            `Too many validation errors; showing the first ${RANKINGS_CSV_LIMITS.maxErrors}.`,
          ]
        : errors,
    };
  }

  const scaled = kept.map((row) => ({ ...row, ...scaleRankingValue(row.pos, row.rawValue) }));

  const ranked = hasExplicitRank
    ? scaled.map((row) => ({ ...row, sfRank: row.explicitRank as number }))
    : [...scaled].sort((a, b) => b.budget - a.budget).map((row, i) => ({ ...row, sfRank: i + 1 }));

  const rows: ParsedRankingRow[] = ranked.map(
    ({ name, team, pos, age, sfRank, budget, ceiling, floor, notes }) => ({
      name,
      team,
      pos,
      age,
      sfRank,
      budget,
      ceiling,
      floor,
      notes,
    }),
  );

  return { ok: true, rows };
}
