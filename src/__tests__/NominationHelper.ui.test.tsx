import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NominationHelper from '@/components/NominationHelper/NominationHelper';
import WatchlistSidebar from '@/components/NominationHelper/WatchlistSidebar';
import type { Player } from '@/types';

const mockRouter = { replace: jest.fn() };

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

const mockRecordPlayerNominated = jest.fn().mockResolvedValue(undefined);

jest.mock('@/components/Onboarding/OnboardingContext', () => ({
  useOnboarding: () => ({
    progress: null,
    recordBidLogged: jest.fn(),
    recordPlayerNominated: (name: string) => mockRecordPlayerNominated(name),
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

describe('NominationHelper mutations', () => {
  const dataWithAuction = {
    // A rival team with buying power and no roster fill is required so
    // computeNominationScores produces a positive nominationScore for QB/WR —
    // it filters out every player scoring 0, which is what an empty teamStats
    // fixture (fine for the other tests in this file) would otherwise produce.
    teamStats: [
      {
        id: 2,
        handle: 'rival',
        displayName: 'Rival',
        budget: 1000,
        spent: 0,
        remaining: 1000,
        rosterCount: 0,
        rosterRemaining: 30,
        buyingPower: 1000,
        pkgCount: 0,
        avgAge: null,
      },
    ],
    auctionResults: [
      { playerId: 999, player: 'Prior Winner', position: 'RB', price: 50, teamId: 1 },
    ],
    watchlist: [],
    nominated: [],
    ownerHandle: null,
    targetRoster: { QB: 4, RB: 9, WR: 11, TE: 3 },
  };

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => dataWithAuction,
    } as Response);
    mockRecordPlayerNominated.mockClear();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  async function renderReady() {
    const user = userEvent.setup();
    render(<NominationHelper draftId={1} players={PLAYERS} />);
    await waitFor(() => expect(screen.getByText('Nomination Helper')).toBeInTheDocument());
    return user;
  }

  function rowFor(playerName: string) {
    const table = screen.getByRole('table');
    const row = within(table).getByText(playerName).closest('tr');
    if (!row) throw new Error(`row for ${playerName} not found`);
    return row;
  }

  function watchButtonFor(playerName: string) {
    return within(rowFor(playerName)).getByRole('button', { name: /^watch$/i });
  }

  function nominateButtonFor(playerName: string) {
    return within(rowFor(playerName)).getByRole('button', { name: /^nominate$/i });
  }

  it('rolls back an optimistic watchlist add and announces failure when the request throws', async () => {
    const user = await renderReady();
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.reject(new Error('network down')),
    );

    await user.click(watchButtonFor('Josh Allen'));

    await waitFor(() =>
      expect(screen.getByTestId('mutation-status')).toHaveTextContent(
        /failed to add josh allen to watchlist/i,
      ),
    );
    expect(
      screen.queryByRole('button', { name: /remove josh allen from watchlist/i }),
    ).not.toBeInTheDocument();
  });

  it('rolls back an optimistic watchlist add and refetches canonical data on a non-2xx response', async () => {
    const user = await renderReady();
    const callsBeforeMutation = (global.fetch as jest.Mock).mock.calls.length;
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 409 } as Response);

    await user.click(watchButtonFor('Josh Allen'));

    await waitFor(() =>
      expect(screen.getByTestId('mutation-status')).toHaveTextContent(
        /failed to add josh allen to watchlist/i,
      ),
    );
    // The failed POST plus a follow-up GET to resync canonical state.
    await waitFor(() =>
      expect((global.fetch as jest.Mock).mock.calls.length).toBe(callsBeforeMutation + 2),
    );
  });

  it('removes the Watch control immediately on click, making a duplicate click on the same player impossible', async () => {
    // computeNominationScores excludes watchlisted players from nomination targets, and the
    // optimistic update in runPlayerMutation applies that exclusion in the same render as the
    // click — so there is no intermediate "visible but disabled" frame to assert on. The row
    // (and its Watch button) is simply gone, which is the actual duplicate-click protection
    // for this control; this test verifies that guarantee and that only one request fired.
    const user = await renderReady();
    const callsBeforeClick = (global.fetch as jest.Mock).mock.calls.length;

    const watchButton = watchButtonFor('Josh Allen');
    await user.click(watchButton);

    expect(watchButton).not.toBeInTheDocument();
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(callsBeforeClick + 1);
  });

  it('does not record onboarding progress when a nomination request fails', async () => {
    const user = await renderReady();
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 409 } as Response);

    await user.click(nominateButtonFor('Josh Allen'));

    await waitFor(() =>
      expect(screen.getByTestId('mutation-status')).toHaveTextContent(
        /failed to nominate josh allen/i,
      ),
    );
    expect(mockRecordPlayerNominated).not.toHaveBeenCalled();
  });

  it("does not roll back a different player's optimistic update when this mutation fails", async () => {
    // Regression test: runPlayerMutation used to restore a whole-object `data` snapshot
    // captured before the mutation started. If a second player's mutation completed while
    // the first was still pending, the first mutation's failure rollback would wipe out the
    // second player's already-successful optimistic change. The fix reverts only the failed
    // mutation's own change against the latest state, keyed by playerId.
    const user = await renderReady();

    let resolveWatchlistPost: (value: Response) => void = () => {};
    const watchlistPostPromise = new Promise<Response>((resolve) => {
      resolveWatchlistPost = resolve;
    });
    let resolveRefetch: (value: Response) => void = () => {};
    const refetchPromise = new Promise<Response>((resolve) => {
      resolveRefetch = resolve;
    });

    (global.fetch as jest.Mock)
      .mockImplementationOnce(() => watchlistPostPromise) // Josh Allen watchlist POST — stays pending
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response) // Justin Jefferson nominate POST
      .mockImplementationOnce(() => refetchPromise); // canonical refetch triggered by Josh Allen's failure

    await user.click(watchButtonFor('Josh Allen'));
    await user.click(nominateButtonFor('Justin Jefferson'));

    await waitFor(() =>
      expect(screen.getByTestId('mutation-status')).toHaveTextContent(
        /justin jefferson nominated/i,
      ),
    );
    expect(
      screen.getByRole('button', { name: /remove justin jefferson from in auction/i }),
    ).toBeInTheDocument();

    resolveWatchlistPost({ ok: false, status: 409 } as Response);

    await waitFor(() =>
      expect(screen.getByTestId('mutation-status')).toHaveTextContent(
        /failed to add josh allen to watchlist/i,
      ),
    );

    // Josh Allen's failed watchlist mutation must not roll back Justin Jefferson's
    // separately in-flight (and by now successful) nomination — he must still be listed
    // in the "In Auction" sidebar, not reverted back into the available-players table.
    expect(
      screen.getByRole('button', { name: /remove justin jefferson from in auction/i }),
    ).toBeInTheDocument();

    resolveRefetch({ ok: true, status: 200, json: async () => dataWithAuction } as Response);
  });
});
