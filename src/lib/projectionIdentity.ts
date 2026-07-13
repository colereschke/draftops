import { readFileSync } from 'node:fs';
import { parseCsv } from '@/lib/csv';

export const DEFAULT_ETR_MATCHES_CSV = 'data/generated/etr_sleeper_matches.csv';

export interface EtrMatchRow {
  name: string;
  sleeperId: string;
}

export function parseEtrMatchRows(contents: string): EtrMatchRow[] {
  return parseCsv(contents)
    .rows.filter((row) => row.sleeper_id !== '')
    .map((row) => ({ name: row.etr_name, sleeperId: row.sleeper_id }));
}

export function readEtrMatchRows(path = DEFAULT_ETR_MATCHES_CSV): EtrMatchRow[] {
  return parseEtrMatchRows(readFileSync(path, 'utf-8'));
}

export function getEtrSleeperMatches(path = DEFAULT_ETR_MATCHES_CSV): Map<string, string> {
  return new Map(readEtrMatchRows(path).map((row) => [row.name, row.sleeperId]));
}
