import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NominationHelper from '@/components/NominationHelper/NominationHelper';
import WatchlistSidebar from '@/components/NominationHelper/WatchlistSidebar';
import type { Player } from '@/types';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: jest.fn(),
  }),
}));

jest.mock('@/components/Onboarding/OnboardingContext', () => ({
  useOnboarding: () => ({
    progress: null,
    recordBidLogged: jest.fn(),
    recordPlayerNominated: jest.fn(),
  }),
}));

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
  {
    id: 11,
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

describe('NominationHelper UI', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        teamStats: [],
        auctionResults: [],
        watchlist: [],
        nominated: [],
        ownerHandle: null,
        targetRoster: { QB: 4, RB: 9, WR: 11, TE: 3 },
      }),
    } as Response);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('stacks the watchlist above the table on small screens', async () => {
    render(<NominationHelper draftId={1} players={PLAYERS} />);

    await waitFor(() => expect(screen.getByText('Nomination Helper')).toBeInTheDocument());

    expect(screen.getByTestId('nomination-helper-layout')).toHaveClass('flex-col', 'md:flex-row');
  });

  it('renders completed drafts read-only without nomination or watchlist controls', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        teamStats: [],
        auctionResults: [
          {
            playerId: 999,
            player: 'Prior Winner',
            position: 'RB',
            price: 50,
            teamId: 1,
          },
        ],
        watchlist: [11],
        nominated: [10],
        ownerHandle: null,
        targetRoster: { QB: 4, RB: 9, WR: 11, TE: 3 },
      }),
    } as Response);

    render(<NominationHelper draftId={1} players={PLAYERS} isReadOnly />);

    await waitFor(() => expect(screen.getByTestId('draft-read-only-banner')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^nominate$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^watch$/i })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Add player I want...')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /remove josh allen from in auction/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Josh Allen')).toBeInTheDocument();
    expect(screen.getByText('Justin Jefferson')).toBeInTheDocument();
  });
});

describe('WatchlistSidebar', () => {
  it('labels icon-only remove buttons with player-specific accessible names', async () => {
    const user = userEvent.setup();
    const onRemoveFromWatchlist = jest.fn();
    const onUnNominate = jest.fn();

    render(
      <WatchlistSidebar
        players={PLAYERS}
        nominated={[10]}
        watchlist={[11]}
        wonIds={new Set()}
        onAddToWatchlist={jest.fn()}
        onRemoveFromWatchlist={onRemoveFromWatchlist}
        onUnNominate={onUnNominate}
      />,
    );

    await user.click(screen.getByRole('button', { name: /remove josh allen from in auction/i }));
    await user.click(
      screen.getByRole('button', { name: /remove justin jefferson from watchlist/i }),
    );

    expect(onUnNominate).toHaveBeenCalledWith(10);
    expect(onRemoveFromWatchlist).toHaveBeenCalledWith(11);
  });
});
