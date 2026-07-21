import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuctionSheet from '@/components/AuctionSheet/AuctionSheet';
import PlayerTable from '@/components/AuctionSheet/PlayerTable';
import { logBid } from '@/lib/actions';
import { useOnboarding } from '@/components/Onboarding/OnboardingContext';
import type { ClaimedBid, LeagueTeam, Player } from '@/types';
import {
  DEFAULT_BUDGET,
  DEFAULT_ROSTER_SIZE,
  DEFAULT_SCORING_SETTINGS,
  DEFAULT_STARTING_LINEUP,
  DEFAULT_TEAM_COUNT,
} from '@/types';

const mockRecordBidLogged = jest.fn<Promise<void>, [string]>().mockResolvedValue();

jest.mock('@/lib/actions', () => ({
  logBid: jest.fn(),
  updateBid: jest.fn(),
  deleteBid: jest.fn(),
}));

jest.mock('@/components/Onboarding/OnboardingContext', () => ({
  useOnboarding: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

const mockUseOnboarding = jest.mocked(useOnboarding);
const mockLogBid = jest.mocked(logBid);

const PLAYERS: Player[] = [
  {
    id: 10,
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
      teamCount={DEFAULT_TEAM_COUNT}
      budget={DEFAULT_BUDGET}
      rosterSize={DEFAULT_ROSTER_SIZE}
      startingLineup={DEFAULT_STARTING_LINEUP}
    />,
  );
}

beforeEach(() => {
  mockRecordBidLogged.mockClear();
  mockLogBid.mockResolvedValue({ ok: true, data: { bidId: 99 } });
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
    await user.type(screen.getByTestId('bid-price'), '110');
    await user.click(screen.getByTestId('bid-submit'));

    await waitFor(() => expect(mockRecordBidLogged).toHaveBeenCalledWith('Josh Allen'));
  });

  it('does not record a failed bid and keeps the existing error visible', async () => {
    const user = userEvent.setup();
    mockLogBid.mockRejectedValue(new Error('offline'));
    renderSheet();

    await user.click(screen.getByTestId('player-row-1'));
    await user.type(screen.getByTestId('bid-price'), '110');
    await user.click(screen.getByTestId('bid-submit'));

    await waitFor(() => expect(screen.getByTestId('bid-server-error')).toBeVisible());
    expect(mockRecordBidLogged).not.toHaveBeenCalled();
  });

  it('anchors bid undo to the matching claimed player', () => {
    const claim: ClaimedBid = {
      id: 1,
      playerId: 10,
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
        claimMap={new Map([[10, claim]])}
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
