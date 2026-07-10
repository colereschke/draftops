'use client';

import { useCallback, useSyncExternalStore } from 'react';

function subscribe(query: string, callback: () => void) {
  const mql = window.matchMedia(query);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

export function useMediaQuery(query: string): boolean {
  const subscribeToQuery = useCallback(
    (callback: () => void) => subscribe(query, callback),
    [query],
  );
  return useSyncExternalStore(
    subscribeToQuery,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
