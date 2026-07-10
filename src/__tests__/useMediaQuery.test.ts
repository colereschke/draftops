import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from '@/lib/useMediaQuery';

function mockMatchMedia(initialMatches: boolean) {
  let listener: ((e: MediaQueryListEvent) => void) | null = null;
  const mql = {
    matches: initialMatches,
    media: '',
    addEventListener: (_event: string, cb: (e: MediaQueryListEvent) => void) => {
      listener = cb;
    },
    removeEventListener: () => {
      listener = null;
    },
  };
  window.matchMedia = jest.fn().mockReturnValue(mql);
  return {
    trigger: (matches: boolean) => {
      mql.matches = matches;
      listener?.({ matches } as MediaQueryListEvent);
    },
  };
}

describe('useMediaQuery', () => {
  it('returns true when the query matches on mount', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));
    expect(result.current).toBe(true);
  });

  it('returns false when the query does not match on mount', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));
    expect(result.current).toBe(false);
  });

  it('updates when the media query change event fires', () => {
    const { trigger } = mockMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));
    expect(result.current).toBe(false);
    act(() => trigger(true));
    expect(result.current).toBe(true);
  });
});
