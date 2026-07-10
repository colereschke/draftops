import { FUTURE_PICK_AUCTION_MODES, isFuturePickAuctionMode } from '@/lib/futurePickAssets';

describe('future pick auction mode helpers', () => {
  it('accepts only supported future pick auction modes', () => {
    expect(FUTURE_PICK_AUCTION_MODES).toEqual(['packages', 'individual', 'none']);
    expect(isFuturePickAuctionMode('packages')).toBe(true);
    expect(isFuturePickAuctionMode('individual')).toBe(true);
    expect(isFuturePickAuctionMode('none')).toBe(true);
    expect(isFuturePickAuctionMode('package')).toBe(false);
    expect(isFuturePickAuctionMode(null)).toBe(false);
  });
});
