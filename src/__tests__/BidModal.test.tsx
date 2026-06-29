import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BidModal from '@/components/BidModal/BidModal';
import type { Player, ClaimedBid, LeagueTeam } from '@/types';

const mockPlayer: Player = {
  player: 'Josh Allen',
  team: 'BUF',
  pos: 'QB',
  age: 28,
  sfRank: 1,
  budget: 120,
  ceiling: 138,
  floor: 104,
  notes: '',
};

const mockTeams: LeagueTeam[] = [
  { id: 1, handle: 'coreschke', displayName: 'Cole' },
  { id: 2, handle: 'chappy72', displayName: null },
];

const mockExistingBid: ClaimedBid = {
  id: 10,
  player: 'Josh Allen',
  position: 'QB',
  price: 115,
  teamId: 1,
  teamHandle: 'coreschke',
};

describe('BidModal — add mode', () => {
  it('displays the player name and position', () => {
    render(
      <BidModal player={mockPlayer} teams={mockTeams} onClose={jest.fn()} onSubmit={jest.fn()} />,
    );

    expect(screen.getByText('Josh Allen')).toBeInTheDocument();
    expect(screen.getByText('QB')).toBeInTheDocument();
  });

  it('calls onSubmit with price and teamId when submitted', () => {
    const onSubmit = jest.fn();
    render(
      <BidModal player={mockPlayer} teams={mockTeams} onClose={jest.fn()} onSubmit={onSubmit} />,
    );

    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '110' } });
    fireEvent.change(screen.getByLabelText('Won By'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /log bid/i }));

    expect(onSubmit).toHaveBeenCalledWith({ price: 110, teamId: 2 });
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = jest.fn();
    render(
      <BidModal player={mockPlayer} teams={mockTeams} onClose={onClose} onSubmit={jest.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = jest.fn();
    render(
      <BidModal player={mockPlayer} teams={mockTeams} onClose={onClose} onSubmit={jest.fn()} />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('does not show a Remove button in add mode', () => {
    render(
      <BidModal player={mockPlayer} teams={mockTeams} onClose={jest.fn()} onSubmit={jest.fn()} />,
    );

    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });
});

describe('BidModal — edit mode', () => {
  it('pre-fills price from existingBid', () => {
    render(
      <BidModal
        player={mockPlayer}
        teams={mockTeams}
        existingBid={mockExistingBid}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );

    expect(screen.getByLabelText<HTMLInputElement>('Price').value).toBe('115');
  });

  it('shows a Remove button in edit mode', () => {
    render(
      <BidModal
        player={mockPlayer}
        teams={mockTeams}
        existingBid={mockExistingBid}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });

  it('calls onDelete when Remove is clicked', () => {
    const onDelete = jest.fn();
    render(
      <BidModal
        player={mockPlayer}
        teams={mockTeams}
        existingBid={mockExistingBid}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /remove/i }));

    expect(onDelete).toHaveBeenCalled();
  });

  it('shows "Update Bid" as the submit label in edit mode', () => {
    render(
      <BidModal
        player={mockPlayer}
        teams={mockTeams}
        existingBid={mockExistingBid}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /update bid/i })).toBeInTheDocument();
  });
});

describe('BidModal — nomination', () => {
  it('shows a Nom button when onNominate is provided and isNominated is false', () => {
    render(
      <BidModal
        player={mockPlayer}
        teams={mockTeams}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
        onNominate={jest.fn()}
        isNominated={false}
      />,
    );
    expect(screen.getByRole('button', { name: /^nom$/i })).toBeInTheDocument();
  });

  it('calls onNominate and onClose when Nom is clicked', () => {
    const onNominate = jest.fn();
    const onClose = jest.fn();
    render(
      <BidModal
        player={mockPlayer}
        teams={mockTeams}
        onClose={onClose}
        onSubmit={jest.fn()}
        onNominate={onNominate}
        isNominated={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^nom$/i }));
    expect(onNominate).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows "In Auction" and no Nom button when isNominated is true', () => {
    render(
      <BidModal
        player={mockPlayer}
        teams={mockTeams}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
        onNominate={jest.fn()}
        isNominated={true}
      />,
    );
    expect(screen.queryByRole('button', { name: /^nom$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/in auction/i)).toBeInTheDocument();
  });

  it('shows neither Nom button nor In Auction label when onNominate is not provided', () => {
    render(
      <BidModal player={mockPlayer} teams={mockTeams} onClose={jest.fn()} onSubmit={jest.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /^nom$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/in auction/i)).not.toBeInTheDocument();
  });
});
