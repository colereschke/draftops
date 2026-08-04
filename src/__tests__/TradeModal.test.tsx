import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TradeModal from '@/components/TradeModal/TradeModal';
import { logTrade } from '@/lib/actions';
import type { LeagueTeam } from '@/types';
import type { KnownPickOption } from '@/lib/tradePicker';

jest.mock('@/lib/actions', () => ({ logTrade: jest.fn() }));
const mockLogTrade = logTrade as jest.Mock;

const mockRouterRefresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRouterRefresh }) }));

const TEAMS: LeagueTeam[] = [
  { id: 7, handle: 'team-a', displayName: 'Team A' },
  { id: 9, handle: 'team-b', displayName: 'Team B' },
];

const PICKS_BY_TEAM: Record<number, KnownPickOption[]> = {
  7: [],
  9: [{ originTeamId: 9, originHandle: 'team-b', futurePickYear: 2027, futurePickRound: 1 }],
};

beforeEach(() => jest.clearAllMocks());

describe('TradeModal', () => {
  it('submits a trade with a checked known pick, initiating team as budget-sender by default', async () => {
    mockLogTrade.mockResolvedValue({ ok: true, data: { tradeId: 501 } });
    const onClose = jest.fn();

    render(
      <TradeModal
        draftId={4}
        teams={TEAMS}
        initialTeamId={7}
        generatedPickYear={2027}
        tradeablePicksByTeamId={PICKS_BY_TEAM}
        isOpen
        onClose={onClose}
      />,
    );

    fireEvent.change(screen.getByTestId('trade-counterparty-select'), { target: { value: '9' } });
    fireEvent.change(screen.getByTestId('trade-budget-amount-input'), { target: { value: '80' } });
    fireEvent.click(screen.getByTestId('trade-pick-checkbox-9:2027:1'));
    fireEvent.click(screen.getByTestId('trade-submit-button'));

    await waitFor(() =>
      expect(mockLogTrade).toHaveBeenCalledWith({
        budgetTeamId: 7,
        pickTeamId: 9,
        budgetAmount: 80,
        notes: undefined,
        picks: [{ originTeamId: 9, futurePickYear: 2027, futurePickRound: 1 }],
        draftId: 4,
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockRouterRefresh).toHaveBeenCalled();
  });

  it('shows a mapped error message and refreshes without closing when the mutation is rejected', async () => {
    mockLogTrade.mockResolvedValue({ ok: false, code: 'TRADE_EXCEEDS_BUDGET' });
    const onClose = jest.fn();

    render(
      <TradeModal
        draftId={4}
        teams={TEAMS}
        initialTeamId={7}
        generatedPickYear={2027}
        tradeablePicksByTeamId={PICKS_BY_TEAM}
        isOpen
        onClose={onClose}
      />,
    );

    fireEvent.change(screen.getByTestId('trade-counterparty-select'), { target: { value: '9' } });
    fireEvent.change(screen.getByTestId('trade-budget-amount-input'), { target: { value: '80' } });
    fireEvent.click(screen.getByTestId('trade-pick-checkbox-9:2027:1'));
    fireEvent.click(screen.getByTestId('trade-submit-button'));

    await waitFor(() =>
      expect(screen.getByTestId('trade-modal-error')).toHaveTextContent(
        'This trade would leave a team without enough budget for its roster.',
      ),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(mockRouterRefresh).toHaveBeenCalled();
  });

  it('swaps direction so the initiating team sends picks instead of budget', async () => {
    mockLogTrade.mockResolvedValue({ ok: true, data: { tradeId: 502 } });

    render(
      <TradeModal
        draftId={4}
        teams={TEAMS}
        initialTeamId={9}
        generatedPickYear={2027}
        tradeablePicksByTeamId={PICKS_BY_TEAM}
        isOpen
        onClose={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('trade-role-picks-radio')); // initiating team (9) sends picks
    fireEvent.change(screen.getByTestId('trade-counterparty-select'), { target: { value: '7' } });
    fireEvent.change(screen.getByTestId('trade-budget-amount-input'), { target: { value: '50' } });
    fireEvent.click(screen.getByTestId('trade-pick-checkbox-9:2027:1'));
    fireEvent.click(screen.getByTestId('trade-submit-button'));

    await waitFor(() =>
      expect(mockLogTrade).toHaveBeenCalledWith(
        expect.objectContaining({ budgetTeamId: 7, pickTeamId: 9 }),
      ),
    );
  });

  it('adds an off-book pick for a year beyond the generated one and submits it', async () => {
    mockLogTrade.mockResolvedValue({ ok: true, data: { tradeId: 503 } });

    render(
      <TradeModal
        draftId={4}
        teams={TEAMS}
        initialTeamId={7}
        generatedPickYear={2027}
        tradeablePicksByTeamId={{ 7: [], 9: [] }}
        isOpen
        onClose={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId('trade-counterparty-select'), { target: { value: '9' } });
    fireEvent.change(screen.getByTestId('trade-budget-amount-input'), { target: { value: '80' } });
    fireEvent.change(screen.getByTestId('trade-manual-origin-select'), { target: { value: '9' } });
    fireEvent.change(screen.getByTestId('trade-manual-year-input'), { target: { value: '2028' } });
    fireEvent.change(screen.getByTestId('trade-manual-round-select'), { target: { value: '1' } });
    fireEvent.click(screen.getByTestId('trade-manual-add-button'));
    fireEvent.click(screen.getByTestId('trade-submit-button'));

    await waitFor(() =>
      expect(mockLogTrade).toHaveBeenCalledWith(
        expect.objectContaining({
          picks: [{ originTeamId: 9, futurePickYear: 2028, futurePickRound: 1 }],
        }),
      ),
    );
  });

  it('rejects an off-book year that is not after the generated year', () => {
    render(
      <TradeModal
        draftId={4}
        teams={TEAMS}
        initialTeamId={7}
        generatedPickYear={2027}
        tradeablePicksByTeamId={{ 7: [], 9: [] }}
        isOpen
        onClose={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId('trade-counterparty-select'), { target: { value: '9' } });
    fireEvent.change(screen.getByTestId('trade-manual-origin-select'), { target: { value: '9' } });
    fireEvent.change(screen.getByTestId('trade-manual-year-input'), { target: { value: '2027' } }); // not after 2027
    fireEvent.change(screen.getByTestId('trade-manual-round-select'), { target: { value: '1' } });

    expect(screen.getByTestId('trade-manual-add-button')).toBeDisabled();
  });

  it('disables submit until at least one pick is selected', () => {
    render(
      <TradeModal
        draftId={4}
        teams={TEAMS}
        initialTeamId={7}
        generatedPickYear={2027}
        tradeablePicksByTeamId={PICKS_BY_TEAM}
        isOpen
        onClose={jest.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId('trade-counterparty-select'), { target: { value: '9' } });
    fireEvent.change(screen.getByTestId('trade-budget-amount-input'), { target: { value: '80' } });
    expect(screen.getByTestId('trade-submit-button')).toBeDisabled();
  });
});
