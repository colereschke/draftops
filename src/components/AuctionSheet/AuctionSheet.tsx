// src/components/AuctionSheet/AuctionSheet.tsx
'use client';

import { useState, useMemo, useOptimistic, useTransition } from 'react';
import dynamic from 'next/dynamic';
import type { Player, Position, ClaimedBid, LeagueTeam, ScoringSettings } from '@/types';
import { logBid, updateBid, deleteBid } from '@/lib/actions';
import BidModal from '@/components/BidModal';
import { useOnboarding } from '@/components/Onboarding/OnboardingContext';
import AuctionHeader from './AuctionHeader';
import FilterControls, { type PositionFilter, type StrategyFilter } from './FilterControls';
import PlayerTable, { type SortKey } from './PlayerTable';

const SleeperRosterSyncDialog = dynamic(
  () => import('@/components/SleeperRosterSync/SleeperRosterSyncDialog'),
  { ssr: false },
);

type OptimisticAction =
  | { type: 'add'; bid: ClaimedBid }
  | { type: 'update'; bid: ClaimedBid }
  | { type: 'delete'; id: number };

interface AuctionSheetProps {
  players: Player[];
  claimedBids: ClaimedBid[];
  teams: LeagueTeam[];
  nominatedPlayers: Array<number | string>;
  draftId: number;
  ownerHandle: string | null;
  ownerBudget: number;
  scoringSettings: ScoringSettings;
  sleeperSyncConfigured?: boolean;
  sleeperLeagueId?: string | null;
}

