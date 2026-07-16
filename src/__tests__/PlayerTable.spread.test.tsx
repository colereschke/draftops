import { render, screen } from '@testing-library/react';
import PlayerTable from '@/components/AuctionSheet/PlayerTable';
import type { Player, ClaimedBid } from '@/types';

function mkPlayer(overrides: Partial<Player>): Player {
  return {
    player: 'X',
    team: 'FA',
    pos: 'RB',
    age: 26,
    sfRank: 1,
    budget: 50,
    ceiling: 58,
    floor: 44,
    notes: '',
    baseBudget: 50,
    spread: null,
    strategyTag: null,
    ...overrides,
  };
}

const NOOP = () => {};

function renderTable(players: Player[]) {
  return render(
    <PlayerTable
      players={players}
      showNotes={false}
      hasClaims={false}
      claimMap={new Map<string, ClaimedBid>()}
      nominatedSet={new Set<string>()}
      sortBy="budget"
      sortDir="desc"
      onSort={NOOP}
      onRowClick={NOOP}
    />,
  );
}

describe('PlayerTable spread column', () => {
  it('renders a signed spread value', () => {
    renderTable([mkPlayer({ sfRank: 3, spread: 42 })]);
    expect(screen.getByTestId('spread-3')).toHaveTextContent('+42');
  });

  it('renders a dash for no-read players', () => {
    renderTable([mkPlayer({ sfRank: 7, spread: null })]);
    expect(screen.getByTestId('spread-7')).toHaveTextContent('—');
  });

  it('renders negative spreads with a minus sign', () => {
    renderTable([mkPlayer({ sfRank: 9, spread: -30 })]);
    expect(screen.getByTestId('spread-9')).toHaveTextContent('-30');
  });
});
