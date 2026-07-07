import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlayerTable from '@/components/AuctionSheet/PlayerTable';
import type { Player, ClaimedBid } from '@/types';

const PLAYERS: Player[] = [
  {
    player: 'Josh Allen',
    team: 'BUF',
    pos: 'QB',
    age: 28,
    sfRank: 1,
    budget: 120,
    ceiling: 138,
    floor: 104,
    notes: 'Elite dual-threat',
  },
  {
    player: 'Justin Jefferson',
    team: 'MIN',
    pos: 'WR',
    age: 25,
    sfRank: 5,
    budget: 95,
    ceiling: 109,
    floor: 83,
    notes: '',
  },
];

function renderTable(overrides: Partial<React.ComponentProps<typeof PlayerTable>> = {}) {
  const onSort = jest.fn();
  const onRowClick = jest.fn();
  render(
    <PlayerTable
      players={PLAYERS}
      showNotes={false}
      hasClaims={false}
      claimMap={new Map<string, ClaimedBid>()}
      nominatedSet={new Set<string>()}
      sortBy="sfRank"
      sortDir="asc"
      onSort={onSort}
      onRowClick={onRowClick}
      {...overrides}
    />,
  );
  return { onSort, onRowClick };
}

describe('PlayerTable', () => {
  it('renders a row per player', () => {
    renderTable();

    expect(screen.getByText('Josh Allen')).toBeInTheDocument();
    expect(screen.getByText('Justin Jefferson')).toBeInTheDocument();
  });

  it('calls onSort with the clicked column key', async () => {
    const user = userEvent.setup();
    const { onSort } = renderTable();

    await user.click(screen.getByText('Player'));

    expect(onSort).toHaveBeenCalledWith('player');
  });

  it('calls onRowClick with the clicked player', async () => {
    const user = userEvent.setup();
    const { onRowClick } = renderTable();

    await user.click(screen.getByText('Josh Allen'));

    expect(onRowClick).toHaveBeenCalledWith(PLAYERS[0]);
  });

  it('shows the Notes column only when showNotes is true', () => {
    const { rerender } = render(
      <PlayerTable
        players={PLAYERS}
        showNotes={false}
        hasClaims={false}
        claimMap={new Map()}
        nominatedSet={new Set()}
        sortBy="sfRank"
        sortDir="asc"
        onSort={jest.fn()}
        onRowClick={jest.fn()}
      />,
    );
    expect(screen.queryByText('Elite dual-threat')).not.toBeInTheDocument();

    rerender(
      <PlayerTable
        players={PLAYERS}
        showNotes
        hasClaims={false}
        claimMap={new Map()}
        nominatedSet={new Set()}
        sortBy="sfRank"
        sortDir="asc"
        onSort={jest.fn()}
        onRowClick={jest.fn()}
      />,
    );
    expect(screen.getByText('Elite dual-threat')).toBeInTheDocument();
  });

  it('shows the Claimed column only when hasClaims is true', () => {
    const { rerender } = render(
      <PlayerTable
        players={PLAYERS}
        showNotes={false}
        hasClaims={false}
        claimMap={new Map()}
        nominatedSet={new Set()}
        sortBy="sfRank"
        sortDir="asc"
        onSort={jest.fn()}
        onRowClick={jest.fn()}
      />,
    );
    expect(screen.queryByText('Claimed')).not.toBeInTheDocument();

    rerender(
      <PlayerTable
        players={PLAYERS}
        showNotes={false}
        hasClaims
        claimMap={new Map()}
        nominatedSet={new Set()}
        sortBy="sfRank"
        sortDir="asc"
        onSort={jest.fn()}
        onRowClick={jest.fn()}
      />,
    );
    expect(screen.getByText('Claimed')).toBeInTheDocument();
  });

  it('shows a LIVE badge for players in nominatedSet', () => {
    renderTable({ nominatedSet: new Set(['Josh Allen']) });

    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });
});
