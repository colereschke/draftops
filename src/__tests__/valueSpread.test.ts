import { computeSpreads, strategyTagReason } from '@/lib/valueSpread';
import type { Player } from '@/types';

// Minimal typed factory — only the fields computeSpreads reads matter.
function mkPlayer(overrides: Partial<Player>): Player {
  return {
    player: 'X',
    team: 'FA',
    pos: 'RB',
    age: 26,
    sfRank: 1,
    budget: 50,
    ceiling: 58,
    floor: 44,
    notes: '',
    baseBudget: 50,
    projectionAuctionValue: 50,
    vor: 10,
    ...overrides,
  };
}

// A common set of N RBs where dynasty order and projection order differ.
function rbSet(): Player[] {
  // Four RBs. Dynasty ranks by baseBudget desc; projection ranks by projectionAuctionValue desc.
  // dyn ranks: A(100)=1, B(80)=2, D(40)=3, C(20)=4
  // proj ranks: C(90)=1, D(70)=2, B(40)=3, A(10)=4
  return [
    mkPlayer({ player: 'A', age: 29, baseBudget: 100, projectionAuctionValue: 10, vor: 20 }),
    mkPlayer({ player: 'B', age: 22, baseBudget: 80, projectionAuctionValue: 40, vor: 15 }),
    mkPlayer({ player: 'D', age: 29, baseBudget: 40, projectionAuctionValue: 70, vor: 30 }),
    mkPlayer({ player: 'C', age: 22, baseBudget: 20, projectionAuctionValue: 90, vor: 40 }),
  ];
}

