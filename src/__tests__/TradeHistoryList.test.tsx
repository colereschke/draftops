import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import TradeHistoryList, {
  type TradeHistoryEntry,
} from '@/components/TradeHistory/TradeHistoryList';
import { deleteTrade, restoreTrade, updateTrade } from '@/lib/actions';

jest.mock('@/lib/actions', () => ({
  deleteTrade: jest.fn(),
  restoreTrade: jest.fn(),
  updateTrade: jest.fn(),
}));
const mockDeleteTrade = deleteTrade as jest.Mock;
const mockUpdateTrade = updateTrade as jest.Mock;
const mockRestoreTrade = restoreTrade as jest.Mock;

const mockRouterRefresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRouterRefresh }) }));

const TRADE: TradeHistoryEntry = {
  id: 501,
  budgetTeamHandle: 'team-a',
  pickTeamHandle: 'team-b',
  budgetAmount: 80,
  picks: [{ originHandle: 'team-b', futurePickYear: 2028, futurePickRound: 1 }],
  createdAt: '2026-08-01T00:00:00.000Z',
  deletedAt: null,
};
const NOW = new Date('2026-08-01T00:05:00.000Z').getTime(); // 5 minutes after createdAt

describe('TradeHistoryList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('renders each trade with its direction, amount, and picks', () => {
    render(<TradeHistoryList draftId={4} trades={[TRADE]} nowMs={NOW} />);

    expect(screen.getByTestId('trade-history')).toBeInTheDocument();
    const row = screen.getByTestId('trade-history-row-501');
    expect(row).toHaveTextContent('team-a');
    expect(row).toHaveTextContent('team-b');
    expect(row).toHaveTextContent('$80');
    expect(row).toHaveTextContent('team-b 2028 round 1');
  });

  it('shows an empty state when no trades exist', () => {
    render(<TradeHistoryList draftId={4} trades={[]} nowMs={NOW} />);

    expect(screen.getByTestId('trade-history-empty')).toBeInTheDocument();
  });

  it('deletes a trade when Remove is clicked and confirmed', async () => {
    mockDeleteTrade.mockResolvedValue({ ok: true, data: null });
    render(<TradeHistoryList draftId={4} trades={[TRADE]} nowMs={NOW} />);

    fireEvent.click(screen.getByTestId('trade-history-remove-501'));
    fireEvent.click(screen.getByTestId('trade-history-confirm-remove-501'));

    await waitFor(() => expect(mockDeleteTrade).toHaveBeenCalledWith({ id: 501, draftId: 4 }));
    expect(mockRouterRefresh).toHaveBeenCalled();
  });

  it('requires the second confirm step before calling deleteTrade', async () => {
    render(<TradeHistoryList draftId={4} trades={[TRADE]} nowMs={NOW} />);

    fireEvent.click(screen.getByTestId('trade-history-remove-501'));
    expect(mockDeleteTrade).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('trade-history-keep-501'));

    await waitFor(() => expect(screen.getByTestId('trade-history-remove-501')).toBeInTheDocument());
    expect(mockDeleteTrade).not.toHaveBeenCalled();
    expect(screen.queryByTestId('trade-history-confirm-remove-501')).not.toBeInTheDocument();
  });

  it('shows a visible error, not just an sr-only one, when delete fails', async () => {
    mockDeleteTrade.mockResolvedValue({ ok: false, code: 'PICK_ALREADY_RETRADED' });
    render(<TradeHistoryList draftId={4} trades={[TRADE]} nowMs={NOW} />);

    fireEvent.click(screen.getByTestId('trade-history-remove-501'));
    fireEvent.click(screen.getByTestId('trade-history-confirm-remove-501'));

    const visibleError = await screen.findByTestId('trade-history-error-501');
    expect(visibleError).toHaveTextContent(
      'A later trade already re-traded one of these picks. Remove that one first.',
    );
    expect(visibleError.className).not.toMatch(/sr-only/);
  });

  it('shows a visible error and still refreshes when the delete action throws', async () => {
    mockDeleteTrade.mockRejectedValue(new Error('network down'));
    render(<TradeHistoryList draftId={4} trades={[TRADE]} nowMs={NOW} />);

    fireEvent.click(screen.getByTestId('trade-history-remove-501'));
    fireEvent.click(screen.getByTestId('trade-history-confirm-remove-501'));

    const visibleError = await screen.findByTestId('trade-history-error-501');
    expect(visibleError).toHaveTextContent('Unable to remove this trade. Refresh and try again.');
    expect(mockRouterRefresh).toHaveBeenCalled();
  });

  it('edits the budget amount via the edit affordance', async () => {
    mockUpdateTrade.mockResolvedValue({ ok: true, data: { tradeId: 501 } });
    render(<TradeHistoryList draftId={4} trades={[TRADE]} nowMs={NOW} />);

    fireEvent.click(screen.getByTestId('trade-history-edit-501'));
    fireEvent.change(screen.getByTestId('trade-history-edit-amount-501'), {
      target: { value: '60' },
    });
    fireEvent.click(screen.getByTestId('trade-history-save-501'));

    await waitFor(() =>
      expect(mockUpdateTrade).toHaveBeenCalledWith({ id: 501, budgetAmount: 60, draftId: 4 }),
    );
    expect(mockRouterRefresh).toHaveBeenCalled();
  });

  it('rejects a non-positive amount locally without calling updateTrade', async () => {
    render(<TradeHistoryList draftId={4} trades={[TRADE]} nowMs={NOW} />);

    fireEvent.click(screen.getByTestId('trade-history-edit-501'));
    fireEvent.change(screen.getByTestId('trade-history-edit-amount-501'), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByTestId('trade-history-save-501'));

    const visibleError = await screen.findByTestId('trade-history-error-501');
    expect(visibleError).toHaveTextContent('Enter a valid, positive budget amount.');
    expect(mockUpdateTrade).not.toHaveBeenCalled();
    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it('clears a stale row error when the edit is cancelled', async () => {
    render(<TradeHistoryList draftId={4} trades={[TRADE]} nowMs={NOW} />);

    fireEvent.click(screen.getByTestId('trade-history-edit-501'));
    fireEvent.change(screen.getByTestId('trade-history-edit-amount-501'), {
      target: { value: '-4' },
    });
    fireEvent.click(screen.getByTestId('trade-history-save-501'));
    await screen.findByTestId('trade-history-error-501');

    fireEvent.click(screen.getByTestId('trade-history-cancel-edit-501'));

    expect(screen.queryByTestId('trade-history-error-501')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trade-history-edit-amount-501')).not.toBeInTheDocument();
  });

  it('offers Restore inside the 30-minute window', () => {
    render(
      <TradeHistoryList
        draftId={4}
        trades={[{ ...TRADE, deletedAt: '2026-08-01T00:05:00.000Z' }]}
        nowMs={new Date('2026-08-01T00:15:00.000Z').getTime()} // 10 min after deletion
      />,
    );
    expect(screen.getByTestId('trade-history-restore-501')).not.toBeDisabled();
  });

  it('hides Restore once the 30-minute window has passed', () => {
    render(
      <TradeHistoryList
        draftId={4}
        trades={[{ ...TRADE, deletedAt: '2026-08-01T00:05:00.000Z' }]}
        nowMs={new Date('2026-08-01T00:40:00.000Z').getTime()} // 35 min after deletion
      />,
    );
    expect(screen.queryByTestId('trade-history-restore-501')).not.toBeInTheDocument();
    expect(screen.getByTestId('trade-history-expired-501')).toBeInTheDocument();
  });

  it('does not offer Edit or Remove on an already-removed trade', () => {
    render(
      <TradeHistoryList
        draftId={4}
        trades={[{ ...TRADE, deletedAt: '2026-08-01T00:05:00.000Z' }]}
        nowMs={new Date('2026-08-01T00:15:00.000Z').getTime()}
      />,
    );

    expect(screen.queryByTestId('trade-history-edit-501')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trade-history-remove-501')).not.toBeInTheDocument();
  });

  it('restores a removed trade and refreshes', async () => {
    mockRestoreTrade.mockResolvedValue({ ok: true, data: { tradeId: 501 } });
    render(
      <TradeHistoryList
        draftId={4}
        trades={[{ ...TRADE, deletedAt: '2026-08-01T00:05:00.000Z' }]}
        nowMs={new Date('2026-08-01T00:15:00.000Z').getTime()}
      />,
    );

    fireEvent.click(screen.getByTestId('trade-history-restore-501'));

    await waitFor(() => expect(mockRestoreTrade).toHaveBeenCalledWith({ id: 501, draftId: 4 }));
    expect(mockRouterRefresh).toHaveBeenCalled();
  });

  it('expires the Restore button live as the clock ticks, with no page refresh', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-01T00:34:59.000Z')); // 29:59 after deletion
    render(
      <TradeHistoryList
        draftId={4}
        trades={[{ ...TRADE, deletedAt: '2026-08-01T00:05:00.000Z' }]}
      />,
    );

    expect(screen.getByTestId('trade-history-restore-501')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(screen.queryByTestId('trade-history-restore-501')).not.toBeInTheDocument();
    expect(screen.getByTestId('trade-history-expired-501')).toBeInTheDocument();
  });

  it('clears the ticking interval on unmount', () => {
    jest.useFakeTimers();
    const clearIntervalSpy = jest.spyOn(window, 'clearInterval');
    const { unmount } = render(<TradeHistoryList draftId={4} trades={[TRADE]} />);

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
