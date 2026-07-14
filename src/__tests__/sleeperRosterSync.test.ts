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
});
