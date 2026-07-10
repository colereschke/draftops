'use client';

import { useState, useMemo, useCallback } from 'react';
import type { TeamWithRoster } from '@/types';
import type { ManagerTendency } from '@/lib/tendencies';
import { useMediaQuery } from '@/lib/useMediaQuery';
import DossierCard from './DossierCard';
import TeamDetailPane from './TeamDetailPane';

interface RosterTrackerProps {
  teams: TeamWithRoster[];
  tendencies: ManagerTendency[];
  ownerHandle: string | null;
}

type CardSort = 'activity' | 'aggression' | 'buys' | 'age';

const AGGRESSION_RANK: Record<ManagerTendency['aggression'], number> = {
  aggressive: 2,
  neutral: 1,
  disciplined: 0,
};

export default function RosterTracker({ teams, tendencies, ownerHandle }: RosterTrackerProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState<CardSort>('activity');
  const isDesktop = useMediaQuery('(min-width: 1024px)');

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
        const rankDiff =
          AGGRESSION_RANK[b.tendency.aggression] - AGGRESSION_RANK[a.tendency.aggression];
        if (rankDiff !== 0) return rankDiff;
        // Tiebreak within the same tier by how extreme the over/under-value read is.
        return Math.abs(b.tendency.overallOverPct ?? 0) - Math.abs(a.tendency.overallOverPct ?? 0);
      }
      if (sortBy === 'buys') {
        return b.tendency.buys - a.tendency.buys;
      }
      if (sortBy === 'age') {
        // Youngest first; unknown average age (no age-eligible buys yet) sinks to the bottom.
        return (a.team.avgAge ?? Infinity) - (b.team.avgAge ?? Infinity);
      }
      return b.tendency.totalSpend - a.tendency.totalSpend; // activity (spend)
    });
  }, [teams, tendencyById, sortBy, ownerHandle]);

  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(
    () => ordered[0]?.team.id ?? null,
  );

  const selected = ordered.find(({ team }) => team.id === selectedTeamId) ?? ordered[0] ?? null;

  const totalTeams = teams.length;
  const activeManagers = tendencies.filter((t) => t.buys > 0).length;
  const packagesHeld = teams.reduce((sum, t) => sum + t.pkgCount, 0);

  return (
    <div
      className={
        isDesktop
          ? 'flex h-[calc(100vh-3.5rem)] flex-col bg-background text-foreground'
          : 'min-h-screen bg-background text-foreground'
      }
    >
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
                <option value="activity">Spend</option>
                <option value="aggression">Aggression</option>
                <option value="buys">Buys</option>
                <option value="age">Age</option>
              </select>
            </label>
          </div>
        </section>
      </div>

      {isDesktop ? (
        <div className="flex min-h-0 flex-1 items-stretch gap-4 px-5 py-3">
          <div className="flex min-h-0 w-[360px] shrink-0 flex-col gap-3 overflow-y-auto">
            {ordered.map(({ team, tendency }) => (
              <DossierCard
                key={team.id}
                team={team}
                tendency={tendency}
                isOwner={ownerHandle !== null && team.handle === ownerHandle}
                isExpanded={false}
                isSelected={team.id === selectedTeamId}
                mode="select"
                onToggle={setSelectedTeamId}
              />
            ))}
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            {selected && (
              <TeamDetailPane
                team={selected.team}
                tendency={selected.tendency}
                isOwner={ownerHandle !== null && selected.team.handle === ownerHandle}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 px-5 pt-3 pb-10 sm:grid-cols-2 xl:grid-cols-3">
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
      )}
    </div>
  );
}
