import { config as dotenvConfig } from 'dotenv';
import { readFileSync } from 'node:fs';
import { parseCsv } from '@/lib/csv';
import {
  applyProjectionValuesToDraft,
  buildDraftPlayerValueData,
  buildStaleDraftPlayerValueDeleteWhere,
  getSleeperIdUpdates,
  joinPlayersToProjectionRows,
  resolvePlayerSleeperIds,
  type VorPosition,
} from '@/lib/projectionApplication';
import { calculateProjectedPoints, type ProjectionStats } from '@/lib/projectionScoring';
import { DEFAULT_SCORING_SETTINGS, type ScoringSettings } from '@/types';

export {
  buildDraftPlayerValueData,
  buildStaleDraftPlayerValueDeleteWhere,
  getSleeperIdUpdates,
  joinPlayersToProjectionRows,
  resolvePlayerSleeperIds,
};

interface EtrMatchRow {
  name: string;
  sleeperId: string;
}

export interface CsvProjectionRow {
  sleeperId: string;
  position: VorPosition;
  games: number;
  passAtt: number;
  passCmp: number;
  passYds: number;
  passTd: number;
  passInt: number;
  passSacks: number;
  rushAtt: number;
  rushYds: number;
  rushTd: number;
  targets: number;
  receptions: number;
  recYds: number;
  recTd: number;
  baseFantasyPoints: number;
  projectionRank: number | null;
  projectedPoints: number;
  baselineProjectedPoints: number;
  isRookie: boolean;
  projectionSource: string;
  projectionDate: Date | null;
  projectionSeason: number | null;
}

export interface ProjectionSourceInput {
  name: string;
  season: number;
  projectionDate: Date | null;
}

export interface ProjectionSourceGroup {
  source: ProjectionSourceInput;
  rows: CsvProjectionRow[];
}

const WRITE_BATCH_SIZE = 50;
const WRITE_TRANSACTION_TIMEOUT_MS = 60_000;

export function readEtrMatchRows(path: string): EtrMatchRow[] {
  return parseCsv(readFileSync(path, 'utf-8'))
    .rows.filter((row) => row.sleeper_id !== '')
    .map((row) => ({ name: row.etr_name, sleeperId: row.sleeper_id }));
}

export function readProjectionRows(path: string, scoring: ScoringSettings): CsvProjectionRow[] {
  return parseProjectionRows(readFileSync(path, 'utf-8'), scoring);
}

export function parseProjectionRows(
  contents: string,
  scoring: ScoringSettings,
): CsvProjectionRow[] {
  return parseCsv(contents).rows.flatMap((row) => {
    const position = toVorPosition(row.position);
    if (!row.sleeper_id || !position) return [];

    const stats: ProjectionStats = {
      sleeperId: row.sleeper_id,
      position,
      games: toNumber(row.games),
      passAtt: toNumber(row.pass_att),
      passCmp: toNumber(row.pass_cmp),
      passYds: toNumber(row.pass_yds),
      passTd: toNumber(row.pass_td),
      passInt: toNumber(row.pass_int),
      passSacks: toNumber(row.pass_sacks),
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
        passAtt: stats.passAtt,
        passCmp: stats.passCmp,
        passYds: stats.passYds,
        passTd: stats.passTd,
        passInt: stats.passInt,
        passSacks: stats.passSacks,
        rushAtt: stats.rushAtt,
        rushYds: stats.rushYds,
        rushTd: stats.rushTd,
        targets: stats.targets,
        receptions: stats.receptions,
        recYds: stats.recYds,
        recTd: stats.recTd,
        baseFantasyPoints: toNumber(row.base_fantasy_points),
        projectionRank: row.projection_rank ? toNumber(row.projection_rank) : null,
        projectedPoints: calculateProjectedPoints(stats, scoring),
        baselineProjectedPoints: calculateProjectedPoints(stats, DEFAULT_SCORING_SETTINGS),
        isRookie: toNumber(row.years_exp) === 0,
        projectionSource: row.projection_source || 'unknown',
        projectionDate: row.projection_date
          ? new Date(`${row.projection_date}T00:00:00.000Z`)
          : null,
        projectionSeason: row.season ? toNumber(row.season) : null,
      },
    ];
  });
}

