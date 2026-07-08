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
  const totalOpenSlots = useMemo(
    () => teams.reduce((sum, team) => sum + team.rosterRemaining, 0),
    [teams],
  );
  const totalPackages = useMemo(() => teams.reduce((sum, team) => sum + team.pkgCount, 0), [teams]);
  const mostFlexible = useMemo(
    () =>
      teams.reduce<TeamWithRoster | null>(
        (best, team) => (!best || team.buyingPower > best.buyingPower ? team : best),
        null,
      ),
    [teams],
  );

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
      <div className="border-b border-border bg-background px-5 py-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-stretch">
          <section className="rounded-lg border border-border-subtle bg-card px-4 py-3">
            <div className="font-label mb-1 text-[10px] tracking-[2.5px] text-muted-foreground uppercase">
              {LEAGUE_TEAMS.length}-Team · Superflex · TE Premium · $1,000 Budget · {ROSTER_SIZE}
              -Man Rosters
            </div>
            <h1 className="font-label m-0 text-2xl leading-none font-bold tracking-tight text-foreground">
              Team Rosters
            </h1>
            <div className="mt-1.5 text-[11px] text-secondary-fg">
              Roster construction, spend, and leverage by team
            </div>
          </section>

          <section className="grid min-w-full grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[620px]">
            <RosterMetric label="Teams" value={teams.length} testId="roster-metric-teams" />
            <RosterMetric
              label="Open Slots"
              value={totalOpenSlots}
              testId="roster-metric-open-slots"
            />
            <RosterMetric
              label="Most Flexible"
              value={mostFlexible ? `${mostFlexible.handle} · $${mostFlexible.buyingPower}` : '—'}
              testId="roster-metric-most-flexible"
            />
            <RosterMetric
              label="Packages Held"
              value={totalPackages}
              testId="roster-metric-packages"
            />
          </section>
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

interface RosterMetricProps {
  label: string;
  value: number | string;
  detail?: string;
  testId: string;
}

function RosterMetric({ label, value, detail, testId }: RosterMetricProps) {
  return (
    <div className="rounded-lg border border-border-subtle bg-card px-3 py-3">
      <div className="font-label text-[10px] tracking-[1.7px] text-muted-foreground uppercase">
        {label}
      </div>
      <div
        data-testid={testId}
        className="mt-1 font-mono text-xl font-bold text-foreground tabular-nums"
      >
        {value}
      </div>
      {detail && <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{detail}</div>}
    </div>
  );
}
