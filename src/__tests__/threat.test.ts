import { maxBid, appetiteMultiplier, threatScore } from '@/lib/threat';

describe('maxBid', () => {
  it('is buyingPower + 1 when slots remain', () => {
    expect(maxBid({ buyingPower: 660, rosterRemaining: 28 })).toBe(661);
  });
  it('is 0 when no roster slots remain', () => {
    expect(maxBid({ buyingPower: 300, rosterRemaining: 0 })).toBe(0);
  });
  it('clamps negative buying power to 0', () => {
    expect(maxBid({ buyingPower: -5, rosterRemaining: 3 })).toBe(0);
  });
});

describe('appetiteMultiplier', () => {
  it('lifts overpays, cuts thrifty, leaves neutral and no-read at 1.0', () => {
    expect(appetiteMultiplier('overpays')).toBeGreaterThan(1);
    expect(appetiteMultiplier('thrifty')).toBeLessThan(1);
    expect(appetiteMultiplier('neutral')).toBe(1);
    expect(appetiteMultiplier('no-read')).toBe(1);
  });
});

describe('threatScore', () => {
  it('early draft (no-read) ranks purely by max-bid', () => {
    const a = threatScore({ buyingPower: 340, rosterRemaining: 20 }, 'no-read');
    const b = threatScore({ buyingPower: 312, rosterRemaining: 20 }, 'no-read');
    expect(a).toBeGreaterThan(b);
  });
  it('a WR-addict outranks a flusher who is WR-thrifty', () => {
    const addict = threatScore({ buyingPower: 312, rosterRemaining: 20 }, 'overpays');
    const flusher = threatScore({ buyingPower: 340, rosterRemaining: 20 }, 'thrifty');
    expect(addict).toBeGreaterThan(flusher);
  });
});
