'use client';

import { useMemo, useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteBid, logBid, updateBid } from '@/lib/actions';
import type { DraftMutationCode } from '@/lib/draftMutation';
import type { ClaimedBid, LeagueTeam, Player } from '@/types';
import { createClaimMap, getPlayerIdentityKey } from './auctionSelectors';

type OptimisticAction =
  | { type: 'add'; bid: ClaimedBid }
  | { type: 'update'; bid: ClaimedBid }
  | { type: 'delete'; id: number };

export interface UseAuctionBidMutationsOptions {
  claimedBids: ClaimedBid[];
  teams: LeagueTeam[];
  draftId: number;
  onCreateSuccess: (player: Player) => Promise<void>;
}

export interface BidSubmissionInput {
  price: number;
  teamId: number;
}

export interface UseAuctionBidMutationsResult {
  claimMap: Map<number | string, ClaimedBid>;
  isPending: boolean;
  modalError: string;
  mutationStatus: string;
  setMutationStatus: (message: string) => void;
  clearModalError: () => void;
  submitBid: (player: Player, input: BidSubmissionInput) => Promise<boolean>;
  deleteBidForPlayer: (player: Player) => Promise<boolean>;
}

export function useAuctionBidMutations({
  claimedBids,
  teams,
  draftId,
  onCreateSuccess,
}: UseAuctionBidMutationsOptions): UseAuctionBidMutationsResult {
  const router = useRouter();
  const [modalError, setModalError] = useState<string>('');
  const [mutationStatus, setMutationStatus] = useState<string>('');
  const [isPending, startTransition] = useTransition();
  const [optimisticBids, dispatchOptimistic] = useOptimistic<ClaimedBid[], OptimisticAction>(
    claimedBids,
    (state, action) => {
      if (action.type === 'add') return [...state, action.bid];
      if (action.type === 'update')
        return state.map((bid) => (bid.id === action.bid.id ? action.bid : bid));
      if (action.type === 'delete') return state.filter((bid) => bid.id !== action.id);
      return state;
    },
  );
  const claimMap = useMemo(() => createClaimMap(optimisticBids), [optimisticBids]);

  function clearModalError() {
    setModalError('');
  }

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

  function submitBid(player: Player, { price, teamId }: BidSubmissionInput): Promise<boolean> {
    if (isPending) return Promise.resolve(false);
    const existingBid = claimMap.get(getPlayerIdentityKey(player));
    const team = teams.find((candidate) => candidate.id === teamId);
    if (!team) return Promise.resolve(false);
    clearModalError();

    if (existingBid) {
      const updated: ClaimedBid = { ...existingBid, price, teamId, teamHandle: team.handle };
      return new Promise((resolve) => {
        startTransition(async () => {
          dispatchOptimistic({ type: 'update', bid: updated });
          setMutationStatus('Saving bid…');
          try {
            const result = await updateBid({ id: existingBid.id, price, teamId, draftId });
            if (!result.ok) {
              handleMutationFailure(result.code);
              resolve(false);
              return;
            }
            setMutationStatus('Bid saved.');
            resolve(true);
          } catch {
            setModalError('Failed to save bid. Please try again.');
            setMutationStatus('Failed to save bid. Please try again.');
            router.refresh();
            resolve(false);
          }
        });
      });
    }

    if (player.id === undefined) {
      setModalError('Player identity missing. Please refresh and try again.');
      return Promise.resolve(false);
    }
    const playerId = player.id;
    const tempBid: ClaimedBid = {
      id: -Date.now(),
      playerId,
      player: player.player,
      position: player.pos,
      price,
      teamId,
      teamHandle: team.handle,
    };
    return new Promise((resolve) => {
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
            resolve(false);
            return;
          }
          setMutationStatus('Bid saved.');
          await onCreateSuccess(player);
          resolve(true);
        } catch {
          setModalError('Failed to log bid. Please try again.');
          setMutationStatus('Failed to log bid. Please try again.');
          router.refresh();
          resolve(false);
        }
      });
    });
  }

  function deleteBidForPlayer(player: Player): Promise<boolean> {
    if (isPending) return Promise.resolve(false);
    const existingBid = claimMap.get(getPlayerIdentityKey(player));
    if (!existingBid) return Promise.resolve(false);
    clearModalError();
    return new Promise((resolve) => {
      startTransition(async () => {
        dispatchOptimistic({ type: 'delete', id: existingBid.id });
        setMutationStatus('Removing bid…');
        try {
          const result = await deleteBid({ id: existingBid.id, draftId });
          if (!result.ok) {
            handleMutationFailure(result.code);
            resolve(false);
            return;
          }
          setMutationStatus('Bid removed.');
          resolve(true);
        } catch {
          setModalError('Failed to remove bid. Please try again.');
          setMutationStatus('Failed to remove bid. Please try again.');
          router.refresh();
          resolve(false);
        }
      });
    });
  }

  return {
    claimMap,
    isPending,
    modalError,
    mutationStatus,
    setMutationStatus,
    clearModalError,
    submitBid,
    deleteBidForPlayer,
  };
}
