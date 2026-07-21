'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuctionResultEntry, Position, TeamStats } from '@/types';

const POLL_INTERVAL_MS = 30_000;

export interface NominationData {
  teamStats: TeamStats[];
  auctionResults: AuctionResultEntry[];
  watchlist: number[];
  nominated: number[];
  ownerHandle: string | null;
  targetRoster: Partial<Record<Position, number>>;
}

interface UseNominationDataOptions {
  draftId: number;
  onUnauthorized: () => void;
}

interface RefreshOptions {
  supersede?: boolean;
}

interface UseNominationDataResult {
  data: NominationData | null;
  error: string | null;
  refresh: (options?: RefreshOptions) => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<NominationData | null>>;
}

export function useNominationData({
  draftId,
  onUnauthorized,
}: UseNominationDataOptions): UseNominationDataResult {
  const [data, setData] = useState<NominationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const refreshRef = useRef<(options?: RefreshOptions) => Promise<void>>(async () => {});

  const clearSchedule = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const scheduleNext = useCallback(() => {
    if (document.visibilityState !== 'visible' || timeoutRef.current || !mountedRef.current) return;
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      void refreshRef.current();
    }, POLL_INTERVAL_MS);
  }, []);

  const refresh = useCallback(
    async ({ supersede = false }: RefreshOptions = {}) => {
      if (!mountedRef.current || document.visibilityState !== 'visible') return;
      if (controllerRef.current) {
        if (!supersede) return;
        controllerRef.current.abort();
      }
      clearSchedule();
      const controller = new AbortController();
      controllerRef.current = controller;

      try {
        const response = await fetch(`/api/draft/${draftId}/nomination-data`, {
          signal: controller.signal,
        });
        if (response.status === 401) {
          onUnauthorized();
          return;
        }
        if (response.status === 404) {
          setError('No draft configured');
          return;
        }
        if (!response.ok) {
          setError('Unable to load nomination data');
          return;
        }
        setData((await response.json()) as NominationData);
        setError(null);
      } catch (fetchError: unknown) {
        if (
          typeof fetchError !== 'object' ||
          fetchError === null ||
          !('name' in fetchError) ||
          fetchError.name !== 'AbortError'
        ) {
          setError('Unable to load nomination data');
        }
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          scheduleNext();
        }
      }
    },
    [clearSchedule, draftId, onUnauthorized, scheduleNext],
  );
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    mountedRef.current = true;
    queueMicrotask(() => void refreshRef.current());

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        clearSchedule();
        controllerRef.current?.abort();
        return;
      }
      void refreshRef.current({ supersede: true });
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      mountedRef.current = false;
      clearSchedule();
      controllerRef.current?.abort();
      controllerRef.current = null;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [clearSchedule, draftId]);

  return { data, error, refresh, setData };
}
