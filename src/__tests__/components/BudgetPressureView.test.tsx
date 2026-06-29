import { render, screen } from '@testing-library/react';
import BudgetPressureView from '@/components/BudgetPressure/BudgetPressureView';
import type { TeamStats } from '@/types';

jest.mock('@/components/BudgetPressure/BudgetRefresher', () => ({
  __esModule: true,
  default: () => <div data-testid="budget-refresher" />,
}));

const makeTeam = (overrides: Partial<TeamStats>): TeamStats => ({
  id: 1,
  handle: 'testteam',
  displayName: null,
  budget: 1000,
  spent: 0,
  remaining: 1000,
  rosterCount: 0,
  rosterRemaining: 30,
  buyingPower: 970,
  pkgCount: 0,
  ...overrides,
});

const teams: TeamStats[] = [
  makeTeam({
    id: 1,
    handle: 'coreschke',
    displayName: 'Cole',
    buyingPower: 800,
    remaining: 830,
    spent: 170,
    rosterCount: 5,
    rosterRemaining: 25,
  }),
  makeTeam({
    id: 2,
    handle: 'chappy72',
    buyingPower: 100,
    remaining: 122,
    spent: 878,
    rosterCount: 22,
    rosterRemaining: 22,
  }),
  makeTeam({
    id: 3,
    handle: 'DrFunk',
    buyingPower: 30,
    remaining: 60,
    spent: 940,
    rosterCount: 28,
    rosterRemaining: 2,
  }),
];

describe('BudgetPressureView', () => {
  it('renders a row for each team', () => {
    render(<BudgetPressureView teams={teams} ownerHandle="coreschke" />);
    expect(screen.getByText('Cole')).toBeInTheDocument();
    expect(screen.getByText('chappy72')).toBeInTheDocument();
    expect(screen.getByText('DrFunk')).toBeInTheDocument();
  });

  it('displays handle when displayName is null', () => {
    render(<BudgetPressureView teams={teams} ownerHandle="coreschke" />);
    expect(screen.getByText('chappy72')).toBeInTheDocument();
  });

  it('renders rank numbers starting at 1', () => {
    render(<BudgetPressureView teams={teams} ownerHandle="coreschke" />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('applies green color to buying power > 150', () => {
    render(<BudgetPressureView teams={teams} ownerHandle="coreschke" />);
    const bpCell = screen.getByTestId('bp-1');
    expect(bpCell).toHaveStyle({ color: '#4caf6e' });
  });

  it('applies amber color to buying power between 50 and 150', () => {
    render(<BudgetPressureView teams={teams} ownerHandle="coreschke" />);
    const bpCell = screen.getByTestId('bp-2');
    expect(bpCell).toHaveStyle({ color: '#e8a030' });
  });

  it('applies red color to buying power under 50', () => {
    render(<BudgetPressureView teams={teams} ownerHandle="coreschke" />);
    const bpCell = screen.getByTestId('bp-3');
    expect(bpCell).toHaveStyle({ color: '#e05050' });
  });

  it("highlights Cole's row with QB-blue left border", () => {
    render(<BudgetPressureView teams={teams} ownerHandle="coreschke" />);
    const coleRow = screen.getByTestId('row-coreschke');
    expect(coleRow).toHaveStyle({ borderLeft: '3px solid #4f83e8' });
  });

  it('renders the BudgetRefresher', () => {
    render(<BudgetPressureView teams={teams} ownerHandle="coreschke" />);
    expect(screen.getByTestId('budget-refresher')).toBeInTheDocument();
  });

  it('renders dollar signs for monetary values', () => {
    render(<BudgetPressureView teams={teams} ownerHandle="coreschke" />);
    expect(screen.getByText('$800')).toBeInTheDocument(); // Cole's buying power
  });
});