export default function AuctionSheet({
  players,
  claimedBids,
  teams,
  nominatedPlayers,
  draftId,
  ownerHandle,
  ownerBudget,
  scoringSettings,
  sleeperSyncConfigured = false,
  sleeperLeagueId = null,
}: AuctionSheetProps) {
  const { progress, recordBidLogged } = useOnboarding();
  const [posFilter, setPosFilter] = useState<PositionFilter>('ALL');
  const [strategyFilter, setStrategyFilter] = useState<StrategyFilter>('ALL');
  const [search, setSearch] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortKey>('budget');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showNotes, setShowNotes] = useState<boolean>(false);
  const [availableOnly, setAvailableOnly] = useState<boolean>(false);
  const [modalPlayer, setModalPlayer] = useState<Player | null>(null);
  const [modalError, setModalError] = useState<string>('');
  const [, startTransition] = useTransition();
  const [extraNominated, setExtraNominated] = useState<Array<number | string>>([]);
  const [clearedNominations, setClearedNominations] = useState<Set<number | string>>(new Set());
  const [showSleeperSync, setShowSleeperSync] = useState<boolean>(false);

  const [optimisticBids, dispatchOptimistic] = useOptimistic<ClaimedBid[], OptimisticAction>(
    claimedBids,
    (state, action) => {
      if (action.type === 'add') return [...state, action.bid];
      if (action.type === 'update')
        return state.map((b) => (b.id === action.bid.id ? action.bid : b));
      if (action.type === 'delete') return state.filter((b) => b.id !== action.id);
      return state;
    },
  );

  const claimMap = useMemo(
    () => new Map(optimisticBids.map((b) => [bidIdentityKey(b), b])),
    [optimisticBids],
  );

  const nominatedSet = useMemo(
    () =>
      new Set(
        [...nominatedPlayers, ...extraNominated].filter(
          (playerId) => !clearedNominations.has(playerId),
        ),
      ),
    [nominatedPlayers, extraNominated, clearedNominations],
  );

  const futurePickYear = useMemo(
    () => players.find((p) => p.futurePickYear != null)?.futurePickYear ?? null,
    [players],
  );

  const hasStrategyTags = useMemo(() => players.some((p) => p.strategyTag != null), [players]);

  const mySpent = useMemo(() => {
    const myTeam = ownerHandle ? teams.find((t) => t.handle === ownerHandle) : null;
    if (!myTeam) return 0;
    return optimisticBids.filter((b) => b.teamId === myTeam.id).reduce((s, b) => s + b.price, 0);
  }, [teams, optimisticBids, ownerHandle]);

  const hasClaims = optimisticBids.length > 0 && !availableOnly;

  function handleModalSubmit({ price, teamId }: { price: number; teamId: number }) {
    if (!modalPlayer) return;
    const existingBid = claimMap.get(playerIdentityKey(modalPlayer));
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;
    setModalError('');

    if (existingBid) {
      const updated: ClaimedBid = { ...existingBid, price, teamId, teamHandle: team.handle };
      startTransition(async () => {
        dispatchOptimistic({ type: 'update', bid: updated });
        try {
          await updateBid({ id: existingBid.id, price, teamId, draftId });
          setModalPlayer(null);
        } catch (e) {
          if (e instanceof Error && e.message === 'Unauthorized') {
            window.location.href = '/sign-in';
          } else if (
            e instanceof Error &&
            (e.message === 'No draft found' || e.message === 'Team not found in draft')
          ) {
            setModalError('Draft not configured. Please check your setup.');
          } else {
            setModalError('Failed to save bid. Please try again.');
          }
        }
      });
    } else {
      if (modalPlayer.id === undefined) {
        setModalError('Player identity missing. Please refresh and try again.');
        return;
      }
      const playerId = modalPlayer.id;
      const tempBid: ClaimedBid = {
        id: -Date.now(),
        playerId,
        player: modalPlayer.player,
        position: modalPlayer.pos,
        price,
        teamId,
        teamHandle: team.handle,
      };
      startTransition(async () => {
        dispatchOptimistic({ type: 'add', bid: tempBid });
        try {
          await logBid({
            playerId,
            price,
            teamId,
            draftId,
          });
          setClearedNominations((previous) => new Set(previous).add(playerId));
          setExtraNominated((previous) =>
            previous.filter((nominatedId) => nominatedId !== playerId),
          );
          await recordBidLogged(modalPlayer.player);
          setModalPlayer(null);
        } catch (e) {
          if (e instanceof Error && e.message === 'Unauthorized') {
            window.location.href = '/sign-in';
          } else if (
            e instanceof Error &&
            (e.message === 'No draft found' || e.message === 'Team not found in draft')
          ) {
            setModalError('Draft not configured. Please check your setup.');
          } else {
            setModalError('Failed to log bid. Please try again.');
          }
        }
      });
    }
  }

  function handleModalDelete() {
    if (!modalPlayer) return;
    const existingBid = claimMap.get(playerIdentityKey(modalPlayer));
    if (!existingBid) return;
    setModalError('');
    startTransition(async () => {
      dispatchOptimistic({ type: 'delete', id: existingBid.id });
      try {
        await deleteBid({ id: existingBid.id, draftId });
        setModalPlayer(null);
      } catch (e) {
        if (e instanceof Error && e.message === 'Unauthorized') {
          window.location.href = '/sign-in';
        } else if (
          e instanceof Error &&
          (e.message === 'No draft found' || e.message === 'Team not found in draft')
        ) {
          setModalError('Draft not configured. Please check your setup.');
        } else {
          setModalError('Failed to remove bid. Please try again.');
        }
      }
    });
  }

  function handleNominate(player: Player) {
    const key = playerIdentityKey(player);
    if (typeof key !== 'number') return;
    setExtraNominated((prev) => [...prev, key]);
    void fetch(`/api/draft/${draftId}/nominated`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: key }),
    }).then((res) => {
      if (res.status === 401) {
        window.location.href = '/sign-in';
        return;
      }
      if (!res.ok) {
        setExtraNominated((prev) => prev.filter((n) => n !== key));
      }
    });
  }

  const remaining = ownerBudget - mySpent;

  const filtered = useMemo<Player[]>(() => {
    let data = [...players];
    if (posFilter !== 'ALL') data = data.filter((p) => p.pos === posFilter);
    if (availableOnly) data = data.filter((p) => !claimMap.has(playerIdentityKey(p)));
    if (strategyFilter !== 'ALL') data = data.filter((p) => p.strategyTag === strategyFilter);
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(
        (p) => p.player.toLowerCase().includes(q) || p.team.toLowerCase().includes(q),
      );
    }
    if (sortBy === 'spread') {
      data.sort((a, b) => {
        const aV = a.spread ?? null;
        const bV = b.spread ?? null;
        if (aV === null && bV === null) return a.sfRank - b.sfRank;
        if (aV === null) return 1; // nulls always last
        if (bV === null) return -1;
        if (aV !== bV) return sortDir === 'asc' ? aV - bV : bV - aV;
        return a.sfRank - b.sfRank;
      });
      return data;
    }
    if (sortBy === 'claimedPrice') {
      data.sort((a, b) => {
        const aV = claimMap.get(playerIdentityKey(a))?.price ?? null;
        const bV = claimMap.get(playerIdentityKey(b))?.price ?? null;
        // Unclaimed players have no bid price, so they sort as a group after every claimed
        // player, ordered among themselves by target value (budget) instead of sfRank.
        if (aV === null && bV === null) {
          if (a.budget !== b.budget)
            return sortDir === 'asc' ? a.budget - b.budget : b.budget - a.budget;
          return a.sfRank - b.sfRank;
        }
        if (aV === null) return 1;
        if (bV === null) return -1;
        if (aV !== bV) return sortDir === 'asc' ? aV - bV : bV - aV;
        return a.sfRank - b.sfRank;
      });
      return data;
    }
    data.sort((a, b) => {
      let aV: string | number | null = a[sortBy] as string | number | null;
      let bV: string | number | null = b[sortBy] as string | number | null;
      if (aV === null || aV === undefined) aV = 9999;
      if (bV === null || bV === undefined) bV = 9999;
      if (typeof aV === 'string') aV = aV.toLowerCase();
      if (typeof bV === 'string') bV = bV.toLowerCase();
      if (aV < bV) return sortDir === 'asc' ? -1 : 1;
      if (aV > bV) return sortDir === 'asc' ? 1 : -1;
      return a.sfRank - b.sfRank;
    });
    return data;
  }, [posFilter, search, availableOnly, strategyFilter, claimMap, sortBy, sortDir, players]);

  const handleSort = (col: SortKey) => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'sfRank' || col === 'player' ? 'asc' : 'desc');
    }
  };

  const posStats = useMemo(() => {
    const stats = {} as Record<'QB' | 'RB' | 'WR' | 'TE', { count: number; total: number }>;
    (['QB', 'RB', 'WR', 'TE'] as const).forEach((pos) => {
      const pp = players.filter((p) => p.pos === pos && !claimMap.has(playerIdentityKey(p)));
      stats[pos] = { count: pp.length, total: pp.reduce((s, p) => s + p.budget, 0) };
    });
    return stats;
  }, [claimMap, players]);

  const grandTotal = Object.values(posStats).reduce((s, v) => s + v.total, 0);
  const totalPlayerCount = players.filter(
    (p) => !(['PKG', 'PICK'] as Position[]).includes(p.pos),
  ).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div data-onboarding-target="value-sheet">
        <AuctionHeader
          ownerBudget={ownerBudget}
          mySpent={mySpent}
          remaining={remaining}
          posStats={posStats}
          grandTotal={grandTotal}
          totalPlayerCount={totalPlayerCount}
          scoringSettings={scoringSettings}
        />
        <FilterControls
          posFilter={posFilter}
          onPosFilterChange={setPosFilter}
          search={search}
          onSearchChange={setSearch}
          showNotes={showNotes}
          onShowNotesChange={setShowNotes}
          availableOnly={availableOnly}
          onAvailableOnlyChange={setAvailableOnly}
          resultCount={filtered.length}
          futurePickYear={futurePickYear}
          strategyFilter={strategyFilter}
          onStrategyFilterChange={setStrategyFilter}
          showStrategyFilter={hasStrategyTags}
          onOpenSleeperSync={() => setShowSleeperSync(true)}
        />
      </div>
      <div data-onboarding-target="bid-practice">
        <PlayerTable
          players={filtered}
          showNotes={showNotes}
          hasClaims={hasClaims}
          claimMap={claimMap}
          nominatedSet={nominatedSet}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={handleSort}
          onRowClick={setModalPlayer}
          onboardingSubjectPlayerName={progress?.subjectPlayerName}
        />
      </div>

      <div className="flex flex-wrap gap-4 border-t border-border-subtle px-5 py-2.5 text-[10px] text-muted-foreground/40">
        <span>
          Source: active target uses projection-shaped dynasty values when available · fallback uses
          adjusted ETR dynasty values
        </span>
        <span className="ml-auto">
          PKG target = {futurePickYear ?? 'future'} 1st+2nd+3rd package
        </span>
      </div>
      {modalPlayer && (
        <BidModal
          player={modalPlayer}
          teams={teams}
          existingBid={claimMap.get(playerIdentityKey(modalPlayer))}
          onClose={() => setModalPlayer(null)}
          onSubmit={handleModalSubmit}
          onDelete={claimMap.has(playerIdentityKey(modalPlayer)) ? handleModalDelete : undefined}
          serverError={modalError}
          isNominated={nominatedSet.has(playerIdentityKey(modalPlayer))}
          onNominate={() => handleNominate(modalPlayer)}
        />
      )}
      {showSleeperSync && (
        <SleeperRosterSyncDialog
          draftId={draftId}
          teams={teams}
          initiallyConfigured={sleeperSyncConfigured}
          sleeperLeagueId={sleeperLeagueId}
          onClose={() => setShowSleeperSync(false)}
        />
      )}
    </div>
  );
}

function playerIdentityKey(player: Player): number | string {
  return player.id ?? player.player;
}

function bidIdentityKey(bid: ClaimedBid): number | string {
  return bid.playerId ?? bid.player;
}
