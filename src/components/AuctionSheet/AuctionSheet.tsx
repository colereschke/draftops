// src/components/AuctionSheet/AuctionSheet.tsx
'use client';

import { useState, useMemo, useOptimistic, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Player, ClaimedBid, LeagueTeam, ScoringSettings, StartingSlot } from '@/types';
import { logBid, updateBid, deleteBid } from '@/lib/actions';
import BidModal from '@/components/BidModal';
import { useOnboarding } from '@/components/Onboarding/OnboardingContext';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useUrlQuerySync } from '@/lib/useUrlQuerySync';
import AuctionHeader from './AuctionHeader';
import FilterControls, { type PositionFilter, type StrategyFilter } from './FilterControls';
import PlayerTable, { type SortKey } from './PlayerTable';
import DraftReadOnlyBanner from '@/components/DraftReadOnlyBanner';
import MutationStatus from '@/components/MutationStatus';
import BidHistoryPanel, { type DeletedBid } from '@/components/BidHistory/BidHistoryPanel';
import type { DraftMutationCode } from '@/lib/draftMutation';
import { parseAuctionSheetSearchParams, buildAuctionSheetQueryString } from './urlState';
import {
  createClaimMap,
  createNominatedSet,
  getAuctionMetrics,
  getPlayerIdentityKey,
  selectAuctionPlayers,
} from './auctionSelectors';

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
  const searchParams = useSearchParams();
  const initialUrlState = parseAuctionSheetSearchParams(searchParams);
  const [posFilter, setPosFilter] = useState<PositionFilter>(initialUrlState.posFilter);
  const [strategyFilter, setStrategyFilter] = useState<StrategyFilter>(
    initialUrlState.strategyFilter,
  );
  const [search, setSearch] = useState<string>(initialUrlState.search);
  const [sortBy, setSortBy] = useState<SortKey>(initialUrlState.sortBy);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialUrlState.sortDir);
  const [showNotes, setShowNotes] = useState<boolean>(false);
  const [availableOnly, setAvailableOnly] = useState<boolean>(initialUrlState.availableOnly);
  const [modalPlayer, setModalPlayer] = useState<Player | null>(null);
  const [modalError, setModalError] = useState<string>('');
  const [mutationStatus, setMutationStatus] = useState<string>('');
  const [isPending, startTransition] = useTransition();
  const [nominatingIds, setNominatingIds] = useState<Set<number>>(new Set());
  const [extraNominated, setExtraNominated] = useState<Array<number | string>>([]);
  const [clearedNominations, setClearedNominations] = useState<Set<number | string>>(new Set());
  const [showSleeperSync, setShowSleeperSync] = useState<boolean>(false);

  const debouncedSearch = useDebouncedValue(search, 400);
  const urlQuery = useMemo(
    () =>
      buildAuctionSheetQueryString({
        posFilter,
        strategyFilter,
        search: debouncedSearch,
        sortBy,
        sortDir,
        availableOnly,
      }),
    [posFilter, strategyFilter, debouncedSearch, sortBy, sortDir, availableOnly],
  );
  useUrlQuerySync(urlQuery);

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

  const claimMap = useMemo(() => createClaimMap(optimisticBids), [optimisticBids]);

  const nominatedSet = useMemo(
    () => createNominatedSet(nominatedPlayers, extraNominated, clearedNominations),
    [nominatedPlayers, extraNominated, clearedNominations],
  );

  const hasStrategyTags = useMemo(() => players.some((p) => p.strategyTag != null), [players]);

  const { mySpent, posStats, grandTotal, totalPlayerCount, futurePickYear } = useMemo(
    () => getAuctionMetrics(players, claimMap, teams, ownerHandle),
    [players, claimMap, teams, ownerHandle],
  );

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
    const existingBid = claimMap.get(getPlayerIdentityKey(modalPlayer));
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
    const existingBid = claimMap.get(getPlayerIdentityKey(modalPlayer));
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
    const key = getPlayerIdentityKey(player);
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

  const filtered = useMemo(
    () =>
      selectAuctionPlayers({
        players,
        claimMap,
        posFilter,
        strategyFilter,
        hasStrategyTags,
        search,
        availableOnly,
        sortBy,
        sortDir,
      }),
    [
      players,
      claimMap,
      posFilter,
      strategyFilter,
      hasStrategyTags,
      search,
      availableOnly,
      sortBy,
      sortDir,
    ],
  );

  const handleSort = (col: SortKey) => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'sfRank' || col === 'player' ? 'asc' : 'desc');
    }
  };

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-background text-foreground">
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
          existingBid={claimMap.get(getPlayerIdentityKey(modalPlayer))}
          onClose={() => setModalPlayer(null)}
          onSubmit={handleModalSubmit}
          onDelete={claimMap.has(getPlayerIdentityKey(modalPlayer)) ? handleModalDelete : undefined}
          serverError={modalError}
          isSubmitting={isPending}
          isNominated={nominatedSet.has(getPlayerIdentityKey(modalPlayer))}
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
    </main>
  );
}
