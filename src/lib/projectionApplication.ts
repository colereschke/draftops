import {
  DEFAULT_SCORING_SETTINGS,
  DEFAULT_STARTING_LINEUP,
  DEFAULT_TARGET_ROSTER,
  type Position,
  type ScoringSettings,
  type StartingSlot,
} from '@/types';
import {
  calculateProjectionMarketValues,
  type ProjectionMarketValueOutput,
} from '@/lib/projectionMarketValue';
import { calculateProjectedPoints, type ProjectionStats } from '@/lib/projectionScoring';
import { calculateProjectionValues, type ProjectionValueInput } from '@/lib/projectionVor';

export type VorPosition = 'QB' | 'RB' | 'WR' | 'TE';

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

export interface DraftPlayerValueDeleteWhere {
  draftId: number;
  projectionSourceId: number;
  playerId?: { notIn: number[] };
}

interface DraftPlayerValueData {
  projectedPoints: number;
  replacementPoints: number | null;
  vor: number | null;
  projectionAuctionValue: number | null;
  fallbackAuctionValue: number;
  activeAuctionValue: number;
  valueSource: string;
}

interface DraftPlayerValueWrite extends DraftPlayerValueData {
  draftId: number;
  playerId: number;
  projectionSourceId: number;
}

interface StoredProjectionRow {
  sleeperId: string;
  position: string;
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
  isRookie: boolean;
}

export interface ProjectionApplyPrisma {
  draft: {
    findUnique(args: {
      where: { id: number };
      select: {
        id: true;
        teamCount: true;
        rosterSize: true;
        budget: true;
        startingLineup: true;
        scoringSettings: true;
        targetRoster: true;
      };
    }): Promise<{
      id: number;
      teamCount: number;
      rosterSize: number;
      budget: number;
      startingLineup: unknown;
      scoringSettings: unknown;
      targetRoster: unknown;
    } | null>;
  };
  projectionSource: {
    findFirst(args: {
      orderBy: Array<{ projectionDate?: 'desc' } | { updatedAt?: 'desc' } | { id?: 'desc' }>;
    }): Promise<{ id: number } | null>;
  };
  player: {
    findMany(args: {
      where: { draftId: number };
      select: { id: true; name: true; pos: true; sleeperId: true; budget: true };
    }): Promise<PlayerJoinRow[]>;
    update(args: { where: { id: number }; data: { sleeperId: string } }): unknown;
  };
  playerProjection: {
    findMany(args: { where: { projectionSourceId: number } }): Promise<StoredProjectionRow[]>;
  };
  draftPlayerValue: {
    deleteMany(args: { where: DraftPlayerValueDeleteWhere }): unknown;
    upsert(args: {
      where: {
        draftId_playerId_projectionSourceId: {
          draftId: number;
          playerId: number;
          projectionSourceId: number;
        };
      };
      create: DraftPlayerValueWrite;
      update: DraftPlayerValueData;
    }): unknown;
  };
  $transaction(operations: unknown[], options?: { timeout: number }): Promise<unknown[]>;
}

export interface ApplyProjectionValuesOptions {
  draftId: number;
  projectionSourceId?: number;
  etrMatches?: Map<string, string>;
}

export interface ApplyProjectionValuesResult {
  projectionSourceId: number;
  appliedCount: number;
}

const WRITE_BATCH_SIZE = 50;
const WRITE_TRANSACTION_TIMEOUT_MS = 60_000;

