export interface FixturePlayer {
  name: string;
  nflTeam: string;
  pos: 'QB' | 'RB' | 'WR' | 'TE';
  age: number;
  sfRank: number;
  budget: number;
  ceiling: number;
  floor: number;
}

export const NOMINATE_TARGET: FixturePlayer = {
  name: 'Fixture RB Nominate Target',
  nflTeam: 'DAL',
  pos: 'RB',
  age: 25,
  sfRank: 4,
  budget: 100,
  ceiling: 115,
  floor: 87,
};

export const BID_TARGET: FixturePlayer = {
  name: 'Fixture WR Bid Target',
  nflTeam: 'MIA',
  pos: 'WR',
  age: 24,
  sfRank: 6,
  budget: 110,
  ceiling: 127,
  floor: 96,
};

// Seeded (via e2e/seed.ts) with a real logged AuctionResult before any spec runs, so
// nomination scoring's `hasAuctionData` is true from the start — the nomination table
// only renders per-row "Nominate" buttons once at least one bid exists. Without this,
// nominate.spec.ts would only pass by accident of running after bid.spec.ts logs its own
// bid, which is an unstated, order-dependent coupling between two specs meant to be
// independent.
export const BASELINE_BID_TARGET: FixturePlayer = {
  name: 'Fixture TE One',
  nflTeam: 'KC',
  pos: 'TE',
  age: 28,
  sfRank: 9,
  budget: 70,
  ceiling: 81,
  floor: 61,
};

export const FIXTURE_PLAYERS: FixturePlayer[] = [
  {
    name: 'Fixture QB One',
    nflTeam: 'KC',
    pos: 'QB',
    age: 27,
    sfRank: 1,
    budget: 180,
    ceiling: 207,
    floor: 157,
  },
  {
    name: 'Fixture QB Two',
    nflTeam: 'BUF',
    pos: 'QB',
    age: 29,
    sfRank: 2,
    budget: 150,
    ceiling: 173,
    floor: 131,
  },
  {
    name: 'Fixture RB One',
    nflTeam: 'SF',
    pos: 'RB',
    age: 24,
    sfRank: 3,
    budget: 120,
    ceiling: 138,
    floor: 104,
  },
  NOMINATE_TARGET,
  {
    name: 'Fixture RB Three',
    nflTeam: 'MIN',
    pos: 'RB',
    age: 26,
    sfRank: 5,
    budget: 90,
    ceiling: 104,
    floor: 78,
  },
  BID_TARGET,
  {
    name: 'Fixture WR Two',
    nflTeam: 'CIN',
    pos: 'WR',
    age: 26,
    sfRank: 7,
    budget: 95,
    ceiling: 109,
    floor: 83,
  },
  {
    name: 'Fixture WR Three',
    nflTeam: 'DET',
    pos: 'WR',
    age: 28,
    sfRank: 8,
    budget: 80,
    ceiling: 92,
    floor: 70,
  },
  BASELINE_BID_TARGET,
  {
    name: 'Fixture TE Two',
    nflTeam: 'SF',
    pos: 'TE',
    age: 25,
    sfRank: 10,
    budget: 55,
    ceiling: 63,
    floor: 48,
  },
  {
    name: 'Fixture WR Four',
    nflTeam: 'PHI',
    pos: 'WR',
    age: 23,
    sfRank: 11,
    budget: 60,
    ceiling: 69,
    floor: 52,
  },
  {
    name: 'Fixture RB Four',
    nflTeam: 'BAL',
    pos: 'RB',
    age: 27,
    sfRank: 12,
    budget: 50,
    ceiling: 58,
    floor: 44,
  },
];
