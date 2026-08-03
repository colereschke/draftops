/**
 * @jest-environment node
 */
import { computeFutureCapitalByHandle } from '@/lib/pickCapital';
import type { ResolvedPick } from '@/lib/pickOwnership';

const TEAM_HANDLES = new Map([
  [3, 'origin-team'],
  [6, 'acquirer-team'],
  [9, 'trade-partner'],
]);

const BASELINES = {
  packageBaselineByOrigin: new Map([[3, 109]]),
  roundBaselineByOriginRound: new Map([
    ['3:1', 75],
    ['3:2', 15],
    ['3:3', 5],
  ]),
};

function intactPackagePicks(holderTeamId: number, eventId: number): ResolvedPick[] {
  return [1, 2, 3].map((round) => ({
    originTeamId: 3,
    futurePickYear: 2027,
    futurePickRound: round as 1 | 2 | 3,
    holderTeamId,
    eventKind: 'auction' as const,
    eventId,
  }));
}

describe('computeFutureCapitalByHandle', () => {
  it('values an intact, unsplit package at the package baseline, not the round sum', () => {
    const result = computeFutureCapitalByHandle({
      resolvedPicks: intactPackagePicks(6, 501),
      teamHandleById: TEAM_HANDLES,
      baselines: BASELINES,
      fallbackScale: 1,
    });
    expect(result.get('acquirer-team')).toBe(109); // not 75+15+5=95
  });

  it('removes divested capital from the origin and adds it to the acquirer after a split', () => {
    const picks: ResolvedPick[] = [
      {
        originTeamId: 3,
        futurePickYear: 2027,
        futurePickRound: 1,
        holderTeamId: 9,
        eventKind: 'trade',
        eventId: 42,
      },
      {
        originTeamId: 3,
        futurePickYear: 2027,
        futurePickRound: 2,
        holderTeamId: 6,
        eventKind: 'auction',
        eventId: 501,
      },
      {
        originTeamId: 3,
        futurePickYear: 2027,
        futurePickRound: 3,
        holderTeamId: 6,
        eventKind: 'auction',
        eventId: 501,
      },
    ];
    const result = computeFutureCapitalByHandle({
      resolvedPicks: picks,
      teamHandleById: TEAM_HANDLES,
      baselines: BASELINES,
      fallbackScale: 1,
    });
    expect(result.get('trade-partner')).toBe(75); // round 1 alone
    expect(result.get('acquirer-team')).toBe(15 + 5); // rounds 2+3, not the 109 package baseline
    expect(result.get('origin-team')).toBeUndefined(); // origin holds nothing after full divestiture
  });

  it('falls back to the scaled constant baseline when no generated-year data exists for an origin', () => {
    const result = computeFutureCapitalByHandle({
      resolvedPicks: intactPackagePicks(6, 501),
      teamHandleById: TEAM_HANDLES,
      baselines: { packageBaselineByOrigin: new Map(), roundBaselineByOriginRound: new Map() },
      fallbackScale: 2,
    });
    expect(result.get('acquirer-team')).toBe(109 * 2);
  });
});