export async function applyProjectionValuesToDraft(
  prisma: ProjectionApplyPrisma,
  options: ApplyProjectionValuesOptions,
): Promise<ApplyProjectionValuesResult> {
  const draft = await prisma.draft.findUnique({
    where: { id: options.draftId },
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
  if (!draft) throw new Error(`Draft ${options.draftId} not found`);

  const projectionSourceId =
    options.projectionSourceId ?? (await getLatestProjectionSourceId(prisma));
  if (projectionSourceId === null) throw new Error('No projection source found');

  const scoringSettings = toScoringSettings(draft.scoringSettings);
  const players = await prisma.player.findMany({
    where: { draftId: draft.id },
    select: { id: true, name: true, pos: true, sleeperId: true, budget: true },
  });
  const playersWithSleeperIds = resolvePlayerSleeperIds(players, options.etrMatches ?? new Map());

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

  const projections = await prisma.playerProjection.findMany({
    where: { projectionSourceId },
  });
  const joined = joinPlayersToStoredProjectionRows(
    playersWithSleeperIds,
    projections,
    scoringSettings,
  );
  if (joined.length === 0) {
    throw new Error(`No projection values could be applied to draft ${draft.id}`);
  }

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
  const marketValues = calculateProjectionMarketValues({
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
  const marketValuesBySleeperId = new Map(marketValues.map((value) => [value.sleeperId, value]));

  const writes = joined.flatMap((row) => {
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
            projectionSourceId,
          },
        },
        create: {
          draftId: draft.id,
          playerId: row.playerId,
          projectionSourceId,
          ...data,
        },
        update: data,
      }),
    ];
  });

  if (writes.length === 0) {
    throw new Error(`No projection values could be applied to draft ${draft.id}`);
  }

  await prisma.draftPlayerValue.deleteMany({
    where: buildStaleDraftPlayerValueDeleteWhere(draft.id, projectionSourceId, joined),
  });

  for (const batch of chunk(writes, WRITE_BATCH_SIZE)) {
    await prisma.$transaction(batch, { timeout: WRITE_TRANSACTION_TIMEOUT_MS });
  }

  return { projectionSourceId, appliedCount: joined.length };
}

async function getLatestProjectionSourceId(prisma: ProjectionApplyPrisma): Promise<number | null> {
  const source = await prisma.projectionSource.findFirst({
    orderBy: [{ projectionDate: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
  });
  return source?.id ?? null;
}

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

function joinPlayersToStoredProjectionRows(
  players: PlayerJoinRow[],
  projections: StoredProjectionRow[],
  scoring: ScoringSettings,
): JoinedProjectionRow[] {
  const projectionRows = projections.flatMap((projection): ProjectionJoinRow[] => {
    const position = toVorPosition(projection.position);
    if (!position) return [];
    const stats = toProjectionStats({ ...projection, position });
    return [
      {
        sleeperId: projection.sleeperId,
        position,
        projectedPoints: calculateProjectedPoints(stats, scoring),
        baselineProjectedPoints: calculateProjectedPoints(stats, DEFAULT_SCORING_SETTINGS),
        isRookie: projection.isRookie,
      },
    ];
  });

  return joinPlayersToProjectionRows(players, projectionRows);
}

function toProjectionStats(row: StoredProjectionRow & { position: VorPosition }): ProjectionStats {
  return {
    sleeperId: row.sleeperId,
    position: row.position,
    games: row.games,
    passAtt: row.passAtt,
    passCmp: row.passCmp,
    passYds: row.passYds,
    passTd: row.passTd,
    passInt: row.passInt,
    passSacks: row.passSacks,
    rushAtt: row.rushAtt,
    rushYds: row.rushYds,
    rushTd: row.rushTd,
    targets: row.targets,
    receptions: row.receptions,
    recYds: row.recYds,
    recTd: row.recTd,
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
): DraftPlayerValueData {
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

export function buildStaleDraftPlayerValueDeleteWhere(
  draftId: number,
  projectionSourceId: number,
  joined: JoinedProjectionRow[],
): DraftPlayerValueDeleteWhere {
  const currentPlayerIds = joined.map((row) => row.playerId);
  if (currentPlayerIds.length === 0) {
    return { draftId, projectionSourceId };
  }
  return { draftId, projectionSourceId, playerId: { notIn: currentPlayerIds } };
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

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
