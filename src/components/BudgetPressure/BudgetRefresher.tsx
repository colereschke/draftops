'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import MutationStatus from '@/components/MutationStatus';

interface BudgetRefresherProps {
  intervalMs?: number;
}

export default function BudgetRefresher({ intervalMs = 20000 }: BudgetRefresherProps) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const [mutationStatus, setMutationStatus] = useState('');
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    () => document.visibilityState === 'visible',
  );
  const intervalSecs = intervalMs / 1000;
  const tickRef = useRef(0);
  const routerRef = useRef(router);
  const refreshPendingRef = useRef(false);
  const announceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const announceRefresh = useCallback(() => {
    if (announceTimeoutRef.current) clearTimeout(announceTimeoutRef.current);
    setMutationStatus('');
    announceTimeoutRef.current = setTimeout(() => {
      setMutationStatus('Threat board refreshed.');
    }, 50);
  }, []);

  const requestRefresh = useCallback(() => {
    if (document.visibilityState !== 'visible' || refreshPendingRef.current) return;
    refreshPendingRef.current = true;
    tickRef.current = 0;
    setElapsed(0);
    startRefreshTransition(() => {
      routerRef.current.refresh();
      announceRefresh();
    });
  }, [announceRefresh, startRefreshTransition]);

  useEffect(() => {
    if (!isRefreshing) refreshPendingRef.current = false;
  }, [isRefreshing]);

  useEffect(() => {
    tickRef.current = 0;
    if (!isDocumentVisible) return;
    const timer = setInterval(() => {
      tickRef.current += 1;
      if (tickRef.current >= intervalSecs) {
        requestRefresh();
      } else {
        setElapsed(tickRef.current);
      }
    }, 1000);
    return () => {
      clearInterval(timer);
      if (announceTimeoutRef.current) clearTimeout(announceTimeoutRef.current);
    };
  }, [intervalSecs, isDocumentVisible, requestRefresh]);

  useEffect(() => {
    function handleVisibilityChange() {
      const visible = document.visibilityState === 'visible';
      setIsDocumentVisible(visible);
      if (visible) requestRefresh();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [requestRefresh]);

  return (
    <div className="flex items-center gap-2">
      <MutationStatus message={mutationStatus} />
      <span className="font-mono text-[10px] text-muted-foreground">Updated {elapsed}s ago</span>
      <Button variant="outline" size="sm" onClick={requestRefresh} disabled={isRefreshing}>
        Refresh
      </Button>
    </div>
  );
}
