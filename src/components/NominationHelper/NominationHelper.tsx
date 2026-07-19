'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Player, Position, TeamStats, AuctionResultEntry } from '@/types';
import { computeNominationScores, type ScoredPlayer } from '@/lib/nominationScoring';
import { useOnboarding } from '@/components/Onboarding/OnboardingContext';
import MutationStatus from '@/components/MutationStatus';
import WatchlistSidebar from './WatchlistSidebar';
import NominationTable from './NominationTable';
import DraftReadOnlyBanner from '@/components/DraftReadOnlyBanner';

interface NomData {
  teamStats: TeamStats[];
  auctionResults: AuctionResultEntry[];
  watchlist: number[];
  nominated: number[];
  ownerHandle: string | null;
  targetRoster: Partial<Record<Position, number>>;
}

interface NominationHelperProps {
  draftId: number;
  players: Player[];
  isReadOnly?: boolean;
}

interface PlayerMutationConfig {
  playerId: number;
  pendingLabel: string;
  successLabel: string;
  failureLabel: string;
  applyOptimistic: (prev: NomData) => NomData;
  revertOptimistic: (prev: NomData) => NomData;
  request: () => Promise<Response>;
}

export default function NominationHelper({
  draftId,
  players,
  isReadOnly = false,
}: NominationHelperProps) {
  const router = useRouter();
  const { progress, recordPlayerNominated } = useOnboarding();
  const [data, setData] = useState<NomData | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [posFilter, setPosFilter] = useState<'ALL' | Position>('ALL');
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  const [mutationStatus, setMutationStatus] = useState<string>('');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/draft/${draftId}/nomination-data`);
      if (res.status === 401) {
        router.replace('/sign-in');
        return;
      }
      if (res.status === 404) {
        setDraftError('No draft configured');
        return;
      }
      if (!res.ok) {
        setDraftError('Unable to load nomination data');
        return;
      }
      setData(await res.json());
      setDraftError(null);
    } catch {
      setDraftError('Unable to load nomination data');
    }
  }, [draftId, router]);

  useEffect(() => {
    // queueMicrotask: fetchData sets state before its first await; calling it directly
    // here trips react-hooks/set-state-in-effect.
    queueMicrotask(() => void fetchData());
    const interval = setInterval(() => void fetchData(), 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const wonIds = useMemo(
    () =>
      new Set(
        data?.auctionResults.flatMap((result) =>
          typeof result.playerId === 'number' ? [result.playerId] : [],
        ) ?? [],
      ),
    [data],
  );

  const scored = useMemo<ScoredPlayer[]>(() => {
    if (!data) return [];
    return computeNominationScores(
      players,
      data.teamStats,
      data.auctionResults,
      data.watchlist,
      data.nominated,
      // null ownerHandle → no owner team excluded from rival demand scoring (correct for unclaimed draft)
      data.ownerHandle ?? '',
      data.targetRoster,
    );
  }, [data, players]);

  const runPlayerMutation = useCallback(
    async ({
      playerId,
      pendingLabel,
      successLabel,
      failureLabel,
      applyOptimistic,
      revertOptimistic,
      request,
    }: PlayerMutationConfig): Promise<boolean> => {
      if (pendingIds.has(playerId)) return false;
      setPendingIds((prev) => new Set(prev).add(playerId));
      setData((prev) => (prev ? applyOptimistic(prev) : prev));
      setMutationStatus(pendingLabel);
      try {
        const res = await request();
        if (res.status === 401) {
          router.replace('/sign-in');
          return false;
        }
        if (!res.ok) {
          // Revert only this player's own optimistic change against the latest state,
          // rather than restoring a whole-object snapshot — a snapshot captured before
          // this mutation started would clobber any other player's mutation that was
          // applied concurrently in the meantime.
          setData((prev) => (prev ? revertOptimistic(prev) : prev));
          setMutationStatus(failureLabel);
          void fetchData();
          return false;
        }
        setMutationStatus(successLabel);
        return true;
      } catch {
        setData((prev) => (prev ? revertOptimistic(prev) : prev));
        setMutationStatus(failureLabel);
        void fetchData();
        return false;
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(playerId);
          return next;
        });
      }
    },
    [pendingIds, fetchData, router],
  );

  const addToWatchlist = (player: Player) => {
    const playerId = player.id;
    if (playerId === undefined) return;
    void runPlayerMutation({
      playerId,
      pendingLabel: `Adding ${player.player} to watchlist…`,
      successLabel: `${player.player} added to watchlist.`,
      failureLabel: `Failed to add ${player.player} to watchlist. Please try again.`,
      applyOptimistic: (prev) => ({ ...prev, watchlist: [...prev.watchlist, playerId] }),
      revertOptimistic: (prev) => ({
        ...prev,
        watchlist: prev.watchlist.filter((id) => id !== playerId),
      }),
      request: () =>
        fetch(`/api/draft/${draftId}/watchlist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId }),
        }),
    });
  };

  const removeFromWatchlist = (playerId: number) => {
    void runPlayerMutation({
      playerId,
      pendingLabel: 'Removing from watchlist…',
      successLabel: 'Removed from watchlist.',
      failureLabel: 'Failed to remove from watchlist. Please try again.',
      applyOptimistic: (prev) => ({
        ...prev,
        watchlist: prev.watchlist.filter((id) => id !== playerId),
      }),
      revertOptimistic: (prev) => ({ ...prev, watchlist: [...prev.watchlist, playerId] }),
      request: () =>
        fetch(`/api/draft/${draftId}/watchlist`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId }),
        }),
    });
  };

  const nominatePlayer = async (player: Player) => {
    const playerId = player.id;
    if (playerId === undefined) return;
    const ok = await runPlayerMutation({
      playerId,
      pendingLabel: `Nominating ${player.player}…`,
      successLabel: `${player.player} nominated.`,
      failureLabel: `Failed to nominate ${player.player}. Please try again.`,
      applyOptimistic: (prev) => ({ ...prev, nominated: [...prev.nominated, playerId] }),
      revertOptimistic: (prev) => ({
        ...prev,
        nominated: prev.nominated.filter((id) => id !== playerId),
      }),
      request: () =>
        fetch(`/api/draft/${draftId}/nominated`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId }),
        }),
    });
    if (ok) await recordPlayerNominated(player.player);
  };

  const unNominatePlayer = (playerId: number) => {
    void runPlayerMutation({
      playerId,
      pendingLabel: 'Removing from in auction…',
      successLabel: 'Removed from in auction.',
      failureLabel: 'Failed to remove from in auction. Please try again.',
      applyOptimistic: (prev) => ({
        ...prev,
        nominated: prev.nominated.filter((id) => id !== playerId),
      }),
      revertOptimistic: (prev) => ({ ...prev, nominated: [...prev.nominated, playerId] }),
      request: () =>
        fetch(`/api/draft/${draftId}/nominated`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId }),
        }),
    });
  };

  if (!data) {
    return (
      <div
        data-onboarding-nomination-state={draftError ? 'error' : 'loading'}
        data-testid="nomination-helper-state"
        className="flex h-[400px] items-center justify-center text-muted-foreground"
      >
        {draftError ?? 'Loading nomination data...'}
      </div>
    );
  }

  const hasAuctionData = data.auctionResults.length > 0;
  const bestNomination = scored[0] ?? null;
  const maxPressure = scored.reduce(
    (max, player) => Math.max(max, Math.round(player.nominationScore)),
    0,
  );

  return (
    <div
      data-testid="nomination-helper-layout"
      data-onboarding-nomination-state="ready"
      className="flex min-h-screen flex-col bg-background text-foreground md:flex-row"
    >
      <MutationStatus message={mutationStatus} />
      <WatchlistSidebar
        players={players}
        nominated={data.nominated}
        watchlist={data.watchlist}
        wonIds={wonIds}
        pendingIds={pendingIds}
        onAddToWatchlist={addToWatchlist}
        onRemoveFromWatchlist={(playerId) => {
          if (typeof playerId === 'number') removeFromWatchlist(playerId);
        }}
        onUnNominate={(playerId) => {
          if (typeof playerId === 'number') unNominatePlayer(playerId);
        }}
        onboardingSubjectPlayerName={isReadOnly ? null : (progress?.subjectPlayerName ?? null)}
        isReadOnly={isReadOnly}
      />

      <div className="min-w-0 flex-1 overflow-x-auto px-5 pt-4 pb-10">
        {isReadOnly ? <DraftReadOnlyBanner /> : null}
        <div
          data-onboarding-target={isReadOnly ? undefined : 'nominate-intro'}
          className="mb-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-stretch"
        >
          <section className="rounded-lg border border-border-subtle bg-card px-4 py-3">
            <div className="font-label mb-1 text-[10px] tracking-[2.5px] text-muted-foreground uppercase">
              Live Workbench
            </div>
            <h1 className="font-label m-0 text-2xl leading-none font-bold tracking-tight text-foreground">
              Nomination Helper
            </h1>
            <div className="mt-1.5 text-[11px] text-secondary-fg">
              Find nominations that pull money from rival builds.
            </div>
          </section>

          <section className="grid min-w-full grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[720px]">
            <NominationMetric
              label="Best Nomination"
              value={bestNomination?.player.player ?? '—'}
              detail={
                bestNomination
                  ? `${bestNomination.player.pos} · ${Math.round(
                      bestNomination.nominationScore,
                    ).toLocaleString()} pressure`
                  : undefined
              }
              tone="primary"
            />
            <NominationMetric label="Live Nominations" value={data.nominated.length} />
            <NominationMetric label="Watchlist" value={data.watchlist.length} />
            <NominationMetric
              label="Rival Pressure"
              value={maxPressure.toLocaleString()}
              detail="Top visible score"
            />
          </section>
        </div>

        <NominationTable
          scored={scored}
          posFilter={posFilter}
          onPosFilterChange={setPosFilter}
          hasAuctionData={hasAuctionData}
          pendingIds={pendingIds}
          onWatch={addToWatchlist}
          onNominate={nominatePlayer}
          isReadOnly={isReadOnly}
        />
      </div>
    </div>
  );
}

interface NominationMetricProps {
  label: string;
  value: number | string;
  detail?: string;
  tone?: 'primary';
}

function NominationMetric({ label, value, detail, tone }: NominationMetricProps) {
  return (
    <div className="rounded-lg border border-border-subtle bg-card px-3 py-3">
      <div className="font-label text-[10px] tracking-[1.7px] text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className="mt-1 truncate font-mono text-xl font-bold text-foreground tabular-nums"
        style={{ color: tone === 'primary' ? 'var(--primary)' : undefined }}
      >
        {value}
      </div>
      {detail && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{detail}</div>}
    </div>
  );
}
