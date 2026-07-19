import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  playerId: 10,
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

  it('calls onSubmit with price and teamId when submitted', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    render(
      <BidModal player={mockPlayer} teams={mockTeams} onClose={jest.fn()} onSubmit={onSubmit} />,
    );

    await user.clear(screen.getByLabelText('Price'));
    await user.type(screen.getByLabelText('Price'), '110');

    const trigger = screen.getByRole('combobox', { name: /won by/i });
    await user.click(trigger);
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));
    await user.click(screen.getByRole('option', { name: /chappy72/i }));

    await user.click(screen.getByRole('button', { name: /log bid/i }));

    expect(onSubmit).toHaveBeenCalledWith({ price: 110, teamId: 2 });
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(
      <BidModal player={mockPlayer} teams={mockTeams} onClose={onClose} onSubmit={jest.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(
      <BidModal player={mockPlayer} teams={mockTeams} onClose={onClose} onSubmit={jest.fn()} />,
    );

    await user.keyboard('{Escape}');

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('does not show a Remove button in add mode', () => {
    render(
      <BidModal player={mockPlayer} teams={mockTeams} onClose={jest.fn()} onSubmit={jest.fn()} />,
    );

    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('uses an explicit viewport-safe width instead of a fragile arbitrary width class', () => {
    render(
      <BidModal player={mockPlayer} teams={mockTeams} onClose={jest.fn()} onSubmit={jest.fn()} />,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveStyle({
      width: '360px',
      maxWidth: 'calc(100vw - 32px)',
    });
    expect(dialog).not.toHaveClass('w-[360px]');
  });

  it('uses the same restrained focus treatment as value-sheet search for price input', () => {
    render(
      <BidModal player={mockPlayer} teams={mockTeams} onClose={jest.fn()} onSubmit={jest.fn()} />,
    );

    expect(screen.getByLabelText('Price')).toHaveClass(
      'focus-visible:border-border',
      'focus-visible:ring-1',
      'focus-visible:ring-border',
    );
  });

  it('submits via Enter key in the price field (keyboard-only logging)', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    render(
      <BidModal player={mockPlayer} teams={mockTeams} onClose={jest.fn()} onSubmit={onSubmit} />,
    );

    await user.clear(screen.getByLabelText('Price'));
    await user.type(screen.getByLabelText('Price'), '110{Enter}');

    expect(onSubmit).toHaveBeenCalledWith({ price: 110, teamId: 1 });
  });

  it('disables the price field and shows a saving label on the submit button while isSubmitting', () => {
    render(
      <BidModal
        player={mockPlayer}
        teams={mockTeams}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
        isSubmitting
      />,
    );

    expect(screen.getByLabelText('Price')).toBeDisabled();
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  });

  it('shows projection price context when available', () => {
    render(
      <BidModal
        player={{
          ...mockPlayer,
          baseBudget: 120,
          projectionAuctionValue: 113,
          projectedPoints: 410.5,
          vor: 150.4,
          valueSource: 'fallback',
        }}
        teams={mockTeams}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );

    expect(screen.getByText('Price context')).toBeInTheDocument();
    expect(screen.getByText('Dynasty')).toBeInTheDocument();
    expect(screen.getByText('Projection')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByTestId('bid-price-context-dynasty')).toHaveTextContent('$120');
    expect(screen.getByTestId('bid-price-context-projection')).toHaveTextContent('$113');
    expect(screen.getByTestId('bid-price-context-active')).toHaveTextContent('$120');
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

  it('arms a confirmation instead of calling onDelete on the first Remove click', async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByRole('button', { name: /^remove$/i }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /confirm remove/i })).toBeInTheDocument();
  });

  it('calls onDelete after confirming Remove a second time', async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByRole('button', { name: /^remove$/i }));
    await user.click(screen.getByRole('button', { name: /confirm remove/i }));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('does not call onDelete when Keep is clicked after arming Remove', async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByRole('button', { name: /^remove$/i }));
    await user.click(screen.getByRole('button', { name: /^keep$/i }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^remove$/i })).toBeInTheDocument();
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

  it('calls onNominate and onClose when Nom is clicked', async () => {
    const user = userEvent.setup();
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
    await user.click(screen.getByRole('button', { name: /^nom$/i }));
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

describe('BidModal — team select', () => {
  it('shows the selected team label instead of the raw team id', () => {
    render(
      <BidModal player={mockPlayer} teams={mockTeams} onClose={jest.fn()} onSubmit={jest.fn()} />,
    );

    const trigger = screen.getByRole('combobox', { name: /won by/i });

    expect(trigger).toHaveTextContent('Cole');
    expect(trigger).toHaveTextContent('coreschke');
    expect(trigger).not.toHaveTextContent(/^1$/);
  });

  it('opens the Won By select and lists both teams as options', async () => {
    const user = userEvent.setup();
    render(
      <BidModal player={mockPlayer} teams={mockTeams} onClose={jest.fn()} onSubmit={jest.fn()} />,
    );

    const trigger = screen.getByRole('combobox', { name: /won by/i });
    await user.click(trigger);
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));

    expect(screen.getByRole('option', { name: /coreschke/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /chappy72/i })).toBeInTheDocument();
  });
});
