import { config as dotenvConfig } from 'dotenv';
import { readFileSync } from 'node:fs';
import {
  calculateProjectionMarketValues,
  type ProjectionMarketValueOutput,
} from '@/lib/projectionMarketValue';
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

export interface ResolvedPlayerJoinRow extends PlayerJoinRow {
  shouldUpdateSleeperId: boolean;
}

export interface SleeperIdUpdate {
  id: number;
  sleeperId: string;
}

export interface ProjectionJoinRow {
  sleeperId: string;
  position: VorPosition;
  projectedPoints: number;
  baselineProjectedPoints: number;
  isRookie: boolean;
}

export interface JoinedProjectionRow {
  playerId: number;
  sleeperId: string;
  position: VorPosition;
  projectedPoints: number;
  baselineProjectedPoints: number;
  fallbackAuctionValue: number;
  isRookie: boolean;
}

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

export function resolvePlayerSleeperIds(
  players: PlayerJoinRow[],
  etrMatches: Map<string, string>,
): ResolvedPlayerJoinRow[] {
  return players.map((player) => {
    const resolvedSleeperId = player.sleeperId ?? etrMatches.get(player.name) ?? null;
    return {
      ...player,
      sleeperId: resolvedSleeperId,
      shouldUpdateSleeperId: player.sleeperId !== resolvedSleeperId && resolvedSleeperId !== null,
    };
  });
}

export function getSleeperIdUpdates(players: ResolvedPlayerJoinRow[]): SleeperIdUpdate[] {
  return players.flatMap((player) =>
    player.shouldUpdateSleeperId && player.sleeperId
      ? [{ id: player.id, sleeperId: player.sleeperId }]
      : [],
  );
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
        baselineProjectedPoints: projection.baselineProjectedPoints,
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
  return parseProjectionRows(readFileSync(path, 'utf-8'), scoring);
}

export function parseProjectionRows(
  contents: string,
  scoring: ScoringSettings,
): CsvProjectionRow[] {
  return parseCsv(contents).flatMap((row) => {
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
    const projectionGroups = groupProjectionRowsBySource(projectionRows);

    const players = await prisma.player.findMany({
      where: { draftId: draft.id },
      select: { id: true, name: true, pos: true, sleeperId: true, budget: true },
    });
    const playersWithSleeperIds = resolvePlayerSleeperIds(players, etrMatches);
    let appliedCount = 0;

    for (const batch of chunk(getSleeperIdUpdates(playersWithSleeperIds), WRITE_BATCH_SIZE)) {
      await prisma.$transaction(
        batch.map((player) =>
          prisma.player.update({
            where: { id: player.id },
            data: { sleeperId: player.sleeperId },
          }),
        ),
        { timeout: WRITE_TRANSACTION_TIMEOUT_MS },
      );
    }

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

      const joined = joinPlayersToProjectionRows(
        playersWithSleeperIds,
        group.rows.map((row) => ({
          sleeperId: row.sleeperId,
          position: row.position,
          projectedPoints: row.projectedPoints,
          baselineProjectedPoints: row.baselineProjectedPoints,
          isRookie: row.isRookie,
        })),
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
      });
      const valuesBySleeperId = new Map(values.map((value) => [value.sleeperId, value]));
      const projectionMarketValues = calculateProjectionMarketValues({
        players: joined.map((row) => ({
          sleeperId: row.sleeperId,
          name: String(row.playerId),
          position: row.position,
          projectedPoints: row.projectedPoints,
          baselineProjectedPoints: row.baselineProjectedPoints,
          fallbackAuctionValue: row.fallbackAuctionValue,
          isRookie: row.isRookie,
        })),
      });
      const marketValuesBySleeperId = new Map(
        projectionMarketValues.map((value) => [value.sleeperId, value]),
      );
      const draftPlayerValueWrites = joined.flatMap((row) => {
        const value = valuesBySleeperId.get(row.sleeperId);
        const marketValue = marketValuesBySleeperId.get(row.sleeperId);
        if (!value || !marketValue) return [];
        const data = buildDraftPlayerValueData(row, value, marketValue);
        return [
          prisma.draftPlayerValue.upsert({
            where: {
              draftId_playerId_projectionSourceId: {
                draftId: draft.id,
                playerId: row.playerId,
                projectionSourceId: source.id,
              },
            },
            create: {
              draftId: draft.id,
              playerId: row.playerId,
              projectionSourceId: source.id,
              ...data,
            },
            update: data,
          }),
        ];
      });

      for (const batch of chunk(draftPlayerValueWrites, WRITE_BATCH_SIZE)) {
        await prisma.$transaction(batch, { timeout: WRITE_TRANSACTION_TIMEOUT_MS });
      }
      appliedCount += joined.length;
    }

    console.log(`Applied projection values to ${appliedCount} player-source row(s).`);
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
    projectionSourceId,
  };
}

export function buildDraftPlayerValueData(
  row: JoinedProjectionRow,
  value: {
    replacementPoints: number | null;
    vor: number | null;
    projectionAuctionValue: number | null;
  },
  marketValue: ProjectionMarketValueOutput,
) {
  return {
    projectedPoints: row.projectedPoints,
    replacementPoints: value.replacementPoints,
    vor: value.vor,
    projectionAuctionValue: value.projectionAuctionValue,
    fallbackAuctionValue: row.fallbackAuctionValue,
    activeAuctionValue: marketValue.activeAuctionValue,
    valueSource: marketValue.valueSource,
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
