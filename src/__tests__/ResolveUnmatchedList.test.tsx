import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResolveUnmatchedList from '@/components/RankingsUpload/ResolveUnmatchedList';

const mockResolve = jest.fn();
jest.mock('@/lib/rankings-actions', () => ({
  resolveRankingMatch: (...args: unknown[]) => mockResolve(...args),
}));

const UNMATCHED = [{ id: 1, name: 'J. Allen', team: 'BUF', pos: 'QB' }];
const SLEEPER_OPTIONS = [
  { id: 's1', name: 'Josh Allen', normalizedName: 'josh allen', team: 'BUF', pos: 'QB' },
  { id: 's2', name: 'Josh Jacobs', normalizedName: 'josh jacobs', team: 'GB', pos: 'RB' },
  { id: 's3', name: "Ja'Marr Chase", normalizedName: 'jamarr chase', team: 'CIN', pos: 'WR' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockResolve.mockResolvedValue(undefined);
});

describe('ResolveUnmatchedList', () => {
  it('renders each unmatched row', () => {
    render(<ResolveUnmatchedList unmatchedPlayers={UNMATCHED} sleeperPlayers={SLEEPER_OPTIONS} />);
    expect(screen.getByTestId('unmatched-row-1')).toHaveTextContent('J. Allen');
  });

  it('filters Sleeper options as the user types and resolves on selection', async () => {
    const user = userEvent.setup();
    render(<ResolveUnmatchedList unmatchedPlayers={UNMATCHED} sleeperPlayers={SLEEPER_OPTIONS} />);

    await user.type(screen.getByTestId('unmatched-search-1'), 'Josh Al');
    const match = await screen.findByTestId('unmatched-result-s1');
    await user.click(match);

    await waitFor(() => {
      expect(mockResolve).toHaveBeenCalledWith(1, 's1');
    });
  });

  it('matches punctuated Sleeper names against an unpunctuated normalized query', async () => {
    const user = userEvent.setup();
    render(<ResolveUnmatchedList unmatchedPlayers={UNMATCHED} sleeperPlayers={SLEEPER_OPTIONS} />);

    await user.type(screen.getByTestId('unmatched-search-1'), 'jamarr');
    const match = await screen.findByTestId('unmatched-result-s3');
    await user.click(match);

    await waitFor(() => {
      expect(mockResolve).toHaveBeenCalledWith(1, 's3');
    });
  });

  it('removes a row from the list once resolved', async () => {
    const user = userEvent.setup();
    render(<ResolveUnmatchedList unmatchedPlayers={UNMATCHED} sleeperPlayers={SLEEPER_OPTIONS} />);

    await user.type(screen.getByTestId('unmatched-search-1'), 'Josh Al');
    await user.click(await screen.findByTestId('unmatched-result-s1'));

    await waitFor(() => {
      expect(screen.queryByTestId('unmatched-row-1')).not.toBeInTheDocument();
    });
  });

  it('shows an error and keeps the row visible when resolving throws', async () => {
    mockResolve.mockRejectedValue(new Error('Unauthorized'));
    const user = userEvent.setup();
    render(<ResolveUnmatchedList unmatchedPlayers={UNMATCHED} sleeperPlayers={SLEEPER_OPTIONS} />);

    await user.type(screen.getByTestId('unmatched-search-1'), 'Josh Al');
    await user.click(await screen.findByTestId('unmatched-result-s1'));

    await waitFor(() => {
      expect(screen.getByText('Failed to resolve — try again.')).toBeInTheDocument();
    });
    expect(screen.getByTestId('unmatched-row-1')).toBeInTheDocument();
  });
});
