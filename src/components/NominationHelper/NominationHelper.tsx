'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Player, Position, TeamStats, AuctionResultEntry } from '@/types';
import { computeNominationScores, type ScoredPlayer } from '@/lib/nominationScoring';
import { useOnboarding } from '@/components/Onboarding/OnboardingContext';
import WatchlistSidebar from './WatchlistSidebar';
import NominationTable from './NominationTable';

interface NomData {
  teamStats: TeamStats[];
  auctionResults: AuctionResultEntry[];
  watchlist: string[];
  nominated: string[];
  ownerHandle: string | null;
  targetRoster: Partial<Record<Position, number>>;
}

interface NominationHelperProps {
  draftId: number;
  players: Player[];
}

export default function NominationHelper({ draftId, players }: NominationHelperProps) {
  const router = useRouter();
  const { progress, recordPlayerNominated } = useOnboarding();
  const [data, setData] = useState<NomData | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [posFilter, setPosFilter] = useState<'ALL' | Position>('ALL');

  useEffect(() => {
    async function fetchData() {
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
        if (res.ok) setData(await res.json());
      } catch {
        // silent — show stale data
      }
    }
    void fetchData();
    const interval = setInterval(() => void fetchData(), 30_000);
    return () => clearInterval(interval);
  }, [router, draftId]);

  const wonNames = useMemo(() => new Set(data?.auctionResults.map((r) => r.player) ?? []), [data]);

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

  const addToWatchlist = async (playerName: string) => {
    const snapshot = data;
    setData((prev) => (prev ? { ...prev, watchlist: [...prev.watchlist, playerName] } : prev));
    const res = await fetch(`/api/draft/${draftId}/watchlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName }),
    });
    if (!res.ok) {
      if (res.status === 401) {
        router.replace('/sign-in');
        return;
      }
      setData(snapshot);
    }
  };

  const removeFromWatchlist = async (playerName: string) => {
    const snapshot = data;
    setData((prev) =>
      prev ? { ...prev, watchlist: prev.watchlist.filter((n) => n !== playerName) } : prev,
    );
    const res = await fetch(`/api/draft/${draftId}/watchlist`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName }),
    });
    if (!res.ok) {
      if (res.status === 401) {
        router.replace('/sign-in');
        return;
      }
      setData(snapshot);
    }
  };

  const nominatePlayer = async (playerName: string) => {
    const snapshot = data;
    setData((prev) => (prev ? { ...prev, nominated: [...prev.nominated, playerName] } : prev));
    const res = await fetch(`/api/draft/${draftId}/nominated`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName }),
    });
    if (!res.ok) {
      if (res.status === 401) {
        router.replace('/sign-in');
        return;
      }
      setData(snapshot);
      return;
    }
    await recordPlayerNominated(playerName);
  };

  const unNominatePlayer = async (playerName: string) => {
    const snapshot = data;
    setData((prev) =>
      prev ? { ...prev, nominated: prev.nominated.filter((n) => n !== playerName) } : prev,
    );
    const res = await fetch(`/api/draft/${draftId}/nominated`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName }),
    });
    if (!res.ok) {
      if (res.status === 401) {
        router.replace('/sign-in');
        return;
      }
      setData(snapshot);
    }
  };

  if (!data) {
    return (
      <div className="flex h-[400px] items-center justify-center text-muted-foreground">
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
      className="flex min-h-screen flex-col bg-background text-foreground md:flex-row"
    >
      <WatchlistSidebar
        players={players}
        nominated={data.nominated}
        watchlist={data.watchlist}
        wonNames={wonNames}
        onAddToWatchlist={addToWatchlist}
        onRemoveFromWatchlist={removeFromWatchlist}
        onUnNominate={unNominatePlayer}
        onboardingSubjectPlayerName={progress?.subjectPlayerName ?? null}
      />

      <div className="min-w-0 flex-1 overflow-x-auto px-5 pt-4 pb-10">
        <div
          data-onboarding-target="nominate-intro"
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
          onWatch={addToWatchlist}
          onNominate={nominatePlayer}
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