export function groupProjectionRowsBySource(rows: CsvProjectionRow[]): ProjectionSourceGroup[] {
  const groups = new Map<string, ProjectionSourceGroup>();
  for (const row of rows) {
    const source: ProjectionSourceInput = {
      name: row.projectionSource,
      season: row.projectionSeason ?? 0,
      projectionDate: row.projectionDate,
    };
    const key = sourceKey(source);
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      groups.set(key, { source, rows: [row] });
    }
  }
  return Array.from(groups.values());
}

interface ProjectionImportPrisma {
  projectionSource: {
    findFirst(args: {
      where: { name: string; season: number; projectionDate: Date | null };
    }): Promise<{ id: number } | null>;
    create(args: {
      data: { name: string; season: number; projectionDate: Date | null };
    }): Promise<{ id: number }>;
  };
  playerProjection: {
    upsert(args: {
      where: {
        sleeperId_projectionSourceId: {
          sleeperId: string;
          projectionSourceId: number;
        };
      };
      create: ReturnType<typeof playerProjectionData>;
      update: ReturnType<typeof playerProjectionData>;
    }): unknown;
  };
  $transaction(operations: unknown[], options?: { timeout: number }): Promise<unknown[]>;
}

export interface ProjectionImportResult {
  projectionSourceId: number;
  importedCount: number;
}

export async function importProjectionRows(
  prisma: ProjectionImportPrisma,
  rows: CsvProjectionRow[],
): Promise<ProjectionImportResult[]> {
  const projectionGroups = groupProjectionRowsBySource(rows);
  const results: ProjectionImportResult[] = [];

  for (const group of projectionGroups) {
    const source =
      (await prisma.projectionSource.findFirst({
        where: {
          name: group.source.name,
          season: group.source.season,
          projectionDate: group.source.projectionDate,
        },
      })) ??
      (await prisma.projectionSource.create({
        data: {
          name: group.source.name,
          season: group.source.season,
          projectionDate: group.source.projectionDate,
        },
      }));

    for (const batch of chunk(group.rows, WRITE_BATCH_SIZE)) {
      await prisma.$transaction(
        batch.map((projection) =>
          prisma.playerProjection.upsert({
            where: {
              sleeperId_projectionSourceId: {
                sleeperId: projection.sleeperId,
                projectionSourceId: source.id,
              },
            },
            create: playerProjectionData(projection, source.id),
            update: playerProjectionData(projection, source.id),
          }),
        ),
        { timeout: WRITE_TRANSACTION_TIMEOUT_MS },
      );
    }

    results.push({ projectionSourceId: source.id, importedCount: group.rows.length });
  }

  return results;
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
    const importResults = await importProjectionRows(prisma, projectionRows);
    const projectionSourceId = importResults.at(-1)?.projectionSourceId;
    const applyResult = await applyProjectionValuesToDraft(prisma, {
      draftId: draft.id,
      projectionSourceId,
      etrMatches,
    });

    console.log(`Applied projection values to ${applyResult.appliedCount} player-source row(s).`);
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

function sourceKey(source: ProjectionSourceInput): string {
  return [
    source.name,
    source.season,
    source.projectionDate ? source.projectionDate.toISOString() : '',
  ].join('|');
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function playerProjectionData(projection: CsvProjectionRow, projectionSourceId: number) {
  return {
    sleeperId: projection.sleeperId,
    position: projection.position,
    games: projection.games,
    passAtt: projection.passAtt,
    passCmp: projection.passCmp,
    passYds: projection.passYds,
    passTd: projection.passTd,
    passInt: projection.passInt,
    passSacks: projection.passSacks,
    rushAtt: projection.rushAtt,
    rushYds: projection.rushYds,
    rushTd: projection.rushTd,
    targets: projection.targets,
    receptions: projection.receptions,
    recYds: projection.recYds,
    recTd: projection.recTd,
    baseFantasyPoints: projection.baseFantasyPoints,
    projectionRank: projection.projectionRank,
    isRookie: projection.isRookie,
    projectionSourceId,
  };
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

function toScoringSettings(value: unknown): ScoringSettings {
  if (value === null || typeof value !== 'object') return { ...DEFAULT_SCORING_SETTINGS };
  return { ...DEFAULT_SCORING_SETTINGS, ...(value as Partial<ScoringSettings>) };
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
