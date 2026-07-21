import type { Player, ClaimedBid, LeagueTeam, TeamStats, TeamWithRoster } from '@/types';
import { DEFAULT_SCORING_SETTINGS } from '@/types';
import type { ManagerTendency, Appetite, AppetitePos } from '@/lib/tendencies';

export const FIXTURE_PLAYERS: Player[] = [
  {
    id: 10,
    player: 'Josh Allen',
    team: 'BUF',
    pos: 'QB',
    age: 28,
    sfRank: 1,
    budget: 120,
    ceiling: 138,
    floor: 104,
    notes: '',
  },
];

export const FIXTURE_TEAMS: LeagueTeam[] = [{ id: 1, handle: 'coreschke', displayName: 'Cole' }];

function fixturePositionTendency(position: AppetitePos, appetite: Appetite) {
  return {
    position,
    buys: 3,
    spend: 0,
    valueSum: 0,
    deltaSum: 0,
    avgDelta: null,
    overPct: null,
    spendShare: 0,
    appetite,
  };
}

function fixtureManagerTendency(teamId: number, handle: string): ManagerTendency {
  return {
    teamId,
    handle,
    displayName: handle,
    buys: 5,
    totalSpend: 500,
    totalValue: 480,
    overallOverPct: 0.04,
    topBuy: 120,
    lean: 'balanced',
    aggression: 'neutral',
    positions: {
      QB: fixturePositionTendency('QB', 'neutral'),
      RB: fixturePositionTendency('RB', 'neutral'),
      WR: fixturePositionTendency('WR', 'neutral'),
      TE: fixturePositionTendency('TE', 'neutral'),
    },
  };
}

export function auctionSheetProps() {
  return {
    players: FIXTURE_PLAYERS,
    claimedBids: [] as ClaimedBid[],
    teams: FIXTURE_TEAMS,
    nominatedPlayers: [] as string[],
    draftId: 1,
    ownerHandle: 'coreschke',
    ownerBudget: 1000,
    scoringSettings: { ...DEFAULT_SCORING_SETTINGS },
  };
}

export function budgetPressureViewProps() {
  const teams: TeamStats[] = [
    {
      id: 1,
      handle: 'coreschke',
      displayName: 'coreschke',
      budget: 1000,
      spent: 0,
      remaining: 680,
      rosterCount: 5,
      rosterRemaining: 20,
      buyingPower: 660,
      pkgCount: 0,
      avgAge: null,
    },
  ];
  return {
    teams,
    tendencies: [fixtureManagerTendency(1, 'coreschke')],
    livePosition: null,
    liveName: null,
    ownerHandle: 'coreschke',
  };
}

export function rosterTrackerProps() {
  const team: TeamWithRoster = {
    id: 1,
    handle: 'coreschke',
    displayName: 'Cole',
    budget: 1000,
    spent: 110,
    remaining: 890,
    rosterCount: 1,
    rosterRemaining: 29,
    buyingPower: 860,
    pkgCount: 0,
    avgAge: null,
    results: [
      {
        id: 1,
        playerId: 10,
        player: 'Josh Allen',
        position: 'QB',
        nflTeam: 'BUF',
        price: 110,
        sfRank: 1,
        teamId: 1,
        teamHandle: 'coreschke',
        delta: -10,
      },
    ],
  };
  return {
    teams: [team],
    tendencies: [fixtureManagerTendency(1, 'coreschke')],
    ownerHandle: 'coreschke',
  };
}

export function nominationHelperProps() {
  return { draftId: 1, players: FIXTURE_PLAYERS };
}
