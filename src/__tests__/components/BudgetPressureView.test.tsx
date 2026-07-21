import { render, screen } from '@testing-library/react';
import BudgetPressureView from '@/components/BudgetPressure/BudgetPressureView';
import type { TeamStats } from '@/types';
import type { ManagerTendency, Appetite, AppetitePos } from '@/lib/tendencies';

jest.mock('@/components/BudgetPressure/BudgetRefresher', () => ({
  __esModule: true,
  default: () => <div data-testid="budget-refresher" />,
}));

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
  avgAge: null,
});

const posT = (position: AppetitePos, appetite: Appetite) => ({
  position,
  buys: 3,
  spend: 0,
  valueSum: 0,
  deltaSum: 0,
  avgDelta: null,
  overPct: null,
  spendShare: 0,
  appetite,
});

const tend = (teamId: number, handle: string): ManagerTendency => ({
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
    QB: posT('QB', 'neutral'),
    RB: posT('RB', 'neutral'),
    WR: posT('WR', 'neutral'),
    TE: posT('TE', 'neutral'),
  },
});

const teams: TeamStats[] = [stats(1, 'coreschke', 660), stats(2, 'rival_b', 40)];
const tendencies = [tend(1, 'coreschke'), tend(2, 'rival_b')];

describe('BudgetPressureView', () => {
  it('renders secondary market metrics and the threat board', () => {
    render(
      <BudgetPressureView
        teams={teams}
        tendencies={tendencies}
        livePosition="WR"
        liveName="Puka Nacua"
        ownerHandle="coreschke"
      />,
    );
    // Room Liquidity = 660 + 40 = 700; Low Power = 1 team under $50.
    expect(screen.getByText('$700')).toBeInTheDocument();
    expect(screen.getByText('1 teams')).toBeInTheDocument();
    // ThreatBoard is mounted with a row per team.
    expect(screen.getByTestId('threat-row-coreschke')).toBeInTheDocument();
    expect(screen.getByTestId('threat-row-rival_b')).toBeInTheDocument();
  });

  it('defaults to Superflex and the $1,000 budget caption when settings are not provided', () => {
    render(
      <BudgetPressureView
        teams={teams}
        tendencies={tendencies}
        livePosition="WR"
        liveName="Puka Nacua"
        ownerHandle="coreschke"
      />,
    );
    expect(
      screen.getByText('2-Team · Superflex · $1,000 Budget · Live Threat'),
    ).toBeInTheDocument();
  });

  it('reflects a non-default budget and lineup format truthfully', () => {
    render(
      <BudgetPressureView
        teams={teams}
        tendencies={tendencies}
        livePosition="WR"
        liveName="Puka Nacua"
        ownerHandle="coreschke"
        budget={200}
        startingLineup={['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX']}
      />,
    );
    expect(screen.getByText('2-Team · 1QB · $200 Budget · Live Threat')).toBeInTheDocument();
  });
});
