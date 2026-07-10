// src/__tests__/AuctionSheet.claimed.test.tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuctionSheet from '@/components/AuctionSheet/AuctionSheet';
import type { Player, ClaimedBid, LeagueTeam } from '@/types';

const MOCK_PLAYERS: Player[] = [
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

jest.mock('@/lib/actions', () => ({
  logBid: jest.fn().mockResolvedValue(undefined),
  updateBid: jest.fn().mockResolvedValue(undefined),
  deleteBid: jest.fn().mockResolvedValue(undefined),
}));

const mockTeams: LeagueTeam[] = [
  { id: 1, handle: 'coreschke', displayName: 'Cole' },
  { id: 2, handle: 'chappy72', displayName: null },
];

const mockClaim: ClaimedBid = {
  id: 1,
  player: 'Josh Allen',
  position: 'QB',
  price: 110,
  teamId: 1,
  teamHandle: 'coreschke',
};

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response);
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

  it('shows LIVE badge for a player in the nominatedPlayers prop', () => {
    renderSheet({ nominatedPlayers: ['Josh Allen'] });

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
    renderSheet({ nominatedPlayers: ['Josh Allen'] });

    await user.click(screen.getAllByText('Josh Allen')[0]);

    expect(screen.getByText(/in auction/i)).toBeInTheDocument();
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
        body: JSON.stringify({ playerName: 'Josh Allen' }),
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

  it('adjusts visible targets when the strategy lens changes', async () => {
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

    expect(screen.getByText('$120')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /contend/i }));

    expect(screen.getByText('$153')).toBeInTheDocument();
  });

  it('passes strategy-adjusted active value into the bid modal', async () => {
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

    await user.click(screen.getByRole('button', { name: /contend/i }));
    await user.click(screen.getByText('Josh Allen'));

    expect(screen.getByTestId('bid-price-context-dynasty')).toHaveTextContent('$120');
    expect(screen.getByTestId('bid-price-context-projection')).toHaveTextContent('$180');
    expect(screen.getByTestId('bid-price-context-active')).toHaveTextContent('$153');
  });
});
