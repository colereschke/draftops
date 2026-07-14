import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NominationHelper from '@/components/NominationHelper/NominationHelper';
import WatchlistSidebar from '@/components/NominationHelper/WatchlistSidebar';
import { useOnboarding } from '@/components/Onboarding/OnboardingContext';
import type { Player } from '@/types';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock('@/components/Onboarding/OnboardingContext', () => ({
  useOnboarding: jest.fn(),
}));

const mockUseOnboarding = jest.mocked(useOnboarding);
const mockRecordPlayerNominated = jest.fn<Promise<void>, [string]>().mockResolvedValue();

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

const NOMINATION_DATA = {
  teamStats: [
    {
      id: 1,
      handle: 'other-manager',
      displayName: 'Other Manager',
      budget: 1000,
      spent: 95,
      remaining: 905,
      rosterCount: 1,
      rosterRemaining: 29,
      buyingPower: 876,
      pkgCount: 0,
      avgAge: null,
    },
  ],
  auctionResults: [
    {
      id: 1,
      player: 'Justin Jefferson',
      position: 'WR',
      nflTeam: 'MIN',
      price: 95,
      teamId: 1,
      teamHandle: 'other-manager',
    },
  ],
  watchlist: [],
  nominated: [],
  ownerHandle: null,
  targetRoster: { QB: 4, RB: 9, WR: 11, TE: 3 },
};

function renderHelper() {
  return render(<NominationHelper draftId={1} players={PLAYERS} />);
}

beforeEach(() => {
  mockRecordPlayerNominated.mockClear();
  mockUseOnboarding.mockReturnValue({
    progress: null,
    recordBidLogged: jest.fn(),
    recordPlayerNominated: mockRecordPlayerNominated,
  });
});

afterEach(() => {
  jest.resetAllMocks();
});

describe('NominationHelper onboarding nomination events', () => {
  it('records a successful nomination for onboarding', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn((_, init?: RequestInit) =>
      Promise.resolve(
        init?.method === 'POST'
          ? ({ ok: true, status: 200 } as Response)
          : ({ ok: true, status: 200, json: async () => NOMINATION_DATA } as Response),
      ),
    );
    renderHelper();

    const nominateButton = await screen.findByTestId('nominate-player-Josh Allen');
    expect(nominateButton).toHaveAttribute('data-onboarding-target', 'nominate-practice');
    await user.click(nominateButton);

    await waitFor(() => expect(mockRecordPlayerNominated).toHaveBeenCalledWith('Josh Allen'));
  });

  it('does not record a failed nomination and restores the player row', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn((_, init?: RequestInit) =>
      Promise.resolve(
        init?.method === 'POST'
          ? ({ ok: false, status: 500 } as Response)
          : ({ ok: true, status: 200, json: async () => NOMINATION_DATA } as Response),
      ),
    );
    renderHelper();

    const nominateButton = await screen.findByTestId('nominate-player-Josh Allen');
    await user.click(nominateButton);

    await waitFor(() => expect(screen.getByTestId('nominate-player-Josh Allen')).toBeVisible());
    expect(mockRecordPlayerNominated).not.toHaveBeenCalled();
  });

  it('anchors nomination undo to the matching live-rail player', () => {
    render(
      <WatchlistSidebar
        players={PLAYERS}
        nominated={['Josh Allen']}
        watchlist={[]}
        wonNames={new Set()}
        onAddToWatchlist={jest.fn()}
        onRemoveFromWatchlist={jest.fn()}
        onUnNominate={jest.fn()}
        onboardingSubjectPlayerName="Josh Allen"
      />,
    );

    expect(screen.getByTestId('onboarding-nominate-undo-Josh Allen')).toHaveAttribute(
      'data-onboarding-target',
      'nominate-undo',
    );
  });
});
