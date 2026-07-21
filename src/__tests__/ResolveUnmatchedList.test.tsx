import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResolveUnmatchedList, {
  type SleeperPlayerOption,
  type UnmatchedRankingPlayer,
} from '@/components/RankingsUpload/ResolveUnmatchedList';

const mockResolve = jest.fn();
jest.mock('@/lib/rankings-actions', () => ({
  resolveRankingMatch: (...args: unknown[]) => mockResolve(...args),
}));

const UNMATCHED: UnmatchedRankingPlayer[] = [{ id: 1, name: 'J. Allen', team: 'BUF', pos: 'QB' }];
const SLEEPER_OPTIONS: SleeperPlayerOption[] = [
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

  it('shows only candidates at the unmatched player position', async () => {
    const user = userEvent.setup();
    const sleeperPlayers: SleeperPlayerOption[] = [
      { id: 'qb-1', name: 'Josh Allen', normalizedName: 'josh allen', team: 'BUF', pos: 'QB' },
      { id: 'wr-1', name: 'Josh Allen', normalizedName: 'josh allen', team: 'FA', pos: 'WR' },
    ];

    render(<ResolveUnmatchedList unmatchedPlayers={UNMATCHED} sleeperPlayers={sleeperPlayers} />);

    await user.type(screen.getByTestId('unmatched-search-1'), 'Josh Allen');

    expect(await screen.findByTestId('unmatched-result-qb-1')).toBeInTheDocument();
    expect(screen.queryByTestId('unmatched-result-wr-1')).not.toBeInTheDocument();
  });

  it('matches punctuated Sleeper names against an unpunctuated normalized query', async () => {
    const user = userEvent.setup();
    const unmatchedWideReceiver: UnmatchedRankingPlayer[] = [
      { id: 1, name: "Ja'Marr Chase", team: 'CIN', pos: 'WR' },
    ];
    render(
      <ResolveUnmatchedList
        unmatchedPlayers={unmatchedWideReceiver}
        sleeperPlayers={SLEEPER_OPTIONS}
      />,
    );

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
