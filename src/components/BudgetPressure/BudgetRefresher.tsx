'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import MutationStatus from '@/components/MutationStatus';

interface BudgetRefresherProps {
  intervalMs?: number;
}

export default function BudgetRefresher({ intervalMs = 20000 }: BudgetRefresherProps) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const [mutationStatus, setMutationStatus] = useState('');
  const intervalSecs = intervalMs / 1000;
  const tickRef = useRef(0);
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const doRefresh = useCallback(() => {
    routerRef.current.refresh();
    tickRef.current = 0;
    setElapsed(0);
    setMutationStatus('Threat board refreshed.');
  }, []);

  useEffect(() => {
    tickRef.current = 0;
    const timer = setInterval(() => {
      tickRef.current += 1;
      if (tickRef.current >= intervalSecs) {
        routerRef.current.refresh();
        tickRef.current = 0;
        setElapsed(0);
        setMutationStatus('Threat board refreshed.');
      } else {
        setElapsed(tickRef.current);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [intervalSecs]);

  return (
    <div className="flex items-center gap-2">
      <MutationStatus message={mutationStatus} />
      <span className="font-mono text-[10px] text-muted-foreground">Updated {elapsed}s ago</span>
      <Button variant="outline" size="sm" onClick={doRefresh}>
        Refresh
      </Button>
    </div>
  );
}
