'use client';

import type { ClaimedBid, Player } from '@/types';
import { Table, TableBody } from '@/components/ui/table';
import PlayerTableHeader from './PlayerTableHeader';
import PlayerTableRow from './PlayerTableRow';

export type SortKey = keyof Player | 'claimedPrice';

interface PlayerTableProps {
  players: Player[];
  showNotes: boolean;
  hasClaims: boolean;
  claimMap: Map<number | string, ClaimedBid>;
  nominatedSet: Set<number | string>;
  sortBy: SortKey;
  sortDir: 'asc' | 'desc';
  onboardingSubjectPlayerName?: string | null;
  onSort: (col: SortKey) => void;
  onRowClick?: (player: Player) => void;
}

export default function PlayerTable({
  players,
  showNotes,
  hasClaims,
  claimMap,
  nominatedSet,
  sortBy,
  sortDir,
  onboardingSubjectPlayerName,
  onSort,
  onRowClick,
}: PlayerTableProps) {
  return (
    <div className="overflow-x-auto px-5 pb-10">
      <Table className="mt-1.5 border-separate border-spacing-0">
        <PlayerTableHeader
          showNotes={showNotes}
          hasClaims={hasClaims}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={onSort}
        />
        <TableBody>
          {players.map((player) => {
            const key = player.id ?? player.player;
            return (
              <PlayerTableRow
                key={key}
                player={player}
                showNotes={showNotes}
                hasClaims={hasClaims}
                claim={claimMap.get(key)}
                isNominated={nominatedSet.has(key)}
                onboardingSubjectPlayerName={onboardingSubjectPlayerName}
                onRowClick={onRowClick}
              />
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
