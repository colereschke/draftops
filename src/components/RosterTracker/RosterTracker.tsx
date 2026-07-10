'use client';

import { useState, useMemo, useCallback } from 'react';
import type { TeamWithRoster } from '@/types';
import type { ManagerTendency } from '@/lib/tendencies';
import DossierCard from './DossierCard';

interface RosterTrackerProps {
  teams: TeamWithRoster[];
  tendencies: ManagerTendency[];
  ownerHandle: string | null;
}

type CardSort = 'activity' | 'aggression' | 'lean';

const AGGRESSION_RANK: Record<ManagerTendency['aggression'], number> = {
  aggressive: 2,
  neutral: 1,
  disciplined: 0,
};

export default function RosterTracker({ teams, tendencies, ownerHandle }: RosterTrackerProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState<CardSort>('activity');

  const tendencyById = useMemo(() => new Map(tendencies.map((t) => [t.teamId, t])), [tendencies]);

  const toggle = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const ordered = useMemo(() => {
    const withTendency = teams
      .map((team) => ({ team, tendency: tendencyById.get(team.id) }))
      .filter((x): x is { team: TeamWithRoster; tendency: ManagerTendency } => x.tendency != null);

    const isOwner = (t: TeamWithRoster) => ownerHandle !== null && t.handle === ownerHandle;

    return [...withTendency].sort((a, b) => {
      // Owner always first.
      if (isOwner(a.team) !== isOwner(b.team)) return isOwner(a.team) ? -1 : 1;
      if (sortBy === 'aggression') {
        return AGGRESSION_RANK[b.tendency.aggression] - AGGRESSION_RANK[a.tendency.aggression];
      }
      if (sortBy === 'lean') {
        return a.tendency.lean.localeCompare(b.tendency.lean);
      }
      return b.tendency.totalSpend - a.tendency.totalSpend; // activity
    });
  }, [teams, tendencyById, sortBy, ownerHandle]);

  const totalTeams = teams.length;
  const activeManagers = tendencies.filter((t) => t.buys > 0).length;
  const packagesHeld = teams.reduce((sum, t) => sum + t.pkgCount, 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-background px-5 py-4">
        <section className="rounded-lg border border-border-subtle bg-card px-4 py-3">
          <div className="font-label mb-1 text-[10px] tracking-[2.5px] text-muted-foreground uppercase">
            {totalTeams}-Team · Superflex · Manager Scouting
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-label m-0 text-2xl leading-none font-bold tracking-tight text-foreground">
                Team Rosters
              </h1>
              <div className="mt-1.5 text-[11px] text-secondary-fg">
                How each manager buys — lean, appetite, and discipline. {activeManagers} active
                {packagesHeld > 0 &&
                  ` · ${packagesHeld} pick package${packagesHeld > 1 ? 's' : ''} held`}
                .
              </div>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-label tracking-wide uppercase">Sort</span>
              <select
                data-testid="dossier-sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as CardSort)}
                className="rounded border border-border-subtle bg-background px-2 py-1 text-[12px] text-foreground"
              >
                <option value="activity">Activity</option>
                <option value="aggression">Aggression</option>
                <option value="lean">Lean</option>
              </select>
            </label>
          </div>
        </section>
      </div>

      <div className="mx-auto flex max-w-2xl flex-col gap-3 px-5 pt-3 pb-10">
        {ordered.map(({ team, tendency }) => (
          <DossierCard
            key={team.id}
            team={team}
            tendency={tendency}
            isOwner={ownerHandle !== null && team.handle === ownerHandle}
            isExpanded={expanded.has(team.id)}
            onToggle={toggle}
          />
        ))}
      </div>
    </div>
  );
}
