import type { Position } from '@/types';

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

export interface DraftPlayerValueData {
  projectedPoints: number;
  replacementPoints: number | null;
  vor: number | null;
  projectionAuctionValue: number | null;
  fallbackAuctionValue: number;
  activeAuctionValue: number;
  valueSource: string;
}

export interface DraftPlayerValueWrite extends DraftPlayerValueData {
  draftId: number;
  playerId: number;
  projectionSourceId: number;
  valueSetId: number;
}

export interface StoredProjectionRow {
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

export interface ProjectionPreparationDraft {
  id: number;
  teamCount: number;
  rosterSize: number;
  budget: number;
  startingLineup: unknown;
  scoringSettings: unknown;
  targetRoster: unknown;
}

export interface ProjectionPreparationInput {
  draft: ProjectionPreparationDraft;
  projectionSourceId: number;
  players: PlayerJoinRow[];
  projections: StoredProjectionRow[];
}

export type ProjectionCandidate = Omit<DraftPlayerValueWrite, 'valueSetId'>;

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
    }): Promise<ProjectionPreparationDraft | null>;
    update(args: {
      where: { id: number };
      data: { activeProjectionValueSetId: number };
    }): Promise<unknown>;
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
    update(args: { where: { id: number }; data: { sleeperId: string } }): Promise<unknown>;
  };
  playerProjection: {
    findMany(args: { where: { projectionSourceId: number } }): Promise<StoredProjectionRow[]>;
  };
  draftProjectionValueSet: {
    create(args: {
      data: {
        draftId: number;
        projectionSourceId: number;
        status: 'STAGING';
        expectedPlayerCount: number;
      };
      select: { id: true };
    }): Promise<{ id: number }>;
    findUnique: (...args: never[]) => Promise<unknown>;
    findMany: (...args: never[]) => Promise<unknown>;
    updateMany: (...args: never[]) => Promise<unknown>;
  };
  draftPlayerValue: {
    createMany(args: { data: DraftPlayerValueWrite[] }): Promise<{ count: number }>;
    deleteMany: (...args: never[]) => Promise<unknown>;
    count: (...args: never[]) => Promise<number>;
  };
  $transaction?<T>(
    operation: (tx: ProjectionApplyPrisma) => Promise<T>,
    options?: { timeout: number },
  ): Promise<T>;
}

export interface ApplyProjectionValuesOptions {
  draftId: number;
  projectionSourceId?: number;
  etrMatches?: Map<string, string>;
  mode?: 'staged' | 'transaction';
}

export interface ApplyProjectionValuesResult {
  valueSetId: number;
  projectionSourceId: number;
  appliedCount: number;
  activatedAt: Date;
}

export type TargetRoster = Partial<Record<Position, number>>;
