import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AuctionSheet from '@/components/AuctionSheet/AuctionSheet';
import type { ClaimedBid, LeagueTeam } from '@/types';

jest.mock('@/data/players', () => ({
  players: [
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
  ],
}));

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

describe('AuctionSheet with claimed bids', () => {
  it('renders without claimed bids and does not show a Claimed column', () => {
    render(<AuctionSheet claimedBids={[]} teams={mockTeams} nominatedPlayers={[]} />);

    expect(screen.queryByText('Claimed')).not.toBeInTheDocument();
  });

  it('shows a Claimed column header when at least one bid exists', () => {
    render(<AuctionSheet claimedBids={[mockClaim]} teams={mockTeams} nominatedPlayers={[]} />);

    expect(screen.getByText('Claimed')).toBeInTheDocument();
  });

  it('shows team handle and price in the claimed column for a claimed player', () => {
    render(<AuctionSheet claimedBids={[mockClaim]} teams={mockTeams} nominatedPlayers={[]} />);

    expect(screen.getByText(/coreschke/)).toBeInTheDocument();
    expect(screen.getAllByText(/\$110/).length).toBeGreaterThan(0);
  });

  it('shows EV diff with ▼ and green color when bought under target', () => {
    // mockClaim.price = 110, player.budget = 120, diff = -10 → ▼$10
    render(<AuctionSheet claimedBids={[mockClaim]} teams={mockTeams} nominatedPlayers={[]} />);

    expect(screen.getByText(/▼\$10/)).toBeInTheDocument();
  });

  it('shows EV diff with ▲ and red when overpaid', () => {
    const overClaim: ClaimedBid = { ...mockClaim, price: 130 };
    render(<AuctionSheet claimedBids={[overClaim]} teams={mockTeams} nominatedPlayers={[]} />);

    // price 130, budget 120, diff = +10 → ▲$10
    expect(screen.getByText(/▲\$10/)).toBeInTheDocument();
  });

  it('opens the modal when a claimed player row is clicked', () => {
    render(<AuctionSheet claimedBids={[mockClaim]} teams={mockTeams} nominatedPlayers={[]} />);

    fireEvent.click(screen.getAllByText('Josh Allen')[0]);

    // Modal opens in edit mode
    expect(screen.getByRole('button', { name: /update bid/i })).toBeInTheDocument();
  });

  it('opens the modal when an unclaimed player row is clicked', () => {
    render(<AuctionSheet claimedBids={[]} teams={mockTeams} nominatedPlayers={[]} />);

    fireEvent.click(screen.getByText('Justin Jefferson'));

    // Modal opens in add mode
    expect(screen.getByRole('button', { name: /log bid/i })).toBeInTheDocument();
  });
});
