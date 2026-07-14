import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuctionSheet from '@/components/AuctionSheet/AuctionSheet';
import PlayerTable from '@/components/AuctionSheet/PlayerTable';
import { logBid } from '@/lib/actions';
import { useOnboarding } from '@/components/Onboarding/OnboardingContext';
import type { ClaimedBid, LeagueTeam, Player } from '@/types';
import { DEFAULT_SCORING_SETTINGS } from '@/types';

const mockRecordBidLogged = jest.fn<Promise<void>, [string]>().mockResolvedValue();

jest.mock('@/lib/actions', () => ({
  logBid: jest.fn(),
  updateBid: jest.fn(),
  deleteBid: jest.fn(),
}));

jest.mock('@/components/Onboarding/OnboardingContext', () => ({
  useOnboarding: jest.fn(),
}));

const mockUseOnboarding = jest.mocked(useOnboarding);
const mockLogBid = jest.mocked(logBid);

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
    notes: '',
  },
];

const TEAMS: LeagueTeam[] = [{ id: 1, handle: 'coreschke', displayName: 'Cole' }];

function renderSheet() {
  return render(
    <AuctionSheet
      players={PLAYERS}
      claimedBids={[]}
      teams={TEAMS}
      nominatedPlayers={[]}
      draftId={1}
      ownerHandle="coreschke"
      ownerBudget={1000}
      scoringSettings={{ ...DEFAULT_SCORING_SETTINGS }}
    />,
  );
}

beforeEach(() => {
  mockRecordBidLogged.mockClear();
  mockLogBid.mockResolvedValue(undefined);
  mockUseOnboarding.mockReturnValue({
    progress: null,
    recordBidLogged: mockRecordBidLogged,
    recordPlayerNominated: jest.fn(),
  });
});

describe('AuctionSheet onboarding bid events', () => {
  it('records a successful new bid for onboarding', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByTestId('player-row-1'));
    await user.type(screen.getByLabelText('Price'), '110');
    await user.click(screen.getByRole('button', { name: /log bid/i }));

    await waitFor(() => expect(mockRecordBidLogged).toHaveBeenCalledWith('Josh Allen'));
  });

  it('does not record a failed bid and keeps the existing error visible', async () => {
    const user = userEvent.setup();
    mockLogBid.mockRejectedValue(new Error('offline'));
    renderSheet();

    await user.click(screen.getByTestId('player-row-1'));
    await user.type(screen.getByLabelText('Price'), '110');
    await user.click(screen.getByRole('button', { name: /log bid/i }));

    await waitFor(() =>
      expect(screen.getByText('Failed to log bid. Please try again.')).toBeVisible(),
    );
    expect(mockRecordBidLogged).not.toHaveBeenCalled();
  });

  it('anchors bid undo to the matching claimed player', () => {
    const claim: ClaimedBid = {
      id: 1,
      player: 'Josh Allen',
      position: 'QB',
      price: 110,
      teamId: 1,
      teamHandle: 'coreschke',
    };

    render(
      <PlayerTable
        players={PLAYERS}
        showNotes={false}
        hasClaims
        claimMap={new Map([[claim.player, claim]])}
        nominatedSet={new Set()}
        onboardingSubjectPlayerName="Josh Allen"
        sortBy="sfRank"
        sortDir="asc"
        onSort={jest.fn()}
        onRowClick={jest.fn()}
      />,
    );

    expect(screen.getByTestId('onboarding-bid-undo-Josh Allen')).toHaveAttribute(
      'data-onboarding-target',
      'bid-undo',
    );
  });
});
