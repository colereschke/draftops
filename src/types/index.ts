export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'PICK' | 'PKG';

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
