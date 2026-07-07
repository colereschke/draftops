'use client';

import { useState, useMemo, useCallback } from 'react';
import type { TeamWithRoster } from '@/types';
import { LEAGUE_TEAMS, ROSTER_SIZE } from '@/lib/teams';
import RosterTable, { type SortKey } from './RosterTable';

interface RosterTrackerProps {
  teams: TeamWithRoster[];
  ownerHandle: string | null;
}

export default function RosterTracker({ teams, ownerHandle }: RosterTrackerProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState<SortKey>('buyingPower');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const toggle = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSort = (col: SortKey) => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  const sorted = useMemo(
    () =>
      [...teams].sort((a, b) => {
        const aV = a[sortBy];
        const bV = b[sortBy];
        return sortDir === 'desc' ? bV - aV : aV - bV;
      }),
    [teams, sortBy, sortDir],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-card px-5 pt-[18px] pb-3.5">
        <div className="font-label mb-1 text-[10px] tracking-[3px] text-muted-foreground uppercase">
          {LEAGUE_TEAMS.length}-Team · Superflex · TE Premium · $1,000 Budget · {ROSTER_SIZE}-Man
          Rosters
        </div>
        <h1 className="font-label m-0 mb-0.5 text-xl font-bold tracking-tight text-white">
          Team Rosters
        </h1>
        <div className="text-[11px] text-muted-foreground">
          Click any row or expand control to view rosters · Multiple rows can be open simultaneously
        </div>
      </div>

      <RosterTable
        teams={sorted}
        expanded={expanded}
        onToggle={toggle}
        sortBy={sortBy}
        sortDir={sortDir}
        onSort={handleSort}
        ownerHandle={ownerHandle}
      />
    </div>
  );
}
