import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThreatBoard from '@/components/BudgetPressure/ThreatBoard';
import type { TeamStats } from '@/types';
import type { ManagerTendency, Appetite, AppetitePos } from '@/lib/tendencies';

const stats = (id: number, handle: string, buyingPower: number): TeamStats => ({
  id,
  handle,
  displayName: handle,
  budget: 1000,
  spent: 0,
  remaining: buyingPower + 20,
  rosterCount: 5,
  rosterRemaining: 20,
  buyingPower,
  pkgCount: 0,
});

const pos = (position: AppetitePos, appetite: Appetite) => ({
  position,
  buys: appetite === 'no-read' ? 0 : 3,
  spend: 0,
  valueSum: 0,
  deltaSum: 0,
  avgDelta: null,
  overPct: null,
  spendShare: 0,
  appetite,
});

const tend = (teamId: number, handle: string, wr: Appetite): ManagerTendency => ({
  teamId,
  handle,
  displayName: handle,
  buys: 5,
  totalSpend: 500,
  totalValue: 480,
  overallOverPct: 0.04,
  topBuy: 120,
  lean: 'balanced',
  aggression: 'neutral',
  positions: {
    QB: pos('QB', 'neutral'),
    RB: pos('RB', 'neutral'),
    WR: pos('WR', wr),
    TE: pos('TE', 'neutral'),
  },
});

const teams = [stats(1, 'rival_a', 312), stats(2, 'rival_b', 340), stats(3, 'you', 190)];
const tendencies = [
  tend(1, 'rival_a', 'overpays'),
  tend(2, 'rival_b', 'thrifty'),
  tend(3, 'you', 'neutral'),
];

describe('ThreatBoard', () => {
  it('auto-selects the live nomination position', () => {
    render(
      <ThreatBoard
        teams={teams}
        tendencies={tendencies}
        livePosition="WR"
        liveName="Puka Nacua"
        ownerHandle="you"
      />,
    );
    expect(screen.getByTestId('threat-pos-WR')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('threat-live-chip')).toHaveTextContent('Puka Nacua');
  });

  it('ranks a WR-overpayer above a flush WR-thrifty rival', () => {
    render(
      <ThreatBoard
        teams={teams}
        tendencies={tendencies}
        livePosition="WR"
        liveName="Puka Nacua"
        ownerHandle="you"
      />,
    );
    const rows = screen.getAllByTestId(/^threat-row-/);
    expect(rows[0]).toHaveAttribute('data-testid', 'threat-row-rival_a');
  });

  it('honors a manual override and keeps it after a simulated refresh', async () => {
    const { rerender } = render(
      <ThreatBoard
        teams={teams}
        tendencies={tendencies}
        livePosition="WR"
        liveName="Puka Nacua"
        ownerHandle="you"
      />,
    );
    await userEvent.click(screen.getByTestId('threat-pos-QB'));
    expect(screen.getByTestId('threat-pos-QB')).toHaveAttribute('aria-pressed', 'true');
    // Simulate the 20s refresh handing down a new live position:
    rerender(
      <ThreatBoard
        teams={teams}
        tendencies={tendencies}
        livePosition="RB"
        liveName="Bijan"
        ownerHandle="you"
      />,
    );
    expect(screen.getByTestId('threat-pos-QB')).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows no re-sync pill when the board already matches the live nomination', () => {
    render(
      <ThreatBoard
        teams={teams}
        tendencies={tendencies}
        livePosition="WR"
        liveName="Puka Nacua"
        ownerHandle="you"
      />,
    );
    expect(screen.queryByTestId('threat-live-resync')).not.toBeInTheDocument();
  });

  it('offers a live re-sync pill when an override diverges from the live nomination, and jumps back on click', async () => {
    render(
      <ThreatBoard
        teams={teams}
        tendencies={tendencies}
        livePosition="WR"
        liveName="Puka Nacua"
        ownerHandle="you"
      />,
    );
    // Override to QB while WR is live -> pill appears naming the live position.
    await userEvent.click(screen.getByTestId('threat-pos-QB'));
    const pill = screen.getByTestId('threat-live-resync');
    expect(pill).toHaveTextContent('WR');
    // Clicking it clears the override and snaps back to the live WR board.
    await userEvent.click(pill);
    expect(screen.getByTestId('threat-pos-WR')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('threat-live-resync')).not.toBeInTheDocument();
  });
});
