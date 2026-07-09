import { computeTendencies, type TendencyTeamInput } from '@/lib/tendencies';
import type { Player } from '@/types';

const players: Pick<Player, 'player' | 'budget'>[] = [
  { player: 'QB1', budget: 100 },
  { player: 'QB2', budget: 100 },
  { player: 'RB1', budget: 100 },
  { player: 'RB2', budget: 100 },
  { player: 'RB3', budget: 100 },
  { player: 'WR1', budget: 100 },
  { player: 'TE1', budget: 100 },
];

const buy = (player: string, position: string, price: number) => ({ player, position, price });

const team = (over: Partial<TendencyTeamInput> = {}): TendencyTeamInput => ({
  id: 1,
  handle: 'rival_a',
  displayName: 'Rival A',
  results: [],
  ...over,
});

describe('computeTendencies — per-position appetite', () => {
  it('marks a position no-read below the sample threshold', () => {
    const [t] = computeTendencies([team({ results: [buy('QB1', 'QB', 200)] })], players);
    expect(t.positions.QB.buys).toBe(1);
    expect(t.positions.QB.appetite).toBe('no-read');
  });

  it('flags overpays when over% clears the threshold with enough buys', () => {
    const [t] = computeTendencies(
      [team({ results: [buy('WR1', 'WR', 130), buy('WR2', 'WR', 130)] })],
      [...players, { player: 'WR2', budget: 100 }],
    );
    expect(t.positions.WR.buys).toBe(2);
    expect(t.positions.WR.overPct).toBeCloseTo(0.3);
    expect(t.positions.WR.appetite).toBe('overpays');
  });

  it('flags thrifty for consistent bargains', () => {
    const [t] = computeTendencies(
      [team({ results: [buy('RB1', 'RB', 70), buy('RB2', 'RB', 70)] })],
      players,
    );
    expect(t.positions.RB.appetite).toBe('thrifty');
  });

  it('is neutral inside the band', () => {
    const [t] = computeTendencies(
      [team({ results: [buy('RB1', 'RB', 100), buy('RB2', 'RB', 100)] })],
      players,
    );
    expect(t.positions.RB.appetite).toBe('neutral');
  });
});

describe('computeTendencies — baselines and activity', () => {
  it('counts off-list buys toward spend but not toward delta/appetite', () => {
    const [t] = computeTendencies(
      [team({ results: [buy('QB1', 'QB', 100), buy('Nobody', 'QB', 500)] })],
      players,
    );
    expect(t.positions.QB.buys).toBe(2);
    expect(t.positions.QB.spend).toBe(600);
    expect(t.positions.QB.valueSum).toBe(100); // only QB1 matched
    expect(t.positions.QB.deltaSum).toBe(0); // 100 - 100
    expect(t.totalSpend).toBe(600);
    expect(t.topBuy).toBe(500);
  });

  it('requires matched valued buys to classify positional appetite', () => {
    const [t] = computeTendencies(
      [team({ results: [buy('QB1', 'QB', 130), buy('Unmatched QB', 'QB', 20)] })],
      players,
    );
    expect(t.positions.QB.buys).toBe(2);
    expect(t.positions.QB.valueSum).toBe(100);
    expect(t.positions.QB.overPct).toBeCloseTo(0.3);
    expect(t.positions.QB.appetite).toBe('no-read');
  });

  it('excludes PICK/PKG from per-position appetite but counts activity', () => {
    const [t] = computeTendencies(
      [team({ results: [buy('Matt Gay', 'PKG', 112), buy('QB1', 'QB', 100)] })],
      players,
    );
    expect(t.buys).toBe(2);
    expect(t.totalSpend).toBe(212);
    // PKG has no appetite bucket; only QB tracked
    expect(t.positions.QB.buys).toBe(1);
  });
});

describe('computeTendencies — lean and aggression', () => {
  it('names a lean when one position dominates spend past the threshold', () => {
    const [t] = computeTendencies(
      [
        team({
          results: [buy('WR1', 'WR', 400), buy('RB1', 'RB', 60), buy('TE1', 'TE', 40)],
        }),
      ],
      players,
    );
    expect(t.lean).toBe('WR');
  });

  it('stays balanced when spend is spread out', () => {
    const [t] = computeTendencies(
      [
        team({
          results: [buy('WR1', 'WR', 100), buy('RB1', 'RB', 100), buy('QB1', 'QB', 100)],
        }),
      ],
      players,
    );
    expect(t.lean).toBe('balanced');
  });

  it('calls a habitual overpayer aggressive once past the buy gate', () => {
    const [t] = computeTendencies(
      [
        team({
          results: [buy('QB1', 'QB', 120), buy('RB1', 'RB', 120), buy('WR1', 'WR', 120)],
        }),
      ],
      players,
    );
    expect(t.overallOverPct).toBeCloseTo(0.2);
    expect(t.aggression).toBe('aggressive');
  });

  it('does not read aggression from pick/package activity — only value-matched buys count', () => {
    // One matched QB overpaid hard, padded with two pick packages. totalBuys clears the
    // gate but only 1 buy carries value, so the overall read must stay untrusted.
    const [t] = computeTendencies(
      [
        team({
          results: [
            buy('QB1', 'QB', 200),
            buy('Matt Gay', 'PKG', 112),
            buy('2028 Pick', 'PKG', 70),
          ],
        }),
      ],
      players,
    );
    expect(t.buys).toBe(3);
    expect(t.overallOverPct).toBeNull();
    expect(t.aggression).toBe('neutral');
  });

  it('withholds the overall over% read until enough matched buys back it', () => {
    // Two matched overpays: real signal, but below MIN_BUYS_FOR_AGGRESSION.
    const [t] = computeTendencies(
      [team({ results: [buy('QB1', 'QB', 150), buy('RB1', 'RB', 150)] })],
      players,
    );
    expect(t.overallOverPct).toBeNull();
    expect(t.aggression).toBe('neutral');
  });

  it('cold start: empty results → balanced/neutral/no-read', () => {
    const [t] = computeTendencies([team({ results: [] })], players);
    expect(t.lean).toBe('balanced');
    expect(t.aggression).toBe('neutral');
    expect(t.positions.WR.appetite).toBe('no-read');
    expect(t.overallOverPct).toBeNull();
    expect(t.topBuy).toBe(0);
  });
});
