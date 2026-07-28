// src/components/AuctionSheet/AuctionSheet.tsx
'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Player, ClaimedBid, LeagueTeam, ScoringSettings, StartingSlot } from '@/types';
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
import { parseAuctionSheetSearchParams, buildAuctionSheetQueryString } from './urlState';
import { useAuctionBidMutations } from './useAuctionBidMutations';
import {
  createNominatedSet,
  getAuctionMetrics,
  getPlayerIdentityKey,
  selectAuctionPlayers,
} from './auctionSelectors';

const SleeperRosterSyncDialog = dynamic(
  () => import('@/components/SleeperRosterSync/SleeperRosterSyncDialog'),
  { ssr: false },
);

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
  const [nominatingIds, setNominatingIds] = useState<Set<number>>(new Set());
  const [extraNominated, setExtraNominated] = useState<Array<number | string>>([]);
  const [clearedNominations, setClearedNominations] = useState<Set<number | string>>(new Set());
  const [showSleeperSync, setShowSleeperSync] = useState<boolean>(false);
  const {
    claimMap,
    isPending,
    modalError,
    mutationStatus,
    setMutationStatus,
    submitBid,
    deleteBidForPlayer,
  } = useAuctionBidMutations({
    claimedBids,
    teams,
    draftId,
    onCreateSuccess: async (player) => {
      if (player.id !== undefined) {
        setClearedNominations((previous) => new Set(previous).add(player.id as number));
        setExtraNominated((previous) =>
          previous.filter((nominatedId) => nominatedId !== player.id),
        );
      }
      await recordBidLogged(player.player);
      setModalPlayer(null);
    },
  });

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

  const nominatedSet = useMemo(
    () => createNominatedSet(nominatedPlayers, extraNominated, clearedNominations),
    [nominatedPlayers, extraNominated, clearedNominations],
  );

  const hasStrategyTags = useMemo(() => players.some((p) => p.strategyTag != null), [players]);

  const { mySpent, posStats, grandTotal, totalPlayerCount, futurePickYear } = useMemo(
    () => getAuctionMetrics(players, claimMap, teams, ownerHandle),
    [players, claimMap, teams, ownerHandle],
  );

  const hasClaims = claimMap.size > 0 && !availableOnly;

  function handleModalSubmit({ price, teamId }: { price: number; teamId: number }) {
    if (!modalPlayer || isPending) return;
    const player = modalPlayer;
    const isEditing = claimMap.has(getPlayerIdentityKey(player));
    void submitBid(player, { price, teamId }).then((saved) => {
      if (saved && isEditing) setModalPlayer(null);
    });
  }

  function handleModalDelete() {
    if (!modalPlayer || isPending) return;
    const player = modalPlayer;
    void deleteBidForPlayer(player).then((removed) => {
      if (removed) setModalPlayer(null);
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
