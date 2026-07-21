// src/__tests__/AuctionSheet.claimed.test.tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuctionSheet from '@/components/AuctionSheet/AuctionSheet';
import type { Player, ClaimedBid, LeagueTeam } from '@/types';
import { DEFAULT_SCORING_SETTINGS } from '@/types';

const MOCK_PLAYERS: Player[] = [
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

const mockLogBid = jest.fn();
const mockUpdateBid = jest.fn();
const mockDeleteBid = jest.fn();

jest.mock('@/lib/actions', () => ({
  logBid: (...args: unknown[]) => mockLogBid(...args),
  updateBid: (...args: unknown[]) => mockUpdateBid(...args),
  deleteBid: (...args: unknown[]) => mockDeleteBid(...args),
  restoreBid: jest.fn(),
}));

jest.mock('@/components/Onboarding/OnboardingContext', () => ({
  useOnboarding: () => ({
    progress: null,
    recordBidLogged: jest.fn().mockResolvedValue(undefined),
    recordPlayerNominated: jest.fn().mockResolvedValue(undefined),
  }),
}));

const mockRouterRefresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

const mockTeams: LeagueTeam[] = [
  { id: 1, handle: 'coreschke', displayName: 'Cole' },
  { id: 2, handle: 'chappy72', displayName: null },
];

const mockClaim: ClaimedBid = {
  id: 1,
  playerId: 10,
  player: 'Josh Allen',
  position: 'QB',
  price: 110,
  teamId: 1,
  teamHandle: 'coreschke',
};

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response);
  mockLogBid.mockResolvedValue({ ok: true, data: { bidId: 99 } });
  mockUpdateBid.mockResolvedValue({ ok: true, data: { bidId: 1 } });
  mockDeleteBid.mockResolvedValue({ ok: true, data: null });
  mockRouterRefresh.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

function renderSheet(overrides: Partial<React.ComponentProps<typeof AuctionSheet>> = {}) {
  return render(
    <AuctionSheet
      players={MOCK_PLAYERS}
      claimedBids={[]}
      teams={mockTeams}
      nominatedPlayers={[]}
      draftId={1}
      ownerHandle="coreschke"
      ownerBudget={1000}
      scoringSettings={{ ...DEFAULT_SCORING_SETTINGS }}
      {...overrides}
    />,
  );
}

