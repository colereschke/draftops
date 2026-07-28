import {
  parseNominationPosFilter,
  buildNominationQueryString,
} from '@/components/NominationHelper/urlState';

describe('parseNominationPosFilter', () => {
  it('defaults to ALL for an empty query string', () => {
    expect(parseNominationPosFilter(new URLSearchParams())).toBe('ALL');
  });

  it('reads a recognized position', () => {
    expect(parseNominationPosFilter(new URLSearchParams('pos=RB'))).toBe('RB');
  });

  it('falls back to ALL for an unrecognized value', () => {
    expect(parseNominationPosFilter(new URLSearchParams('pos=nope'))).toBe('ALL');
  });
});

describe('buildNominationQueryString', () => {
  it('returns an empty string for ALL', () => {
    expect(buildNominationQueryString('ALL')).toBe('');
  });

  it('encodes a specific position', () => {
    expect(buildNominationQueryString('TE')).toBe('pos=TE');
  });
});
