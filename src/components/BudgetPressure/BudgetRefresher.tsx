'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';

interface BudgetRefresherProps {
  intervalMs?: number;
}

export default function BudgetRefresher({ intervalMs = 20000 }: BudgetRefresherProps) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
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
  }, []);

  useEffect(() => {
    tickRef.current = 0;
    const timer = setInterval(() => {
      tickRef.current += 1;
      if (tickRef.current >= intervalSecs) {
        routerRef.current.refresh();
        tickRef.current = 0;
        setElapsed(0);
      } else {
        setElapsed(tickRef.current);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [intervalSecs]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          fontSize: 10,
          color: '#4a5168',
          fontFamily: 'var(--font-mono), monospace',
        }}
      >
        Updated {elapsed}s ago
      </span>
      <button
        onClick={doRefresh}
        style={{
          padding: '3px 8px',
          fontSize: 10,
          background: 'transparent',
          border: '1px solid #2a3048',
          borderRadius: 4,
          color: '#4a5168',
          cursor: 'pointer',
        }}
      >
        Refresh
      </button>
    </div>
  );
}
