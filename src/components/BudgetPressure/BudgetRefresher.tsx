'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';

interface BudgetRefresherProps {
  intervalMs?: number;
}

export default function BudgetRefresher({ intervalMs = 20000 }: BudgetRefresherProps) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const intervalSecs = intervalMs / 1000;

  const doRefresh = useCallback(() => {
    router.refresh();
    setElapsed(0);
  }, [router]);

  useEffect(() => {
    let tick = 0;
    const timer = setInterval(() => {
      tick += 1;
      if (tick >= intervalSecs) {
        router.refresh();
        tick = 0;
        setElapsed(0);
      } else {
        setElapsed(tick);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [router, intervalSecs]);

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
