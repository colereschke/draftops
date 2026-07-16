import { reconcileSleeperRosters } from '@/lib/sleeperRosterSync';

describe('reconcileSleeperRosters', () => {
  const input = {
    rosters: [{ roster_id: 9, owner_id: 'u1', players: ['known', 'missing'] }],
    teams: [{ id: 7, sleeperRosterId: 9, handle: 'cole', displayName: 'Cole' }],
    players: [
      {
        id: 3,
        sleeperId: 'known',
        name: 'A Player',
        pos: 'WR',
        nflTeam: 'ATL',
        budget: 42,
      },
    ],
    loggedPlayerIds: new Set<number>(),
  };

  it('returns known, unlogged roster players as actionable and missing players as unresolved', () => {
    const preview = reconcileSleeperRosters(input);

    expect(preview.actionable).toEqual([
      expect.objectContaining({
        playerId: 3,
        sleeperId: 'known',
        teamId: 7,
        sleeperRosterId: 9,
      }),
    ]);
    expect(preview.unresolved).toEqual([{ sleeperId: 'missing', sleeperRosterId: 9 }]);
    expect(preview.diagnostics).toEqual({
      alreadyLoggedCount: 0,
      unmappedRosterIds: [],
      duplicateMappedRosterIds: [],
    });
  });

  it('excludes players that have already been logged', () => {
    const preview = reconcileSleeperRosters({ ...input, loggedPlayerIds: new Set([3]) });

    expect(preview.actionable).toEqual([]);
    expect(preview.unresolved).toEqual([{ sleeperId: 'missing', sleeperRosterId: 9 }]);
    expect(preview.diagnostics.alreadyLoggedCount).toBe(1);
  });

  it('accepts rosters whose players field is null', () => {
    const preview = reconcileSleeperRosters({
      ...input,
      rosters: [{ roster_id: 9, owner_id: 'u1', players: null }],
    });

    expect(preview.actionable).toEqual([]);
    expect(preview.unresolved).toEqual([]);
  });

  it('reports unmapped rosters without creating actions for their players', () => {
    const preview = reconcileSleeperRosters({
      ...input,
      rosters: [{ roster_id: 8, owner_id: 'u1', players: ['known'] }],
    });

    expect(preview.actionable).toEqual([]);
    expect(preview.unresolved).toEqual([]);
    expect(preview.diagnostics.unmappedRosterIds).toEqual([8]);
  });

  it('reports duplicate team mappings without creating actions for that roster', () => {
    const preview = reconcileSleeperRosters({
      ...input,
      teams: [
        { id: 7, sleeperRosterId: 9, handle: 'cole', displayName: 'Cole' },
        { id: 8, sleeperRosterId: 9, handle: 'rival', displayName: 'Rival' },
      ],
    });

    expect(preview.actionable).toEqual([]);
    expect(preview.unresolved).toEqual([]);
    expect(preview.diagnostics.duplicateMappedRosterIds).toEqual([9]);
  });

  it('leaves roster players unresolved when no stored player has a Sleeper ID', () => {
    const preview = reconcileSleeperRosters({
      ...input,
      rosters: [{ roster_id: 9, owner_id: 'u1', players: ['unlinked'] }],
      players: [
        {
          id: 4,
          sleeperId: null,
          name: 'Unlinked Player',
          pos: 'RB',
          nflTeam: 'NYJ',
          budget: 30,
        },
      ],
    });

    expect(preview.actionable).toEqual([]);
    expect(preview.unresolved).toEqual([{ sleeperId: 'unlinked', sleeperRosterId: 9 }]);
  });

  it('sorts actionable rows by team, then by target price descending within a team', () => {
    const preview = reconcileSleeperRosters({
      ...input,
      rosters: [
        { roster_id: 9, owner_id: 'u1', players: ['cheap', 'known'] },
        { roster_id: 20, owner_id: 'u2', players: ['rival-pick'] },
      ],
      teams: [
        { id: 7, sleeperRosterId: 9, handle: 'cole', displayName: 'Cole' },
        { id: 8, sleeperRosterId: 20, handle: 'rival', displayName: 'Rival' },
      ],
      players: [
        { id: 3, sleeperId: 'known', name: 'A Player', pos: 'WR', nflTeam: 'ATL', budget: 42 },
        { id: 4, sleeperId: 'cheap', name: 'B Player', pos: 'RB', nflTeam: 'ATL', budget: 10 },
        {
          id: 5,
          sleeperId: 'rival-pick',
          name: 'C Player',
          pos: 'TE',
          nflTeam: 'DAL',
          budget: 15,
        },
      ],
    });

    expect(preview.actionable.map((row) => row.playerId)).toEqual([3, 4, 5]);
  });

  it('leaves roster players unresolved when multiple stored players share a Sleeper ID', () => {
    const preview = reconcileSleeperRosters({
      ...input,
      rosters: [{ roster_id: 9, owner_id: 'u1', players: ['known'] }],
      players: [
        {
          id: 3,
          sleeperId: 'known',
          name: 'First Player',
          pos: 'WR',
          nflTeam: 'ATL',
          budget: 42,
        },
        {
          id: 4,
          sleeperId: 'known',
          name: 'Second Player',
          pos: 'WR',
          nflTeam: 'ATL',
          budget: 41,
        },
      ],
    });

    expect(preview.actionable).toEqual([]);
    expect(preview.unresolved).toEqual([{ sleeperId: 'known', sleeperRosterId: 9 }]);
  });
});
