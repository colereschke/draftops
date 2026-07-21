// src/components/AuctionSheet/AuctionSheet.tsx
'use client';

import { useState, useMemo, useOptimistic, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type {
  Player,
  Position,
  ClaimedBid,
  LeagueTeam,
  ScoringSettings,
  StartingSlot,
} from '@/types';
import { logBid, updateBid, deleteBid } from '@/lib/actions';
import BidModal from '@/components/BidModal';
import { useOnboarding } from '@/components/Onboarding/OnboardingContext';
import AuctionHeader from './AuctionHeader';
import FilterControls, { type PositionFilter, type StrategyFilter } from './FilterControls';
import PlayerTable, { type SortKey } from './PlayerTable';
import DraftReadOnlyBanner from '@/components/DraftReadOnlyBanner';
import MutationStatus from '@/components/MutationStatus';
import BidHistoryPanel, { type DeletedBid } from '@/components/BidHistory/BidHistoryPanel';
import type { DraftMutationCode } from '@/lib/draftMutation';

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
  teamCount: number;
  budget: number;
  rosterSize: number;
  startingLineup: StartingSlot[];
  sleeperSyncConfigured?: boolean;
  sleeperLeagueId?: string | null;
  isReadOnly?: boolean;
  deletedBids?: DeletedBid[];
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
  teamCount,
  budget,
  rosterSize,
  startingLineup,
  sleeperSyncConfigured = false,
  sleeperLeagueId = null,
  isReadOnly = false,
  deletedBids = [],
}: AuctionSheetProps) {
  const router = useRouter();
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
  const [mutationStatus, setMutationStatus] = useState<string>('');
  const [isPending, startTransition] = useTransition();
  const [nominatingIds, setNominatingIds] = useState<Set<number>>(new Set());
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

  function handleMutationFailure(code: DraftMutationCode) {
    if (code === 'UNAUTHORIZED') {
      window.location.href = '/sign-in';
      return;
    }
    const messages: Partial<Record<DraftMutationCode, string>> = {
      INVALID_INPUT: 'Use positive whole-dollar prices and valid draft records.',
      NOT_FOUND: 'Draft not configured. Please check your setup.',
      DRAFT_COMPLETE: 'This draft is complete and now read-only. Refresh to view final results.',
      TEAM_NOT_FOUND: 'That team is not part of this draft.',
      PLAYER_NOT_FOUND: 'That player is not part of this draft.',
      BID_NOT_FOUND: 'That bid no longer exists. Refresh to see the latest results.',
      PLAYER_ALREADY_CLAIMED: 'That player has already been won by another team.',
      ROSTER_FULL: 'That team has no open roster spots for another player.',
      BID_EXCEEDS_MAX: 'This bid must leave at least $1 for every open roster spot.',
    };
    const message = messages[code] ?? 'Unable to save this bid. Please try again.';
    setModalError(message);
    setMutationStatus(message);
    router.refresh();
  }

  function handleModalSubmit({ price, teamId }: { price: number; teamId: number }) {
    if (!modalPlayer || isPending) return;
    const existingBid = claimMap.get(playerIdentityKey(modalPlayer));
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;
    setModalError('');

    if (existingBid) {
      const updated: ClaimedBid = { ...existingBid, price, teamId, teamHandle: team.handle };
      startTransition(async () => {
        dispatchOptimistic({ type: 'update', bid: updated });
        setMutationStatus('Saving bid…');
        try {
          const result = await updateBid({ id: existingBid.id, price, teamId, draftId });
          if (!result.ok) {
            handleMutationFailure(result.code);
            return;
          }
          setMutationStatus('Bid saved.');
          setModalPlayer(null);
        } catch {
          setModalError('Failed to save bid. Please try again.');
          setMutationStatus('Failed to save bid. Please try again.');
          router.refresh();
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
        setMutationStatus('Saving bid…');
        try {
          const result = await logBid({
            playerId,
            price,
            teamId,
            draftId,
          });
          if (!result.ok) {
            handleMutationFailure(result.code);
            return;
          }
          setMutationStatus('Bid saved.');
          setClearedNominations((previous) => new Set(previous).add(playerId));
          setExtraNominated((previous) =>
            previous.filter((nominatedId) => nominatedId !== playerId),
          );
          await recordBidLogged(modalPlayer.player);
          setModalPlayer(null);
        } catch {
          setModalError('Failed to log bid. Please try again.');
          setMutationStatus('Failed to log bid. Please try again.');
          router.refresh();
        }
      });
    }
  }

  function handleModalDelete() {
    if (!modalPlayer || isPending) return;
    const existingBid = claimMap.get(playerIdentityKey(modalPlayer));
    if (!existingBid) return;
    setModalError('');
    startTransition(async () => {
      dispatchOptimistic({ type: 'delete', id: existingBid.id });
      setMutationStatus('Removing bid…');
      try {
        const result = await deleteBid({ id: existingBid.id, draftId });
        if (!result.ok) {
          handleMutationFailure(result.code);
          return;
        }
        setMutationStatus('Bid removed.');
        setModalPlayer(null);
      } catch {
        setModalError('Failed to remove bid. Please try again.');
        setMutationStatus('Failed to remove bid. Please try again.');
        router.refresh();
      }
    });
  }

  function handleNominate(player: Player) {
    const key = playerIdentityKey(player);
    if (typeof key !== 'number' || nominatingIds.has(key)) return;
    setNominatingIds((prev) => new Set(prev).add(key));
    setExtraNominated((prev) => [...prev, key]);
    setMutationStatus('Nominating player…');
    fetch(`/api/draft/${draftId}/nominated`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: key }),
    })
      .then((res) => {
        if (res.status === 401) {
          window.location.href = '/sign-in';
          return;
        }
        if (!res.ok) {
          setExtraNominated((prev) => prev.filter((n) => n !== key));
          setMutationStatus('Failed to nominate player. Please try again.');
          router.refresh();
          return;
        }
        setMutationStatus('Player nominated.');
      })
      .catch(() => {
        setExtraNominated((prev) => prev.filter((n) => n !== key));
        setMutationStatus('Failed to nominate player. Please try again.');
        router.refresh();
      })
      .finally(() =>
        setNominatingIds((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        }),
      );
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
      <MutationStatus message={mutationStatus} />
      {isReadOnly ? <DraftReadOnlyBanner /> : null}
      <div data-onboarding-target="value-sheet">
        <AuctionHeader
          ownerBudget={ownerBudget}
          mySpent={mySpent}
          remaining={remaining}
          posStats={posStats}
          grandTotal={grandTotal}
          totalPlayerCount={totalPlayerCount}
          scoringSettings={scoringSettings}
          teamCount={teamCount}
          budget={budget}
          rosterSize={rosterSize}
          startingLineup={startingLineup}
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
          onOpenSleeperSync={isReadOnly ? undefined : () => setShowSleeperSync(true)}
        />
      </div>
      <div data-onboarding-target={isReadOnly ? undefined : 'bid-practice'}>
        <PlayerTable
          players={filtered}
          showNotes={showNotes}
          hasClaims={hasClaims}
          claimMap={claimMap}
          nominatedSet={nominatedSet}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={handleSort}
          onRowClick={isReadOnly ? undefined : setModalPlayer}
          onboardingSubjectPlayerName={isReadOnly ? null : progress?.subjectPlayerName}
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
      <BidHistoryPanel draftId={draftId} deletedBids={deletedBids} isReadOnly={isReadOnly} />
      {!isReadOnly && modalPlayer ? (
        <BidModal
          player={modalPlayer}
          teams={teams}
          existingBid={claimMap.get(playerIdentityKey(modalPlayer))}
          onClose={() => setModalPlayer(null)}
          onSubmit={handleModalSubmit}
          onDelete={claimMap.has(playerIdentityKey(modalPlayer)) ? handleModalDelete : undefined}
          serverError={modalError}
          isSubmitting={isPending}
          isNominated={nominatedSet.has(playerIdentityKey(modalPlayer))}
          onNominate={() => handleNominate(modalPlayer)}
        />
      ) : null}
      {!isReadOnly && showSleeperSync ? (
        <SleeperRosterSyncDialog
          draftId={draftId}
          teams={teams}
          initiallyConfigured={sleeperSyncConfigured}
          sleeperLeagueId={sleeperLeagueId}
          onClose={() => setShowSleeperSync(false)}
        />
      ) : null}
    </div>
  );
}

function playerIdentityKey(player: Player): number | string {
  return player.id ?? player.player;
}

function bidIdentityKey(bid: ClaimedBid): number | string {
  return bid.playerId ?? bid.player;
}
