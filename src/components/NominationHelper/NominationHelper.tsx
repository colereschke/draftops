'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Player, Position, TeamStats, AuctionResultEntry } from '@/types';
import { computeNominationScores, type ScoredPlayer } from '@/lib/nominationScoring';
import WatchlistSidebar from './WatchlistSidebar';
import NominationTable from './NominationTable';

interface NomData {
  teamStats: TeamStats[];
  auctionResults: AuctionResultEntry[];
  watchlist: string[];
  nominated: string[];
  ownerHandle: string | null;
}

interface NominationHelperProps {
  draftId: number;
  players: Player[];
}

export default function NominationHelper({ draftId, players }: NominationHelperProps) {
  const router = useRouter();
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
    }
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

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <WatchlistSidebar
        players={players}
        nominated={data.nominated}
        watchlist={data.watchlist}
        wonNames={wonNames}
        onAddToWatchlist={addToWatchlist}
        onRemoveFromWatchlist={removeFromWatchlist}
        onUnNominate={unNominatePlayer}
      />

      <div className="flex-1 overflow-x-auto px-5 pt-4 pb-10">
        <div className="mb-3.5">
          <div className="font-label mb-0.5 text-[10px] tracking-[3px] text-muted-foreground uppercase">
            Nomination Helper
          </div>
          <div className="text-xs text-muted-foreground">
            Players ranked by how much nominating them will drain rival budgets
          </div>
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
