import { renderHook } from '@testing-library/react';
import { useUrlQuerySync } from '@/lib/useUrlQuerySync';

let mockPathname = '/draft/1';

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

describe('useUrlQuerySync', () => {
  beforeEach(() => {
    mockPathname = '/draft/1';
    window.history.replaceState(null, '', '/draft/1');
    jest.spyOn(window.history, 'replaceState');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not touch the URL on initial mount', () => {
    renderHook(({ query }) => useUrlQuerySync(query), { initialProps: { query: 'pos=QB' } });
    expect(window.history.replaceState).not.toHaveBeenCalled();
  });

  it('writes the new query string to the URL when it changes', () => {
    const { rerender } = renderHook(({ query }) => useUrlQuerySync(query), {
      initialProps: { query: '' },
    });
    rerender({ query: 'pos=QB' });
    expect(window.location.pathname + window.location.search).toBe('/draft/1?pos=QB');
  });

  it('drops the query string entirely when the query becomes empty', () => {
    const { rerender } = renderHook(({ query }) => useUrlQuerySync(query), {
      initialProps: { query: 'pos=QB' },
    });
    rerender({ query: 'pos=RB' });
    rerender({ query: '' });
    expect(window.location.pathname + window.location.search).toBe('/draft/1');
  });
});
