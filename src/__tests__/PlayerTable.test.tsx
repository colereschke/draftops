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

    await user.click(screen.getByRole('button', { name: /sort by player/i }));

    expect(onSort).toHaveBeenCalledWith('player');
  });

  it('sort headers can be operated with the keyboard', async () => {
    const user = userEvent.setup();
    const { onSort } = renderTable();

    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: /sort by player/i })).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(onSort).toHaveBeenCalledWith('player');
  });

  it('calls onRowClick with the clicked player', async () => {
    const user = userEvent.setup();
    const { onRowClick } = renderTable();

    await user.click(screen.getByRole('button', { name: /open bid modal for josh allen/i }));

    expect(onRowClick).toHaveBeenCalledWith(PLAYERS[0]);
  });

  it('calls onRowClick when the player row is clicked outside the player name', async () => {
    const user = userEvent.setup();
    const { onRowClick } = renderTable();

    await user.click(screen.getByTestId('player-row-1'));

    expect(onRowClick).toHaveBeenCalledWith(PLAYERS[0]);
  });

  it('opens a player row with the keyboard', async () => {
    const user = userEvent.setup();
    const { onRowClick } = renderTable();

    screen.getByTestId('player-row-1').focus();
    await user.keyboard('{Enter}');

    expect(onRowClick).toHaveBeenCalledWith(PLAYERS[0]);
  });

  it('row actions can be operated with the keyboard', async () => {
    const user = userEvent.setup();
    const { onRowClick } = renderTable();

    screen.getByRole('button', { name: /open bid modal for josh allen/i }).focus();
    await user.keyboard('{Enter}');

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

  it('does not show raw projection context inline in the table', () => {
    renderTable({
      players: [
        {
          ...PLAYERS[0],
          projectionAuctionValue: 113,
          projectedPoints: 410.5,
          vor: 150.4,
          valueSource: 'fallback',
        },
      ],
    });

    expect(screen.queryByText('VOR')).not.toBeInTheDocument();
    expect(screen.queryByText('Proj $113')).not.toBeInTheDocument();
    expect(screen.queryByText('PROJ')).not.toBeInTheDocument();
  });
});
