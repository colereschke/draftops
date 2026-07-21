import { act, render, screen, waitFor } from '@testing-library/react';
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
  { id: 's1', name: 'Josh Allen', team: 'BUF', pos: 'QB' },
  { id: 's2', name: 'Josh Jacobs', team: 'GB', pos: 'RB' },
  { id: 's3', name: "Ja'Marr Chase", team: 'CIN', pos: 'WR' },
];

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockResolve.mockResolvedValue(undefined);
  global.fetch = jest.fn().mockImplementation((url: string) =>
    Promise.resolve({
      ok: true,
      json: async () => ({
        results: [url.includes('jamarr') ? SLEEPER_OPTIONS[2] : SLEEPER_OPTIONS[0]],
      }),
    } as Response),
  );
});

afterEach(() => jest.useRealTimers());

describe('ResolveUnmatchedList', () => {
  it('renders each unmatched row', () => {
    render(<ResolveUnmatchedList unmatchedPlayers={UNMATCHED} />);
    expect(screen.getByTestId('unmatched-row-1')).toHaveTextContent('J. Allen');
  });

  it('searches Sleeper options after a debounce and resolves on selection', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<ResolveUnmatchedList unmatchedPlayers={UNMATCHED} />);

    await user.type(screen.getByTestId('unmatched-search-1'), 'Josh Al');
    await act(async () => jest.advanceTimersByTime(250));
    const match = await screen.findByTestId('unmatched-result-s1');
    await user.click(match);

    await waitFor(() => {
      expect(mockResolve).toHaveBeenCalledWith(1, 's1');
    });
  });

  it('sends the unmatched player position to the server search', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<ResolveUnmatchedList unmatchedPlayers={UNMATCHED} />);

    await user.type(screen.getByTestId('unmatched-search-1'), 'Josh Allen');
    await act(async () => jest.advanceTimersByTime(250));
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/rankings/sleeper-search?q=josh%20allen&position=QB',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('ignores an older search response after a newer query starts', async () => {
    let resolveFirst: (response: Response) => void;
    let resolveSecond: (response: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const secondResponse = new Promise<Response>((resolve) => {
      resolveSecond = resolve;
    });
    global.fetch = jest.fn().mockReturnValueOnce(firstResponse).mockReturnValueOnce(secondResponse);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<ResolveUnmatchedList unmatchedPlayers={UNMATCHED} />);

    await user.type(screen.getByTestId('unmatched-search-1'), 'Josh');
    await act(async () => jest.advanceTimersByTime(250));
    await user.type(screen.getByTestId('unmatched-search-1'), ' A');
    await act(async () => jest.advanceTimersByTime(250));

    await act(async () => {
      resolveSecond!({
        ok: true,
        json: async () => ({ results: [SLEEPER_OPTIONS[0]] }),
      } as Response);
    });
    expect(await screen.findByTestId('unmatched-result-s1')).toBeInTheDocument();

    await act(async () => {
      resolveFirst!({
        ok: true,
        json: async () => ({ results: [SLEEPER_OPTIONS[2]] }),
      } as Response);
    });
    expect(screen.queryByTestId('unmatched-result-s3')).not.toBeInTheDocument();
  });

  it('matches punctuated Sleeper names against an unpunctuated normalized query', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const unmatchedWideReceiver: UnmatchedRankingPlayer[] = [
      { id: 1, name: "Ja'Marr Chase", team: 'CIN', pos: 'WR' },
    ];
    render(<ResolveUnmatchedList unmatchedPlayers={unmatchedWideReceiver} />);

    await user.type(screen.getByTestId('unmatched-search-1'), 'jamarr');
    await act(async () => jest.advanceTimersByTime(250));
    const match = await screen.findByTestId('unmatched-result-s3');
    await user.click(match);

    await waitFor(() => {
      expect(mockResolve).toHaveBeenCalledWith(1, 's3');
    });
  });

  it('removes a row from the list once resolved', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<ResolveUnmatchedList unmatchedPlayers={UNMATCHED} />);

    await user.type(screen.getByTestId('unmatched-search-1'), 'Josh Al');
    await act(async () => jest.advanceTimersByTime(250));
    await user.click(await screen.findByTestId('unmatched-result-s1'));

    await waitFor(() => {
      expect(screen.queryByTestId('unmatched-row-1')).not.toBeInTheDocument();
    });
  });

  it('shows an error and keeps the row visible when resolving throws', async () => {
    mockResolve.mockRejectedValue(new Error('Unauthorized'));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<ResolveUnmatchedList unmatchedPlayers={UNMATCHED} />);

    await user.type(screen.getByTestId('unmatched-search-1'), 'Josh Al');
    await act(async () => jest.advanceTimersByTime(250));
    await user.click(await screen.findByTestId('unmatched-result-s1'));

    await waitFor(() => {
      expect(screen.getByText('Failed to resolve — try again.')).toBeInTheDocument();
    });
    expect(screen.getByTestId('unmatched-row-1')).toBeInTheDocument();
  });
});
