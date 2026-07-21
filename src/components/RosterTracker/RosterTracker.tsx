'use client';

import { useState, useMemo, useCallback } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import type { TeamWithRoster, StartingSlot } from '@/types';
import { DEFAULT_STARTING_LINEUP } from '@/types';
import type { AppetitePos, ManagerTendency } from '@/lib/tendencies';
import { APPETITE_POSITIONS } from '@/lib/tendencies.constants';
import { POS_COLORS } from '@/lib/posColors';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { formatLineupFormat } from '@/lib/describeDraftSettings';
import DossierCard from './DossierCard';
import TeamDetailPane from './TeamDetailPane';

interface RosterTrackerProps {
  teams: TeamWithRoster[];
  tendencies: ManagerTendency[];
  ownerHandle: string | null;
  startingLineup?: StartingSlot[];
}

type SortKey = 'spend' | 'aggression' | 'buys' | 'age' | AppetitePos;
type SortDir = 'asc' | 'desc';
type OrderedEntry = { team: TeamWithRoster; tendency: ManagerTendency };

const STAT_SORT_CHIPS: Array<{ key: SortKey; label: string; defaultDir: SortDir }> = [
  { key: 'spend', label: 'Spend', defaultDir: 'desc' },
  { key: 'aggression', label: 'Aggression', defaultDir: 'desc' },
  { key: 'buys', label: 'Buys', defaultDir: 'desc' },
  { key: 'age', label: 'Age', defaultDir: 'asc' },
];

const POSITION_SORT_CHIPS: Array<{ key: SortKey; label: string; defaultDir: SortDir }> =
  APPETITE_POSITIONS.map((pos) => ({ key: pos, label: pos, defaultDir: 'desc' }));

// raw > 0 means `a` ranks higher than `b` in the metric's natural "bigger number" sense;
// applyDir flips that when sorting ascending.
function applyDir(raw: number, dir: SortDir): number {
  return dir === 'desc' ? -raw : raw;
}

function compareByKey(key: SortKey, a: OrderedEntry, b: OrderedEntry, dir: SortDir): number {
  if (key === 'age') {
    // Unknown average age (no age-eligible buys yet) always sinks to the bottom,
    // regardless of direction — it's not a "0", it's a missing read.
    if (a.team.avgAge === null || b.team.avgAge === null) {
      if (a.team.avgAge === null && b.team.avgAge === null) return 0;
      return a.team.avgAge === null ? 1 : -1;
    }
    return applyDir(a.team.avgAge - b.team.avgAge, dir);
  }
  if (key === 'aggression') {
    // No reliable read yet (too few value-matched buys) always sinks to the bottom,
    // regardless of direction — it's not "0%", it's a missing read. Sort the rest
    // directly by the continuous % over/under value instead of the aggressive/
    // neutral/disciplined bucket, since that bucket is just a threshold derived
    // from this same number and only throws away precision.
    if (a.tendency.overallOverPct === null || b.tendency.overallOverPct === null) {
      if (a.tendency.overallOverPct === null && b.tendency.overallOverPct === null) return 0;
      return a.tendency.overallOverPct === null ? 1 : -1;
    }
    return applyDir(a.tendency.overallOverPct - b.tendency.overallOverPct, dir);
  }
  if (key === 'spend') return applyDir(a.tendency.totalSpend - b.tendency.totalSpend, dir);
  if (key === 'buys') return applyDir(a.tendency.buys - b.tendency.buys, dir);
  // QB/RB/WR/TE: rank by spend share in that position.
  return applyDir(a.tendency.positions[key].spendShare - b.tendency.positions[key].spendShare, dir);
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="size-3 text-muted-foreground" />;
  return dir === 'asc' ? (
    <ArrowUp className="size-3" style={{ color: 'var(--primary)' }} />
  ) : (
    <ArrowDown className="size-3" style={{ color: 'var(--primary)' }} />
  );
}

function SortChip({
  chip,
  active,
  dir,
  onClick,
  color,
}: {
  chip: { key: SortKey; label: string };
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      type="button"
      data-testid={`dossier-sort-${chip.key}`}
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Sort by ${chip.label}`}
      className="font-label flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[11px] font-semibold tracking-wide whitespace-nowrap uppercase select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      style={{ color: active ? (color ?? 'var(--primary)') : (color ?? 'var(--text-muted)') }}
    >
      {chip.label}
      <SortIcon active={active} dir={dir} />
    </button>
  );
}

export default function RosterTracker({
  teams,
  tendencies,
  ownerHandle,
  startingLineup = DEFAULT_STARTING_LINEUP,
}: RosterTrackerProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState<SortKey>('spend');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
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

  const handleSort = (chip: { key: SortKey; defaultDir: SortDir }) => {
    if (chip.key === sortBy) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(chip.key);
      setSortDir(chip.defaultDir);
    }
  };

  const ordered = useMemo(() => {
    const withTendency = teams
      .map((team) => ({ team, tendency: tendencyById.get(team.id) }))
      .filter((x): x is OrderedEntry => x.tendency != null);

    const isOwner = (t: TeamWithRoster) => ownerHandle !== null && t.handle === ownerHandle;

    return [...withTendency].sort((a, b) => {
      // Owner always first.
      if (isOwner(a.team) !== isOwner(b.team)) return isOwner(a.team) ? -1 : 1;
      return compareByKey(sortBy, a, b, sortDir);
    });
  }, [teams, tendencyById, sortBy, sortDir, ownerHandle]);

  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(
    () => ordered[0]?.team.id ?? null,
  );

  const selected = ordered.find(({ team }) => team.id === selectedTeamId) ?? ordered[0] ?? null;

  const totalTeams = teams.length;
  const activeManagers = tendencies.filter((t) => t.buys > 0).length;
  const packagesHeld = teams.reduce((sum, t) => sum + t.pkgCount, 0);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={
        isDesktop
          ? 'flex h-[calc(100vh-3.5rem)] flex-col bg-background text-foreground'
          : 'min-h-screen bg-background text-foreground'
      }
    >
      <div
        data-onboarding-target="team-rosters"
        className="border-b border-border bg-background px-5 py-4"
      >
        <section className="rounded-lg border border-border-subtle bg-card px-4 py-3">
          <div className="font-label mb-1 text-[10px] tracking-[2.5px] text-muted-foreground uppercase">
            {totalTeams}-Team · {formatLineupFormat(startingLineup)} · Manager Scouting
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
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <span className="font-label tracking-wide uppercase">Sort</span>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {STAT_SORT_CHIPS.map((chip) => (
                  <SortChip
                    key={chip.key}
                    chip={chip}
                    active={sortBy === chip.key}
                    dir={sortDir}
                    onClick={() => handleSort(chip)}
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-l border-border-subtle pl-3">
                {POSITION_SORT_CHIPS.map((chip) => (
                  <SortChip
                    key={chip.key}
                    chip={chip}
                    active={sortBy === chip.key}
                    dir={sortDir}
                    onClick={() => handleSort(chip)}
                    color={POS_COLORS[chip.key as AppetitePos].accent}
                  />
                ))}
              </div>
            </div>
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
    </main>
  );
}
