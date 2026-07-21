/** @jest-environment node */

import { toBidSnapshot } from '@/lib/bidAudit';

describe('toBidSnapshot', () => {
  it('preserves the complete mutable bid state for audit reconstruction', () => {
    expect(
      toBidSnapshot({
        id: 12,
        draftId: 4,
        playerId: 10,
        player: 'Josh Allen',
        position: 'QB',
        nflTeam: 'BUF',
        price: 120,
        sfRank: 1,
        notes: null,
        teamId: 7,
        createdAt: new Date('2026-07-19T12:00:00.000Z'),
        updatedAt: new Date('2026-07-19T12:01:00.000Z'),
        deletedAt: null,
        supersededAt: null,
      }),
    ).toEqual({
      id: 12,
      draftId: 4,
      playerId: 10,
      player: 'Josh Allen',
      position: 'QB',
      nflTeam: 'BUF',
      price: 120,
      sfRank: 1,
      notes: null,
      teamId: 7,
      createdAt: '2026-07-19T12:00:00.000Z',
      updatedAt: '2026-07-19T12:01:00.000Z',
      deletedAt: null,
      supersededAt: null,
    });
  });
});
