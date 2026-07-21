import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BidHistoryPanel, {
  getBidRecoveryState,
  type DeletedBid,
} from '@/components/BidHistory/BidHistoryPanel';

const mockRestoreBid = jest.fn();
const mockRefresh = jest.fn();

jest.mock('@/lib/actions', () => ({
  restoreBid: (...args: unknown[]) => mockRestoreBid(...args),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const NOW = new Date('2026-07-21T16:00:00.000Z');

const RESTORABLE_BID: DeletedBid = {
  id: 12,
  player: 'Josh Allen',
  position: 'QB',
  price: 120,
  teamHandle: 'coreschke',
  deletedAt: '2026-07-21T15:45:00.000Z',
  supersededAt: null,
};

function renderPanel(overrides: Partial<React.ComponentProps<typeof BidHistoryPanel>> = {}) {
  return render(
    <BidHistoryPanel
      draftId={4}
      deletedBids={[RESTORABLE_BID]}
      isReadOnly={false}
      {...overrides}
    />,
  );
}

describe('BidHistoryPanel', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    mockRestoreBid.mockResolvedValue({ ok: true, data: { bidId: 12 } });
    mockRefresh.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('shows a restorable deleted bid with its remaining recovery time', () => {
    renderPanel();

    expect(screen.getByTestId('bid-history-panel')).toBeInTheDocument();
    expect(screen.getByTestId('deleted-bid-12')).toHaveTextContent('Josh Allen');
    expect(screen.getByTestId('restore-countdown-12')).toHaveTextContent('15:00 remaining');
    expect(screen.getByTestId('restore-bid-12')).toBeEnabled();
  });

  it('restores an eligible bid and refreshes the draft view', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderPanel();

    await user.click(screen.getByTestId('restore-bid-12'));

    expect(mockRestoreBid).toHaveBeenCalledWith({ id: 12, draftId: 4 });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('explains that an expired bid requires the recovery runbook', () => {
    renderPanel({
      deletedBids: [{ ...RESTORABLE_BID, deletedAt: '2026-07-21T15:30:00.000Z' }],
    });

    expect(screen.queryByTestId('restore-bid-12')).not.toBeInTheDocument();
    expect(screen.getByTestId('restore-unavailable-12')).toHaveTextContent(
      'Recovery window expired',
    );
    expect(screen.getByTestId('restore-unavailable-12')).toHaveTextContent('recovery runbook');
  });

  it('explains that a replacement permanently superseded the deleted bid', () => {
    renderPanel({
      deletedBids: [{ ...RESTORABLE_BID, supersededAt: '2026-07-21T15:50:00.000Z' }],
    });

    expect(screen.queryByTestId('restore-bid-12')).not.toBeInTheDocument();
    expect(screen.getByTestId('restore-unavailable-12')).toHaveTextContent(
      'Replacement bid recorded',
    );
  });

  it('links to owner-authorized CSV and JSON exports', () => {
    renderPanel();

    expect(screen.getByTestId('export-draft-csv')).toHaveAttribute(
      'href',
      '/api/draft/4/export/csv',
    );
    expect(screen.getByTestId('export-draft-json')).toHaveAttribute(
      'href',
      '/api/draft/4/export/json',
    );
  });

  it('classifies a superseded bid ahead of its remaining recovery time', () => {
    expect(
      getBidRecoveryState({ ...RESTORABLE_BID, supersededAt: '2026-07-21T15:50:00.000Z' }, NOW),
    ).toEqual({ kind: 'superseded' });
  });
});
