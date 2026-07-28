import {
  parseAuctionSheetSearchParams,
  buildAuctionSheetQueryString,
} from '@/components/AuctionSheet/urlState';

describe('parseAuctionSheetSearchParams', () => {
  it('returns defaults for an empty query string', () => {
    expect(parseAuctionSheetSearchParams(new URLSearchParams())).toEqual({
      posFilter: 'ALL',
      strategyFilter: 'ALL',
      search: '',
      sortBy: 'budget',
      sortDir: 'desc',
      availableOnly: false,
    });
  });

  it('reads every recognized param', () => {
    const params = new URLSearchParams(
      'pos=WR&strategy=BARGAIN&q=jefferson&sort=spread&dir=asc&available=1',
    );
    expect(parseAuctionSheetSearchParams(params)).toEqual({
      posFilter: 'WR',
      strategyFilter: 'BARGAIN',
      search: 'jefferson',
      sortBy: 'spread',
      sortDir: 'asc',
      availableOnly: true,
    });
  });

  it('falls back to defaults for unrecognized values instead of trusting them', () => {
    const params = new URLSearchParams('pos=DROP&strategy=NOPE&sort=__proto__&dir=sideways');
    expect(parseAuctionSheetSearchParams(params)).toEqual({
      posFilter: 'ALL',
      strategyFilter: 'ALL',
      search: '',
      sortBy: 'budget',
      sortDir: 'desc',
      availableOnly: false,
    });
  });
});

describe('buildAuctionSheetQueryString', () => {
  it('omits every field that is at its default value', () => {
    expect(
      buildAuctionSheetQueryString({
        posFilter: 'ALL',
        strategyFilter: 'ALL',
        search: '',
        sortBy: 'budget',
        sortDir: 'desc',
        availableOnly: false,
      }),
    ).toBe('');
  });

  it('includes only the fields that differ from their default', () => {
    expect(
      buildAuctionSheetQueryString({
        posFilter: 'WR',
        strategyFilter: 'ALL',
        search: '',
        sortBy: 'budget',
        sortDir: 'desc',
        availableOnly: true,
      }),
    ).toBe('pos=WR&available=1');
  });

  it('round-trips through parseAuctionSheetSearchParams', () => {
    const state = {
      posFilter: 'TE' as const,
      strategyFilter: 'FADE' as const,
      search: 'kittle',
      sortBy: 'ceiling' as const,
      sortDir: 'asc' as const,
      availableOnly: true,
    };
    const query = buildAuctionSheetQueryString(state);
    expect(parseAuctionSheetSearchParams(new URLSearchParams(query))).toEqual(state);
  });
});