describe('computeSpreads', () => {
  it('computes a signed percentile rank gap (positive = underpriced)', () => {
    const out = computeSpreads(rbSet());
    const c = out.find((p) => p.player === 'C')!;
    // C: dynRank 4 (lowest dyn value), projRank 1 (highest proj). N=4.
    // spread = round((4 - 1) / 3 * 100) = 100.
    expect(c.spread).toBe(100);
    const a = out.find((p) => p.player === 'A')!;
    // A: dynRank 1, projRank 4. spread = round((1 - 4)/3*100) = -100.
    expect(a.spread).toBe(-100);
  });

  it('tags older + underpriced as WIN-NOW and older + overpriced as FADE', () => {
    const out = computeSpreads(rbSet());
    expect(out.find((p) => p.player === 'D')!.strategyTag).toBe('WIN-NOW'); // age 29, spread +
    expect(out.find((p) => p.player === 'A')!.strategyTag).toBe('FADE'); // age 29, spread -
  });

  it('tags younger + underpriced as BARGAIN and younger + overpriced as FUTURE', () => {
    const out = computeSpreads(rbSet());
    expect(out.find((p) => p.player === 'C')!.strategyTag).toBe('BARGAIN'); // age 22, spread +
    expect(out.find((p) => p.player === 'B')!.strategyTag).toBe('FUTURE'); // age 22, spread -
  });

  it('shows a spread number but no tag for prime-age players', () => {
    // Two prime RBs (age 25 sits in the RB prime band [23,25,27]); prime => no tag.
    const players = [
      mkPlayer({ player: 'P1', age: 25, baseBudget: 90, projectionAuctionValue: 10, vor: 5 }),
      mkPlayer({ player: 'P2', age: 25, baseBudget: 10, projectionAuctionValue: 90, vor: 40 }),
    ];
    const out = computeSpreads(players);
    expect(out.find((p) => p.player === 'P2')!.spread).toBe(100);
    expect(out.find((p) => p.player === 'P2')!.strategyTag).toBeNull();
  });

  it('gives aligned (spread 0) players no tag', () => {
    // Three RBs whose dynasty and projection orderings match => spread 0 for all.
    const players = [
      mkPlayer({ player: 'G1', age: 29, baseBudget: 90, projectionAuctionValue: 90, vor: 40 }),
      mkPlayer({ player: 'G2', age: 29, baseBudget: 80, projectionAuctionValue: 80, vor: 30 }),
      mkPlayer({ player: 'G3', age: 29, baseBudget: 70, projectionAuctionValue: 70, vor: 20 }),
    ];
    const out = computeSpreads(players);
    expect(out.every((p) => p.spread === 0)).toBe(true);
    expect(out.every((p) => p.strategyTag === null)).toBe(true);
  });

  it('respects the gate: a 14-point spread does not tag, a supra-gate spread does', () => {
    // 8 old-age RBs. Dyn order by baseBudget desc = P1..P8.
    // Projection order = P1 > P3 > P4 > P2 > P5 > P6 > P7 > P8, so:
    //   P4: dynRank 4, projRank 3 => round((4-3)/7*100) = 14  (< gate 15 => no tag)
    //   P2: dynRank 2, projRank 4 => round((2-4)/7*100) = -29 (>= gate => FADE)
    const players = [
      mkPlayer({ player: 'P1', age: 29, baseBudget: 80, projectionAuctionValue: 100, vor: 40 }),
      mkPlayer({ player: 'P2', age: 29, baseBudget: 70, projectionAuctionValue: 70, vor: 35 }),
      mkPlayer({ player: 'P3', age: 29, baseBudget: 60, projectionAuctionValue: 90, vor: 30 }),
      mkPlayer({ player: 'P4', age: 29, baseBudget: 50, projectionAuctionValue: 80, vor: 25 }),
      mkPlayer({ player: 'P5', age: 29, baseBudget: 40, projectionAuctionValue: 60, vor: 20 }),
      mkPlayer({ player: 'P6', age: 29, baseBudget: 30, projectionAuctionValue: 50, vor: 15 }),
      mkPlayer({ player: 'P7', age: 29, baseBudget: 20, projectionAuctionValue: 40, vor: 10 }),
      mkPlayer({ player: 'P8', age: 29, baseBudget: 10, projectionAuctionValue: 30, vor: 5 }),
    ];
    const out = computeSpreads(players);
    const p4 = out.find((p) => p.player === 'P4')!;
    expect(p4.spread).toBe(14);
    expect(p4.strategyTag).toBeNull();
    const p2 = out.find((p) => p.player === 'P2')!;
    expect(p2.spread).toBe(-29);
    expect(p2.strategyTag).toBe('FADE');
  });

  it('normalizes by pool size — the same rank gap yields different spreads across positions', () => {
    const players = [
      // WR pool N=3: W1 dynRank 1, projRank 2 => round((1-2)/2*100) = -50
      mkPlayer({
        player: 'W1',
        pos: 'WR',
        age: 26,
        baseBudget: 90,
        projectionAuctionValue: 50,
        vor: 20,
      }),
      mkPlayer({
        player: 'W2',
        pos: 'WR',
        age: 26,
        baseBudget: 60,
        projectionAuctionValue: 90,
        vor: 25,
      }),
      mkPlayer({
        player: 'W3',
        pos: 'WR',
        age: 26,
        baseBudget: 30,
        projectionAuctionValue: 10,
        vor: 5,
      }),
      // TE pool N=5: T1 dynRank 1, projRank 2 => round((1-2)/4*100) = -25
      mkPlayer({
        player: 'T1',
        pos: 'TE',
        age: 26,
        baseBudget: 90,
        projectionAuctionValue: 70,
        vor: 20,
      }),
      mkPlayer({
        player: 'T2',
        pos: 'TE',
        age: 26,
        baseBudget: 80,
        projectionAuctionValue: 90,
        vor: 25,
      }),
      mkPlayer({
        player: 'T3',
        pos: 'TE',
        age: 26,
        baseBudget: 60,
        projectionAuctionValue: 60,
        vor: 15,
      }),
      mkPlayer({
        player: 'T4',
        pos: 'TE',
        age: 26,
        baseBudget: 40,
        projectionAuctionValue: 40,
        vor: 10,
      }),
      mkPlayer({
        player: 'T5',
        pos: 'TE',
        age: 26,
        baseBudget: 20,
        projectionAuctionValue: 20,
        vor: 5,
      }),
    ];
    const out = computeSpreads(players);
    // Identical rank gap of 1, different pool sizes => different normalized spread.
    expect(out.find((p) => p.player === 'W1')!.spread).toBe(-50);
    expect(out.find((p) => p.player === 'T1')!.spread).toBe(-25);
  });

  it('no-reads below-replacement, no-projection, and non-skill players', () => {
    const players = [
      mkPlayer({ player: 'BelowRepl', vor: 0, projectionAuctionValue: 1 }),
      mkPlayer({ player: 'NoProj', vor: null, projectionAuctionValue: null }),
      mkPlayer({ player: 'Pkg', pos: 'PKG', vor: null, projectionAuctionValue: null }),
    ];
    const out = computeSpreads(players);
    for (const p of out) {
      expect(p.spread).toBeNull();
      expect(p.strategyTag).toBeNull();
    }
  });

  it('ranks position-relative (a single-member position gets spread 0)', () => {
    const players = [
      mkPlayer({
        player: 'OnlyTE',
        pos: 'TE',
        age: 24,
        baseBudget: 50,
        projectionAuctionValue: 90,
        vor: 30,
      }),
      mkPlayer({ player: 'RB1', pos: 'RB', baseBudget: 60, projectionAuctionValue: 60, vor: 20 }),
      mkPlayer({ player: 'RB2', pos: 'RB', baseBudget: 40, projectionAuctionValue: 40, vor: 10 }),
    ];
    const out = computeSpreads(players);
    // Single TE => N=1 => spread 0, no tag.
    expect(out.find((p) => p.player === 'OnlyTE')!.spread).toBe(0);
    expect(out.find((p) => p.player === 'OnlyTE')!.strategyTag).toBeNull();
  });

  it('exposes dynRank and projRank for the modal', () => {
    const out = computeSpreads(rbSet());
    const c = out.find((p) => p.player === 'C')!;
    expect(c.spreadDynRank).toBe(4);
    expect(c.spreadProjRank).toBe(1);
  });
});

describe('strategyTagReason', () => {
  it('returns a distinct sentence per tag', () => {
    const reasons = (['WIN-NOW', 'BARGAIN', 'FUTURE', 'FADE'] as const).map(strategyTagReason);
    expect(new Set(reasons).size).toBe(4);
    reasons.forEach((r) => expect(r.length).toBeGreaterThan(0));
  });
});
