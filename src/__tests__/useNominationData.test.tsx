import { act, renderHook, waitFor } from '@testing-library/react';
import { useNominationData } from '@/components/NominationHelper/useNominationData';

const NOMINATION_DATA = {
  teamStats: [],
  auctionResults: [],
  watchlist: [],
  nominated: [],
  ownerHandle: null,
  targetRoster: { QB: 4 },
};

function setVisibilityState(value: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useNominationData', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  it('waits for a completed request before scheduling the next poll', async () => {
    let resolveRequest: (response: Response) => void;
    global.fetch = jest.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    renderHook(() => useNominationData({ draftId: 1, onUnauthorized: jest.fn() }));
    act(() => jest.runAllTicks());

    expect(global.fetch).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(60_000));
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRequest!({ ok: true, status: 200, json: async () => NOMINATION_DATA } as Response);
    });
    await act(async () => jest.advanceTimersByTime(30_000));
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('aborts in-flight work while hidden and reloads once when visible again', async () => {
    const abortSpy = jest.fn();
    global.fetch = jest.fn((_, init?: RequestInit) => {
      init?.signal?.addEventListener('abort', abortSpy);
      return new Promise<Response>(() => {});
    });
    renderHook(() => useNominationData({ draftId: 1, onUnauthorized: jest.fn() }));
    act(() => jest.runAllTicks());

    expect(global.fetch).toHaveBeenCalledTimes(1);
    act(() => setVisibilityState('hidden'));
    expect(abortSpy).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(60_000));
    expect(global.fetch).toHaveBeenCalledTimes(1);

    act(() => setVisibilityState('visible'));
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('supersedes a polling request when a mutation resync is requested', async () => {
    const abortSpy = jest.fn();
    global.fetch = jest.fn((_, init?: RequestInit) => {
      init?.signal?.addEventListener('abort', abortSpy);
      return new Promise<Response>(() => {});
    });
    const { result } = renderHook(() =>
      useNominationData({ draftId: 1, onUnauthorized: jest.fn() }),
    );
    act(() => jest.runAllTicks());

    await act(async () => {
      void result.current.refresh({ supersede: true });
    });
    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps aborts silent', async () => {
    global.fetch = jest.fn(
      (_, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const { result } = renderHook(() =>
      useNominationData({ draftId: 1, onUnauthorized: jest.fn() }),
    );
    act(() => jest.runAllTicks());

    await act(async () => setVisibilityState('hidden'));
    await waitFor(() => expect(result.current.error).toBeNull());
  });

  it('does not start the queued initial request after immediate unmount', () => {
    global.fetch = jest.fn();
    const { unmount } = renderHook(() =>
      useNominationData({ draftId: 1, onUnauthorized: jest.fn() }),
    );

    unmount();
    act(() => jest.runAllTicks());

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
