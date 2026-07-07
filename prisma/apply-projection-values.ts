import { config as dotenvConfig } from 'dotenv';
import { readFileSync } from 'node:fs';
import { calculateProjectedPoints, type ProjectionStats } from '@/lib/projectionScoring';
import { calculateProjectionValues, type ProjectionValueInput } from '@/lib/projectionVor';
import {
  DEFAULT_SCORING_SETTINGS,
  DEFAULT_STARTING_LINEUP,
  DEFAULT_TARGET_ROSTER,
  type Position,
  type ScoringSettings,
  type StartingSlot,
} from '@/types';

type VorPosition = 'QB' | 'RB' | 'WR' | 'TE';

export interface PlayerJoinRow {
  id: number;
  name: string;
  pos: string;
  sleeperId: string | null;
  budget: number;
}

export interface ProjectionJoinRow {
  sleeperId: string;
  position: VorPosition;
  projectedPoints: number;
  isRookie: boolean;
}

export interface JoinedProjectionRow {
  playerId: number;
  sleeperId: string;
  position: VorPosition;
  projectedPoints: number;
  fallbackAuctionValue: number;
  isRookie: boolean;
}

interface EtrMatchRow {
  name: string;
  sleeperId: string;
}

interface CsvProjectionRow {
  sleeperId: string;
  position: VorPosition;
  games: number;
  passYds: number;
  passTd: number;
  passInt: number;
  rushAtt: number;
  rushYds: number;
  rushTd: number;
  targets: number;
  receptions: number;
  recYds: number;
  recTd: number;
  projectedPoints: number;
  isRookie: boolean;
  projectionSource: string;
  projectionDate: Date | null;
  projectionSeason: number | null;
}

export function joinPlayersToProjectionRows(
  players: PlayerJoinRow[],
  projections: ProjectionJoinRow[],
): JoinedProjectionRow[] {
  const projectionsBySleeperId = new Map(
    projections.map((projection) => [projection.sleeperId, projection]),
  );

  return players.flatMap((player) => {
    if (!player.sleeperId) return [];
    const projection = projectionsBySleeperId.get(player.sleeperId);
    if (!projection) return [];
    return [
      {
        playerId: player.id,
        sleeperId: player.sleeperId,
        position: projection.position,
        projectedPoints: projection.projectedPoints,
        fallbackAuctionValue: player.budget,
        isRookie: projection.isRookie,
      },
    ];
  });
}

export function readEtrMatchRows(path: string): EtrMatchRow[] {
  return parseCsv(readFileSync(path, 'utf-8'))
    .filter((row) => row.sleeper_id !== '')
    .map((row) => ({ name: row.etr_name, sleeperId: row.sleeper_id }));
}

export function readProjectionRows(path: string, scoring: ScoringSettings): CsvProjectionRow[] {
  return parseCsv(readFileSync(path, 'utf-8')).flatMap((row) => {
    const position = toVorPosition(row.position);
    if (!row.sleeper_id || !position) return [];

    const stats: ProjectionStats = {
      sleeperId: row.sleeper_id,
      position,
      games: toNumber(row.games),
      passYds: toNumber(row.pass_yds),
      passTd: toNumber(row.pass_td),
      passInt: toNumber(row.pass_int),
      rushAtt: toNumber(row.rush_att),
      rushYds: toNumber(row.rush_yds),
      rushTd: toNumber(row.rush_td),
      targets: toNumber(row.targets),
      receptions: toNumber(row.receptions),
      recYds: toNumber(row.rec_yds),
      recTd: toNumber(row.rec_td),
    };

    return [
      {
        sleeperId: row.sleeper_id,
        position,
        games: stats.games,
        passYds: stats.passYds,
        passTd: stats.passTd,
        passInt: stats.passInt,
        rushAtt: stats.rushAtt,
        rushYds: stats.rushYds,
        rushTd: stats.rushTd,
        targets: stats.targets,
        receptions: stats.receptions,
        recYds: stats.recYds,
        recTd: stats.recTd,
        projectedPoints: calculateProjectedPoints(stats, scoring),
        isRookie: toNumber(row.years_exp) === 0,
        projectionSource: row.projection_source,
        projectionDate: row.projection_date
          ? new Date(`${row.projection_date}T00:00:00.000Z`)
          : null,
        projectionSeason: row.season ? toNumber(row.season) : null,
      },
    ];
  });
}