describe('AuctionSheet with claimed bids', () => {
  it('renders without claimed bids and does not show a Claimed column', () => {
    renderSheet();

    expect(screen.queryByText('Claimed')).not.toBeInTheDocument();
  });

  it('renders the generated package year in the sheet legend', () => {
    renderSheet({
      players: [
        ...MOCK_PLAYERS,
        {
          player: "coreschke's 2027 package",
          team: 'coreschke',
          pos: 'PKG',
          age: null,
          sfRank: 900,
          budget: 109,
          ceiling: 131,
          floor: 75,
          notes: '',
          futurePickYear: 2027,
          futurePickOriginHandle: 'coreschke',
          futurePickAssetKind: 'package',
        },
      ],
    });

    expect(screen.getByText('PKG target = 2027 1st+2nd+3rd package')).toBeInTheDocument();
    expect(screen.queryByText(/next-year/)).not.toBeInTheDocument();
  });

  it('shows a Claimed column header when at least one bid exists', () => {
    renderSheet({ claimedBids: [mockClaim] });

    expect(screen.getByText('Claimed')).toBeInTheDocument();
  });

  it('shows team handle and price in the claimed column for a claimed player', () => {
    renderSheet({ claimedBids: [mockClaim] });

    expect(screen.getByText(/coreschke/)).toBeInTheDocument();
    expect(screen.getAllByText(/\$110/).length).toBeGreaterThan(0);
  });

  it('shows EV diff with ▼ and green color when bought under target', async () => {
    // mockClaim.price = 110, player.budget = 120, diff = -10 → ▼$10
    renderSheet({ claimedBids: [mockClaim] });

    expect(screen.getByText(/▼\$10/)).toBeInTheDocument();
  });

  it('shows EV diff with ▲ and red when overpaid', () => {
    const overClaim: ClaimedBid = { ...mockClaim, price: 130 };
    renderSheet({ claimedBids: [overClaim] });

    // price 130, budget 120, diff = +10 → ▲$10
    expect(screen.getByText(/▲\$10/)).toBeInTheDocument();
  });

  it('opens the modal when a claimed player row is clicked', async () => {
    const user = userEvent.setup();
    renderSheet({ claimedBids: [mockClaim] });

    await user.click(screen.getAllByText('Josh Allen')[0]);

    expect(screen.getByRole('button', { name: /update bid/i })).toBeInTheDocument();
  });

  it('opens the modal when an unclaimed player row is clicked', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByText('Justin Jefferson'));

    expect(screen.getByRole('button', { name: /log bid/i })).toBeInTheDocument();
  });

  it('renders completed drafts as explicit read-only history without mutation controls', async () => {
    const user = userEvent.setup();
    renderSheet({
      claimedBids: [mockClaim],
      isReadOnly: true,
      sleeperSyncConfigured: true,
    });

    expect(screen.getByTestId('draft-read-only-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('open-sleeper-sync')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open bid modal for josh allen/i })).toBeNull();

    await user.click(screen.getAllByText('Josh Allen')[0]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /available only/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sort by player/i })).toBeInTheDocument();
  });

  it('renders the bid recovery panel with the deleted bids supplied by the draft page', () => {
    renderSheet({
      deletedBids: [
        {
          id: 12,
          player: 'Josh Allen',
          position: 'QB',
          price: 110,
          teamHandle: 'coreschke',
          deletedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          supersededAt: null,
        },
      ],
    });

    expect(screen.getByTestId('bid-history-panel')).toBeInTheDocument();
    expect(screen.getByTestId('deleted-bid-12')).toHaveTextContent('Josh Allen');
  });

  it('shows LIVE badge for a player in the nominatedPlayers prop', () => {
    renderSheet({ nominatedPlayers: [10] });

    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });

  it('shows Nom button in modal for an unnominated player', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByText('Josh Allen'));

    expect(screen.getByRole('button', { name: /^nom$/i })).toBeInTheDocument();
  });

  it('shows In Auction in modal for an already-nominated player', async () => {
    const user = userEvent.setup();
    renderSheet({ nominatedPlayers: [10] });

    await user.click(screen.getAllByText('Josh Allen')[0]);

    expect(screen.getByText(/in auction/i)).toBeInTheDocument();
  });

  it('removes the LIVE badge after a nominated player is won', async () => {
    const user = userEvent.setup();
    renderSheet({ nominatedPlayers: [10] });

    expect(screen.getByText('LIVE')).toBeInTheDocument();
    await user.click(screen.getAllByText('Josh Allen')[0]);
    await user.type(screen.getByTestId('bid-price'), '110');
    await user.click(screen.getByTestId('bid-submit'));

    await waitFor(() => expect(screen.queryByText('LIVE')).not.toBeInTheDocument());
  });

  it('shows the typed maximum-bid failure and keeps the modal open', async () => {
    const user = userEvent.setup();
    mockLogBid.mockResolvedValue({ ok: false, code: 'BID_EXCEEDS_MAX' });
    renderSheet();

    await user.click(screen.getByText('Josh Allen'));
    await user.type(screen.getByTestId('bid-price'), '999');
    await user.click(screen.getByTestId('bid-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('bid-server-error')).toHaveTextContent(
        /leave at least \$1 for every open roster spot/i,
      );
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows a stale-page read-only message when the draft completed concurrently', async () => {
    const user = userEvent.setup();
    mockDeleteBid.mockResolvedValue({ ok: false, code: 'DRAFT_COMPLETE' });
    renderSheet({ claimedBids: [mockClaim] });

    await user.click(screen.getAllByText('Josh Allen')[0]);
    await user.click(screen.getByRole('button', { name: /^remove$/i }));
    await user.click(screen.getByRole('button', { name: /confirm remove/i }));

    await waitFor(() => {
      expect(screen.getByTestId('bid-server-error')).toHaveTextContent(
        /draft is complete and now read-only/i,
      );
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes modal, shows LIVE badge, and calls /api/draft/1/nominated after clicking Nom', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByText('Josh Allen'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^nom$/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/draft/1/nominated',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ playerId: 10 }),
      }),
    );
  });

  it('hides claimed players from the table when Available Only is toggled on', async () => {
    const user = userEvent.setup();
    renderSheet({ claimedBids: [mockClaim] });

    expect(screen.getByText('Josh Allen')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /available only/i }));

    await waitFor(() => expect(screen.queryByText('Josh Allen')).not.toBeInTheDocument());
    expect(screen.getByText('Justin Jefferson')).toBeInTheDocument();
  });

  it('hides the Claimed column while Available Only is active, and restores it when toggled off', async () => {
    const user = userEvent.setup();
    renderSheet({ claimedBids: [mockClaim] });

    expect(screen.getByText('Claimed')).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /available only/i });
    await user.click(toggle);
    await waitFor(() => expect(screen.queryByText('Claimed')).not.toBeInTheDocument());

    await user.click(toggle);
    await waitFor(() => expect(screen.getByText('Claimed')).toBeInTheDocument());
  });

  it('falls back to showing all players when the active position pill is clicked again', async () => {
    const user = userEvent.setup();
    renderSheet();

    const qbPill = screen.getByRole('button', { name: 'QB' });
    await user.click(qbPill);
    await waitFor(() => expect(screen.queryByText('Justin Jefferson')).not.toBeInTheDocument());

    await user.click(qbPill);
    await waitFor(() => expect(screen.getByText('Justin Jefferson')).toBeInTheDocument());
  });

  it('does not render strategy lens controls while lens valuation is deferred', () => {
    renderSheet({
      players: [
        {
          ...MOCK_PLAYERS[0],
          baseBudget: 120,
          projectionAuctionValue: 180,
          projectedPoints: 410,
          vor: 150,
        },
      ],
    });

    expect(screen.getByText('$120')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /contend/i })).not.toBeInTheDocument();
  });

  it('passes the active draft-board value into the bid modal', async () => {
    const user = userEvent.setup();
    renderSheet({
      players: [
        {
          ...MOCK_PLAYERS[0],
          baseBudget: 120,
          projectionAuctionValue: 180,
          projectedPoints: 410,
          vor: 150,
        },
      ],
    });

    await user.click(screen.getByText('Josh Allen'));

    expect(screen.getByTestId('bid-price-context-dynasty')).toHaveTextContent('$120');
    expect(screen.getByTestId('bid-price-context-projection')).toHaveTextContent('$180');
    expect(screen.getByTestId('bid-price-context-active')).toHaveTextContent('$120');
  });

  it('defaults to sorting by target value (budget) descending, interleaving pick assets by value instead of sinking them to the bottom', () => {
    const { container } = renderSheet({
      players: [
        MOCK_PLAYERS[0], // Josh Allen — sfRank 1, budget 120
        MOCK_PLAYERS[1], // Justin Jefferson — sfRank 5, budget 95
        {
          player: "coreschke's 2027 package",
          team: 'coreschke',
          pos: 'PKG',
          age: null,
          sfRank: 900, // deliberately far behind on sfRank...
          budget: 109, // ...but worth more than Jefferson on target value
          ceiling: 131,
          floor: 75,
          notes: '',
          futurePickYear: 2027,
          futurePickOriginHandle: 'coreschke',
          futurePickAssetKind: 'package',
        },
      ],
    });

    const rows = container.querySelectorAll('[data-testid^="player-row-"]');
    const order = Array.from(rows).map((row) => row.getAttribute('data-testid'));
    // Row testids are keyed by sfRank (player-row-<sfRank>), not by sort order, so this
    // asserts the actual DOM order under the new budget-descending default: Allen (120),
    // the package (109), then Jefferson (95) — the package sits between the two players
    // by value instead of trailing behind both of them the way sfRank-ascending would put it.
    expect(order).toEqual(['player-row-1', 'player-row-900', 'player-row-5']);
  });

  it('sorts by the Claimed column, unclaimed players last, toggling asc/desc', async () => {
    const user = userEvent.setup();
    const secondClaim: ClaimedBid = {
      id: 2,
      playerId: 11,
      player: 'Justin Jefferson',
      position: 'WR',
      price: 200,
      teamId: 2,
      teamHandle: 'chappy72',
    };
    const { container } = renderSheet({
      claimedBids: [mockClaim, secondClaim], // Allen $110, Jefferson $200
      players: [
        ...MOCK_PLAYERS,
        // Two unclaimed players with different target budgets, to verify they're grouped
        // after every claimed player but ordered among themselves by target value.
        { ...MOCK_PLAYERS[0], id: 12, player: 'Unclaimed Cheap', sfRank: 8, budget: 50 },
        { ...MOCK_PLAYERS[0], id: 13, player: 'Unclaimed Pricey', sfRank: 9, budget: 80 },
      ],
    });

    await user.click(screen.getByRole('button', { name: /sort by claimed/i }));
    await waitFor(() => {
      const order = Array.from(container.querySelectorAll('[data-testid^="player-row-"]')).map(
        (row) => row.getAttribute('data-testid'),
      );
      // Descending default: Jefferson ($200), Allen ($110), then unclaimed by budget desc.
      expect(order).toEqual(['player-row-5', 'player-row-1', 'player-row-9', 'player-row-8']);
    });

    await user.click(screen.getByRole('button', { name: /sort by claimed/i }));
    await waitFor(() => {
      const order = Array.from(container.querySelectorAll('[data-testid^="player-row-"]')).map(
        (row) => row.getAttribute('data-testid'),
      );
      // Ascending: Allen ($110), Jefferson ($200), then unclaimed by budget asc.
      expect(order).toEqual(['player-row-1', 'player-row-5', 'player-row-8', 'player-row-9']);
    });
  });

  it('disables the bid submit button while a save is pending, blocking duplicate submissions', async () => {
    const user = userEvent.setup();
    let resolveLogBid: (value: { ok: true; data: { bidId: number } }) => void = () => {};
    mockLogBid.mockReturnValue(
      new Promise((resolve) => {
        resolveLogBid = resolve;
      }),
    );
    renderSheet();

    await user.click(screen.getByText('Josh Allen'));
    await user.type(screen.getByTestId('bid-price'), '110');
    const callsBeforeSubmit = mockLogBid.mock.calls.length;
    await user.click(screen.getByTestId('bid-submit'));

    await waitFor(() => expect(screen.getByTestId('bid-submit')).toBeDisabled());
    await user.click(screen.getByTestId('bid-submit'));
    expect(mockLogBid.mock.calls.length).toBe(callsBeforeSubmit + 1);

    resolveLogBid({ ok: true, data: { bidId: 99 } });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('announces bid save progress and outcome through the mutation status live region', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByText('Josh Allen'));
    await user.type(screen.getByTestId('bid-price'), '110');
    await user.click(screen.getByTestId('bid-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('mutation-status')).toHaveTextContent('Bid saved.'),
    );
  });

  it('refreshes canonical draft state when a bid save is rejected as a conflict', async () => {
    const user = userEvent.setup();
    mockLogBid.mockResolvedValue({ ok: false, code: 'PLAYER_ALREADY_CLAIMED' });
    renderSheet();

    await user.click(screen.getByText('Josh Allen'));
    await user.type(screen.getByTestId('bid-price'), '110');
    await user.click(screen.getByTestId('bid-submit'));

    await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
  });

  it('rolls back the optimistic LIVE badge and refreshes canonical state when the nomination request throws', async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.reject(new Error('network down')),
    );
    renderSheet();

    await user.click(screen.getByText('Josh Allen'));
    await user.click(screen.getByRole('button', { name: /^nom$/i }));

    // Don't assert the optimistic LIVE badge synchronously here: the rejected fetch's
    // rollback runs as a microtask that can already have resolved by the time control
    // returns from `await user.click(...)`, making a synchronous `getByText('LIVE')` racy.
    // The rollback (badge absent) and the canonical-refresh call are what this test verifies.
    await waitFor(() => expect(screen.queryByText('LIVE')).not.toBeInTheDocument());
    expect(mockRouterRefresh).toHaveBeenCalled();
  });

  it('rolls back the optimistic LIVE badge and refreshes canonical state when the nomination request is rejected', async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 409 } as Response);
    renderSheet();

    await user.click(screen.getByText('Josh Allen'));
    await user.click(screen.getByRole('button', { name: /^nom$/i }));

    await waitFor(() => expect(screen.queryByText('LIVE')).not.toBeInTheDocument());
    expect(mockRouterRefresh).toHaveBeenCalled();
  });

  it('allows nominating a different player while an earlier nomination is still in flight', async () => {
    // Regression test: handleNominate used to guard duplicate submits with a single global
    // `isNominating` boolean instead of tracking pending state per player, so nominating a
    // second player while a first player's nomination request was still in flight would
    // silently no-op — no fetch call, no error, no feedback.
    const user = userEvent.setup();
    let resolveFirstNominate: (value: Response) => void = () => {};
    const firstNominatePromise = new Promise<Response>((resolve) => {
      resolveFirstNominate = resolve;
    });
    (global.fetch as jest.Mock).mockImplementationOnce(() => firstNominatePromise);
    renderSheet();

    await user.click(screen.getByText('Josh Allen'));
    await user.click(screen.getByRole('button', { name: /^nom$/i }));

    await user.click(screen.getByText('Justin Jefferson'));
    await user.click(screen.getByRole('button', { name: /^nom$/i }));

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/draft/1/nominated',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ playerId: 11 }),
      }),
    );

    resolveFirstNominate({ ok: true } as Response);
  });

  it('breaks a tie in the sorted column using SF rank ascending', () => {
    const { container } = renderSheet({
      players: [
        { ...MOCK_PLAYERS[0], sfRank: 5, budget: 100 }, // tied on budget, worse rank
        { ...MOCK_PLAYERS[1], sfRank: 2, budget: 100 }, // tied on budget, better rank
      ],
    });

    const rows = container.querySelectorAll('[data-testid^="player-row-"]');
    const order = Array.from(rows).map((row) => row.getAttribute('data-testid'));
    // Both players tie at budget 100 (the default sort column) — SF rank breaks the
    // tie ascending, so the better-ranked player (rank 2) is shown first.
    expect(order).toEqual(['player-row-2', 'player-row-5']);
  });
});
