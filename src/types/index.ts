export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'PICK' | 'PKG';

export type FuturePickAuctionMode = 'packages' | 'individual' | 'none';
export type FuturePickAssetKind = 'package' | 'pick';

export interface FuturePickMetadata {
  futurePickYear: number;
  futurePickRound: number | null;
  futurePickOriginHandle: string;
  futurePickAssetKind: FuturePickAssetKind;
}

export interface Player {
  player: string;
  team: string;
  pos: Position;
  age: number | null;
  sfRank: number;
  budget: number;
  ceiling: number;
  floor: number;
  notes: string;
  sleeperId?: string | null;
  baseBudget?: number;
  baseCeiling?: number;
  baseFloor?: number;
  projectionAuctionValue?: number | null;
  projectedPoints?: number | null;
  replacementPoints?: number | null;
  vor?: number | null;
  futurePickYear?: number | null;
  futurePickRound?: number | null;
  futurePickOriginHandle?: string | null;
  futurePickAssetKind?: FuturePickAssetKind | null;
  dynamicPickValue?: {
    baseline: number;
    adjusted: number;
    adjustment: number;
    direction: 'up' | 'down' | 'flat';
  };
  valueSource?: string;
}

export interface TeamStats {
  id: number;
  handle: string;
  displayName: string | null;
  budget: number;
  spent: number;
  remaining: number;
  rosterCount: number;
  rosterRemaining: number;
  buyingPower: number;
  pkgCount: number;
  avgAge: number | null;
}

export interface AuctionResultEntry {
  id: number;
  player: string;
  position: string;
  nflTeam: string;
  price: number;
  sfRank: number | null;
  teamId: number;
  teamHandle: string;
  createdAt: Date;
}

export interface RosterEntry {
  id: number;
  player: string;
  position: string;
  nflTeam: string;
  price: number;
  sfRank: number | null;
  teamId: number;
  teamHandle: string;
  delta: number | null;
}

export interface TeamWithRoster extends TeamStats {
  results: RosterEntry[];
}

export interface ClaimedBid {
  id: number;
  player: string;
  position: string;
  price: number;
  teamId: number;
  teamHandle: string;
}

export interface LeagueTeam {
  id: number;
  handle: string;
  displayName: string | null;
}

export type StartingSlot = 'QB' | 'RB' | 'WR' | 'TE' | 'FLEX' | 'SUPER_FLEX';

// Must be `type` (not `interface`) — Prisma's InputJsonValue requires an implicit
// string index signature, which TypeScript only infers on type aliases, not interfaces.
export type ScoringSettings = {
  // Passing
  passYdsPerPoint: number; // yards per point, e.g. 25 = 1pt per 25 passing yards
  passTD: number; // passing TD points
  passInt: number; // points per interception (stored negative)

  // Rushing — position-agnostic; mobile QBs benefit proportionally
  rushAtt: number; // bonus per rush attempt
  rushFD: number; // bonus per rushing first down

  // Receiving — effective PPR per position
  pprRB: number; // points per RB reception
  pprWR: number; // points per WR reception
  pprTE: number; // points per TE reception

  // Receiving first down bonuses — base applies to all, position adds on top
  recFD: number; // base per receiving first down, all positions
  rbFDBonus: number; // extra per RB receiving first down
  wrFDBonus: number; // extra per WR receiving first down
  teFDBonus: number; // extra per TE receiving first down
};

export const DEFAULT_STARTING_LINEUP: StartingSlot[] = [
  'QB',
  'RB',
  'RB',
  'WR',
  'WR',
  'TE',
  'FLEX',
  'FLEX',
  'FLEX',
  'SUPER_FLEX',
];

export const DEFAULT_SCORING_SETTINGS: ScoringSettings = {
  passYdsPerPoint: 25,
  passTD: 4,
  passInt: -2,
  rushAtt: 0,
  rushFD: 0,
  pprRB: 1,
  pprWR: 1,
  pprTE: 1,
  recFD: 0,
  rbFDBonus: 0,
  wrFDBonus: 0,
  teFDBonus: 0,
};

export const DEFAULT_TARGET_ROSTER: Partial<Record<Position, number>> = {
  QB: 4,
  RB: 9,
  WR: 11,
  TE: 3,
};