async function main(): Promise<void> {
  dotenvConfig({ path: '.env.local' });
  const args = parseArgs(process.argv.slice(2));
  if (args.draftId === null) throw new Error('Missing required --draft-id');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

  const [{ PrismaClient }, { PrismaPg }, { Pool }] = await Promise.all([
    import('@prisma/client'),
    import('@prisma/adapter-pg'),
    import('pg'),
  ]);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const draft = await prisma.draft.findUnique({
      where: { id: args.draftId },
      select: {
        id: true,
        teamCount: true,
        rosterSize: true,
        budget: true,
        startingLineup: true,
        scoringSettings: true,
        targetRoster: true,
      },
    });
    if (!draft) throw new Error(`Draft ${args.draftId} not found`);

    const scoringSettings = toScoringSettings(draft.scoringSettings);
    const etrMatches = new Map(
      readEtrMatchRows(args.etrMatchesCsv).map((row) => [row.name, row.sleeperId]),
    );
    const projectionRows = readProjectionRows(args.projectionsCsv, scoringSettings);
    const projectionsBySleeperId = new Map(
      projectionRows.map((row) => [
        row.sleeperId,
        {
          sleeperId: row.sleeperId,
          position: row.position,
          projectedPoints: row.projectedPoints,
          isRookie: row.isRookie,
        },
      ]),
    );

    const players = await prisma.player.findMany({
      where: { draftId: draft.id },
      select: { id: true, name: true, pos: true, sleeperId: true, budget: true },
    });
    const playersWithSleeperIds = players.map((player) => ({
      ...player,
      sleeperId: player.sleeperId ?? etrMatches.get(player.name) ?? null,
    }));

    const joined = joinPlayersToProjectionRows(
      playersWithSleeperIds,
      Array.from(projectionsBySleeperId.values()),
    );
    const projectionInputs: ProjectionValueInput[] = joined.map((row) => ({
      sleeperId: row.sleeperId,
      name: String(row.playerId),
      position: row.position,
      projectedPoints: row.projectedPoints,
      fallbackAuctionValue: row.fallbackAuctionValue,
      isRookie: row.isRookie,
    }));
    const values = calculateProjectionValues({
      players: projectionInputs,
      teamCount: draft.teamCount,
      rosterSize: draft.rosterSize,
      budget: draft.budget,
      startingLineup: toStartingLineup(draft.startingLineup),
      targetRoster: toTargetRoster(draft.targetRoster),
      scoringSettings,
      activateProjectionValues: false,
    });
    const valuesBySleeperId = new Map(values.map((value) => [value.sleeperId, value]));

    await prisma.$transaction(async (tx) => {
      for (const player of playersWithSleeperIds) {
        if (!player.sleeperId) continue;
        await tx.player.update({
          where: { id: player.id },
          data: { sleeperId: player.sleeperId },
        });
      }

      for (const row of joined) {
        const value = valuesBySleeperId.get(row.sleeperId);
        const projection = projectionRows.find(
          (candidate) => candidate.sleeperId === row.sleeperId,
        );
        if (!value || !projection) continue;
        await tx.player.update({
          where: { id: row.playerId },
          data: {
            projectedPoints: row.projectedPoints,
            replacementPoints: value.replacementPoints,
            vor: value.vor,
            projectionAuctionValue: value.projectionAuctionValue,
            fallbackAuctionValue: row.fallbackAuctionValue,
            activeAuctionValue: value.activeAuctionValue,
            valueSource: 'fallback',
            projectionSource: projection.projectionSource,
            projectionDate: projection.projectionDate,
            projectionSeason: projection.projectionSeason,
          },
        });
      }
    });

    console.log(`Applied projection values to ${joined.length} player(s).`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

interface CliArgs {
  draftId: number | null;
  projectionsCsv: string;
  etrMatchesCsv: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    draftId: null,
    projectionsCsv: 'data/generated/master_projections.csv',
    etrMatchesCsv: 'data/generated/etr_sleeper_matches.csv',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--draft-id') {
      args.draftId = Number(value);
      i += 1;
    } else if (key === '--projections-csv') {
      args.projectionsCsv = value;
      i += 1;
    } else if (key === '--etr-matches-csv') {
      args.etrMatchesCsv = value;
      i += 1;
    }
  }
  return args;
}

function parseCsv(contents: string): Record<string, string>[] {
  const [headerLine, ...lines] = contents.trim().split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  return lines.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}

function toNumber(value: string): number {
  if (value === '') return 0;
  return Number(value);
}

function toVorPosition(position: string): VorPosition | null {
  if (position === 'QB' || position === 'RB' || position === 'WR' || position === 'TE') {
    return position;
  }
  return null;
}

function toStartingLineup(value: unknown): StartingSlot[] {
  if (!Array.isArray(value)) return [...DEFAULT_STARTING_LINEUP];
  const slots = value.filter(isStartingSlot);
  return slots.length > 0 ? slots : [...DEFAULT_STARTING_LINEUP];
}

function isStartingSlot(value: unknown): value is StartingSlot {
  return (
    value === 'QB' ||
    value === 'RB' ||
    value === 'WR' ||
    value === 'TE' ||
    value === 'FLEX' ||
    value === 'SUPER_FLEX'
  );
}

function toScoringSettings(value: unknown): ScoringSettings {
  if (value === null || typeof value !== 'object') return { ...DEFAULT_SCORING_SETTINGS };
  return { ...DEFAULT_SCORING_SETTINGS, ...(value as Partial<ScoringSettings>) };
}

function toTargetRoster(value: unknown): Partial<Record<Position, number>> {
  if (value === null || typeof value !== 'object') return DEFAULT_TARGET_ROSTER;
  return value as Partial<Record<Position, number>>;
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
