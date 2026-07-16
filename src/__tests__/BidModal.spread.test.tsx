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
    spreadDynPct: null,
    spreadProjPct: null,
    ...overrides,
  };
}

function renderModal(player: Player) {
  return render(<BidModal player={player} teams={TEAMS} onClose={() => {}} onSubmit={() => {}} />);
}

describe('BidModal spread block', () => {
  it('shows the spread as percentiles (rank in parens) that reconcile: 91 - 76 = +15', () => {
    renderModal(
      mkPlayer({
        spread: 15,
        spreadDynRank: 28,
        spreadProjRank: 11,
        spreadDynPct: 76,
        spreadProjPct: 91,
      }),
    );
    const block = screen.getByTestId('bid-spread');
    expect(block).toHaveTextContent('76th');
    expect(block).toHaveTextContent('91st');
    expect(block).toHaveTextContent('#28');
    expect(block).toHaveTextContent('#11');
    expect(block).toHaveTextContent('+15');
  });

  it('shows the archetype label + reason when a tag fires', () => {
    renderModal(
      mkPlayer({
        spread: 15,
        spreadDynRank: 28,
        spreadProjRank: 11,
        spreadDynPct: 76,
        spreadProjPct: 91,
        strategyTag: 'WIN-NOW',
      }),
    );
    expect(screen.getByTestId('bid-strategy-tag')).toHaveTextContent('WIN-NOW');
  });

  it('omits the spread block entirely for no-read players', () => {
    renderModal(mkPlayer({ spread: null, strategyTag: null }));
    expect(screen.queryByTestId('bid-spread')).not.toBeInTheDocument();
  });
});
