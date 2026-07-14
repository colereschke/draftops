import { render, screen } from '@testing-library/react';
import BidModal from '@/components/BidModal/BidModal';
import type { Player, LeagueTeam } from '@/types';

const TEAMS: LeagueTeam[] = [{ id: 1, handle: 'alice', displayName: 'Alice' }];

function mkPlayer(overrides: Partial<Player>): Player {
  return {
    player: 'Josh Jacobs',
    team: 'GB',
    pos: 'RB',
    age: 28,
    sfRank: 12,
    budget: 60,
    ceiling: 69,
    floor: 52,
    notes: '',
    baseBudget: 60,
    projectionAuctionValue: 84,
    vor: 30,
    spread: null,
    strategyTag: null,
    spreadDynRank: null,
    spreadProjRank: null,
    ...overrides,
  };
}

function renderModal(player: Player) {
  return render(<BidModal player={player} teams={TEAMS} onClose={() => {}} onSubmit={() => {}} />);
}

describe('BidModal spread block', () => {
  it('shows the spread and ranks when present', () => {
    renderModal(mkPlayer({ spread: 42, spreadDynRank: 24, spreadProjRank: 12 }));
    const block = screen.getByTestId('bid-spread');
    expect(block).toHaveTextContent('#24');
    expect(block).toHaveTextContent('#12');
    expect(block).toHaveTextContent('+42');
  });

  it('shows the archetype label + reason when a tag fires', () => {
    renderModal(
      mkPlayer({ spread: 42, spreadDynRank: 24, spreadProjRank: 12, strategyTag: 'WIN-NOW' }),
    );
    expect(screen.getByTestId('bid-strategy-tag')).toHaveTextContent('WIN-NOW');
  });

  it('omits the spread block entirely for no-read players', () => {
    renderModal(mkPlayer({ spread: null, strategyTag: null }));
    expect(screen.queryByTestId('bid-spread')).not.toBeInTheDocument();
  });
});
