import type { FuturePickAuctionMode } from '@/types';

export const FUTURE_PICK_AUCTION_MODES = ['packages', 'individual', 'none'] as const;

export function isFuturePickAuctionMode(value: unknown): value is FuturePickAuctionMode {
  return (
    typeof value === 'string' && FUTURE_PICK_AUCTION_MODES.includes(value as FuturePickAuctionMode)
  );
}
