import {
  createClaimMap,
  getAuctionMetrics,
  selectAuctionPlayers,
} from '@/components/AuctionSheet/auctionSelectors';
import type { ClaimedBid, LeagueTeam, Player } from '@/types';

function makePlayer(overrides: Partial<Player>): Player {
  return {
    id: 1,
    player: 'Player',
    team: 'FA',
    pos: 'QB',
    age: 26,
    sfRank: 1,
    budget: 100,
    ceiling: 115,
    floor: 87,
    notes: '',
    ...overrides,
  };
}

function selectPlayers(
  players: Player[],
  claimedBids: ClaimedBid[],
  sortBy: 'spread' | 'claimedPrice' | 'age',
  sortDir: 'asc' | 'desc',
) {
  return selectAuctionPlayers({
    players,
    claimMap: createClaimMap(claimedBids),
    posFilter: 'ALL',
    strategyFilter: 'ALL',
    hasStrategyTags: false,
    search: '',
    availableOnly: false,
    sortBy,
    sortDir,
  });
}

describe('auction selectors', () => {
  it('keeps null spread and claimed prices after valued rows in both directions', () => {
    const spreadPlayers: Player[] = [
      makePlayer({ id: 1, player: 'Low Spread', sfRank: 1, spread: -20 }),
      makePlayer({ id: 2, player: 'High Spread', sfRank: 2, spread: 40 }),
      makePlayer({ id: 3, player: 'No Spread', sfRank: 3, spread: null }),
    ];
    const claimedPricePlayers: Player[] = [
      makePlayer({ id: 4, player: 'Low Price', sfRank: 4, budget: 80 }),
      makePlayer({ id: 5, player: 'High Price', sfRank: 5, budget: 140 }),
      makePlayer({ id: 6, player: 'Unclaimed', sfRank: 6, budget: 110 }),
    ];
    const claimedBids: ClaimedBid[] = [
      {
        id: 1,
        playerId: 4,
        player: 'Low Price',
        position: 'QB',
        price: 80,
        teamId: 1,
        teamHandle: 'cole',
      },
      {
        id: 2,
        playerId: 5,
        player: 'High Price',
        position: 'QB',
        price: 140,
        teamId: 1,
        teamHandle: 'cole',
      },
    ];

    expect(
      selectPlayers(spreadPlayers, [], 'spread', 'asc').map((player) => player.player),
    ).toEqual(['Low Spread', 'High Spread', 'No Spread']);
    expect(
      selectPlayers(spreadPlayers, [], 'spread', 'desc').map((player) => player.player),
    ).toEqual(['High Spread', 'Low Spread', 'No Spread']);
    expect(
      selectPlayers(claimedPricePlayers, claimedBids, 'claimedPrice', 'asc').map(
        (player) => player.player,
      ),
    ).toEqual(['Low Price', 'High Price', 'Unclaimed']);
    expect(
      selectPlayers(claimedPricePlayers, claimedBids, 'claimedPrice', 'desc').map(
        (player) => player.player,
      ),
    ).toEqual(['High Price', 'Low Price', 'Unclaimed']);
  });

  it('retains the generic null sort sentinel of 9999', () => {
    const players: Player[] = [
      makePlayer({ id: 1, player: 'Known Age', age: 26, sfRank: 1 }),
      makePlayer({ id: 2, player: 'No Age', age: null, sfRank: 2 }),
    ];

    expect(selectPlayers(players, [], 'age', 'desc').map((player) => player.player)).toEqual([
      'No Age',
      'Known Age',
    ]);
  });

  it('excludes claimed position players from market totals and pick assets from player count', () => {
    const players: Player[] = [
      makePlayer({ id: 1, player: 'Claimed QB', pos: 'QB', budget: 120 }),
      makePlayer({ id: 2, player: 'Claimed RB', pos: 'RB', budget: 90 }),
      makePlayer({ id: 3, player: 'Claimed WR', pos: 'WR', budget: 80 }),
      makePlayer({ id: 4, player: 'Claimed TE', pos: 'TE', budget: 70 }),
      makePlayer({ id: 5, player: 'Open QB', pos: 'QB', budget: 60 }),
      makePlayer({ id: 6, player: 'Future Package', pos: 'PKG', budget: 50, futurePickYear: 2028 }),
      makePlayer({ id: 7, player: 'Future Pick', pos: 'PICK', budget: 40 }),
    ];
    const claimedBids: ClaimedBid[] = [
      {
        id: 1,
        playerId: 1,
        player: 'Claimed QB',
        position: 'QB',
        price: 110,
        teamId: 1,
        teamHandle: 'cole',
      },
      {
        id: 2,
        playerId: 2,
        player: 'Claimed RB',
        position: 'RB',
        price: 85,
        teamId: 2,
        teamHandle: 'other',
      },
      {
        id: 3,
        playerId: 3,
        player: 'Claimed WR',
        position: 'WR',
        price: 75,
        teamId: 2,
        teamHandle: 'other',
      },
      {
        id: 4,
        playerId: 4,
        player: 'Claimed TE',
        position: 'TE',
        price: 65,
        teamId: 2,
        teamHandle: 'other',
      },
    ];
    const teams: LeagueTeam[] = [
      { id: 1, handle: 'cole', displayName: 'Cole' },
      { id: 2, handle: 'other', displayName: 'Other' },
    ];

    expect(getAuctionMetrics(players, createClaimMap(claimedBids), teams, 'cole')).toMatchObject({
      mySpent: 110,
      posStats: {
        QB: { count: 1, total: 60 },
        RB: { count: 0, total: 0 },
        WR: { count: 0, total: 0 },
        TE: { count: 0, total: 0 },
      },
      grandTotal: 60,
      totalPlayerCount: 5,
      futurePickYear: 2028,
    });
  });
});
