'use client';

import type { ClaimedBid, Player } from '@/types';
import { POS_COLORS } from '@/lib/posColors';
import { ageColor } from '@/lib/ageColor';
import { formatSpread, spreadColor } from '@/lib/valueSpread';
import { cn } from '@/lib/utils';
import { TableCell, TableRow } from '@/components/ui/table';

interface PlayerTableRowProps {
  player: Player;
  showNotes: boolean;
  hasClaims: boolean;
  claim: ClaimedBid | undefined;
  isNominated: boolean;
  onboardingSubjectPlayerName?: string | null;
  onRowClick: ((player: Player) => void) | undefined;
}

export default function PlayerTableRow({
  player,
  showNotes,
  hasClaims,
  claim,
  isNominated,
  onboardingSubjectPlayerName,
  onRowClick,
}: PlayerTableRowProps) {
  const c = POS_COLORS[player.pos];
  const isRookie = player.notes.toLowerCase().includes('rookie');
  const isPkg = player.pos === 'PKG';
  const isOnboardingUndoTarget =
    claim !== undefined && onboardingSubjectPlayerName === player.player;
  const playerNameStyle = {
    fontWeight: isPkg ? 700 : 600,
    color: claim ? 'var(--text-secondary)' : isPkg ? 'var(--pos-pkg)' : 'var(--text-primary)',
  };

  return (
    <TableRow
      data-testid={
        isOnboardingUndoTarget
          ? `onboarding-bid-undo-${player.player}`
          : `player-row-${player.sfRank}`
      }
      data-onboarding-target={isOnboardingUndoTarget ? 'bid-undo' : undefined}
      title={
        isOnboardingUndoTarget
          ? 'Reopen this player and use Remove in the bid modal to undo this bid.'
          : undefined
      }
      onClick={onRowClick ? () => onRowClick(player) : undefined}
      className={cn(
        'border-b-border-subtle hover:bg-card',
        onRowClick && 'cursor-pointer',
        claim && 'bg-background',
        !claim && isNominated && 'bg-[color-mix(in_srgb,var(--pos-pick)_9%,transparent)]',
        !claim && !isNominated && 'even:bg-card/45',
      )}
      style={{
        borderLeft: `3px solid ${isNominated ? 'var(--pos-pick)' : c.accent}`,
      }}
    >
      <TableCell
        className={cn(
          'text-center font-mono text-[11px] text-muted-foreground tabular-nums',
          claim && 'text-muted-foreground',
        )}
      >
        {player.sfRank}
      </TableCell>
      <TableCell className="text-left">
        <div className="flex items-center gap-1.5">
          {onRowClick ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onRowClick(player);
              }}
              aria-label={`Open bid modal for ${player.player}`}
              className="cursor-pointer rounded-sm border-0 bg-transparent p-0 text-left text-[13px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              style={playerNameStyle}
            >
              {player.player}
            </button>
          ) : (
            <span className="text-[13px]" style={playerNameStyle}>
              {player.player}
            </span>
          )}
          {isRookie && (
            <span
              className="rounded-[3px] px-1 py-px text-[8px] font-bold tracking-wide uppercase"
              style={{ background: '#172719', color: 'var(--age-young)' }}
            >
              R
            </span>
          )}
          {isPkg && (
            <span
              className="rounded-[3px] px-1 py-px text-[8px] font-bold tracking-wide uppercase"
              style={{ background: POS_COLORS.PKG.bg, color: POS_COLORS.PKG.accent }}
            >
              PKG
            </span>
          )}
          {isNominated && (
            <span
              className="rounded-[3px] px-1 py-px text-[8px] font-bold tracking-wide uppercase"
              style={{ background: POS_COLORS.PICK.bg, color: 'var(--pos-pick)' }}
            >
              LIVE
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-center">
        <span
          className="font-label inline-block rounded text-[9px] font-bold tracking-wide"
          style={{ background: c.badge, color: c.badgeText, padding: '2px 6px' }}
        >
          {player.pos}
        </span>
      </TableCell>
      <TableCell
        className={cn(
          'text-center text-[11px] text-secondary-fg',
          claim && 'text-muted-foreground',
        )}
      >
        {player.team}
      </TableCell>
      <TableCell
        className={cn(
          'text-center font-mono text-[11px] tabular-nums',
          claim && 'text-secondary-fg',
        )}
        style={{ color: claim ? undefined : ageColor(player.age, player.pos) }}
      >
        {player.age !== null ? player.age.toFixed(1) : '—'}
      </TableCell>
      <TableCell
        className={cn(
          'text-center font-mono text-xs text-secondary-fg tabular-nums',
          claim && 'text-muted-foreground',
        )}
      >
        ${player.floor}
      </TableCell>
      <TableCell
        className={cn(
          'text-center font-mono text-sm font-bold tabular-nums',
          claim && 'text-secondary-fg',
        )}
        style={{ color: claim ? 'var(--text-secondary)' : 'var(--primary)' }}
      >
        ${player.budget}
        {player.dynamicPickValue && player.dynamicPickValue.direction !== 'flat' && (
          <span
            data-testid={`dynamic-pick-value-${player.sfRank}`}
            title={`Baseline $${player.dynamicPickValue.baseline} · Adjusted $${player.dynamicPickValue.adjusted}`}
            className="ml-1 font-mono text-[10px] tabular-nums"
            style={{
              color:
                player.dynamicPickValue.direction === 'up' ? 'var(--age-young)' : 'var(--age-old)',
            }}
          >
            {player.dynamicPickValue.adjustment > 0
              ? `+$${player.dynamicPickValue.adjustment}`
              : `-$${Math.abs(player.dynamicPickValue.adjustment)}`}
          </span>
        )}
      </TableCell>
      <TableCell
        className={cn(
          'text-center font-mono text-xs tabular-nums',
          claim && 'text-muted-foreground',
        )}
        style={{ color: claim ? 'var(--text-muted)' : 'var(--text-secondary)' }}
      >
        ${player.ceiling}
      </TableCell>
      <TableCell
        data-testid={`spread-${player.sfRank}`}
        className={cn(
          'text-center font-mono text-xs tabular-nums',
          claim && 'text-muted-foreground',
        )}
        style={{ color: claim ? undefined : spreadColor(player.spread) }}
      >
        {player.spread == null ? '—' : formatSpread(player.spread)}
      </TableCell>
      {showNotes && (
        <TableCell className="max-w-[220px] whitespace-normal text-[10px] text-muted-foreground">
          {player.notes || '—'}
        </TableCell>
      )}
      {hasClaims &&
        (claim ? (
          <TableCell className="text-left whitespace-nowrap">
            <span className="text-[11px] text-secondary-fg">{claim.teamHandle}</span>
            <span className="ml-1 font-mono text-[11px] text-secondary-fg tabular-nums">
              ${claim.price}
            </span>
            <span
              className="ml-1 font-mono text-[10px] tabular-nums"
              style={{
                color:
                  claim.price - player.budget > 0
                    ? 'var(--age-old)'
                    : claim.price - player.budget < 0
                      ? 'var(--age-young)'
                      : 'var(--text-muted)',
              }}
            >
              {claim.price - player.budget > 0
                ? `▲$${claim.price - player.budget}`
                : claim.price - player.budget < 0
                  ? `▼$${Math.abs(claim.price - player.budget)}`
                  : '='}
            </span>
          </TableCell>
        ) : (
          <TableCell />
        ))}
    </TableRow>
  );
}
