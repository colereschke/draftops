'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Mirrors a component's already-composed query string into the URL via
 * history.replaceState (which Next's router patches, keeping useSearchParams()
 * and back/forward in sync) without triggering a navigation/refetch. Skips the
 * first render so mounting never rewrites the URL the user arrived with.
 */
export function useUrlQuerySync(queryString: string): void {
  const pathname = usePathname();
  const didMount = useRef(false);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    window.history.replaceState(null, '', queryString ? `${pathname}?${queryString}` : pathname);
  }, [pathname, queryString]);
}
