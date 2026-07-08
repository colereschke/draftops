import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RosterTracker from '@/components/RosterTracker/RosterTracker';
import type { TeamWithRoster } from '@/types';
import type { ManagerTendency } from '@/lib/tendencies';

const makeTeam = (over: Partial<TeamWithRoster> = {}): TeamWithRoster => ({
  id: 1,
  handle: 'coreschke',
  displayName: 'Cole',
  budget: 1000,
  spent: 312,
  remaining: 688,
  rosterCount: 2,
  rosterRemaining: 28,
  buyingPower: 660,
  pkgCount: 1,
  results: [
    {
      id: 1,
      player: 'Patrick Mahomes',
      position: 'QB',
      nflTeam: 'KC',
      price: 200,
      sfRank: 1,
      teamId: 1,
      teamHandle: 'coreschke',
      delta: null,
    },
    {
      id: 2,
      player: 'Matt Gay',
      position: 'PKG',
      nflTeam: 'MIN',
      price: 112,
      sfRank: null,
      teamId: 1,
      teamHandle: 'coreschke',
      delta: null,
    },
  ],
  ...over,
});

const makeTendency = (over: Partial<ManagerTendency> = {}): ManagerTendency => ({
  teamId: 1,
  handle: 'coreschke',
  displayName: 'Cole',
  buys: 2,
  totalSpend: 312,
  totalValue: 300,
  overallOverPct: 0.04,
  topBuy: 200,
  lean: 'balanced',
  aggression: 'neutral',
  positions: {
    QB: {
      position: 'QB',
      buys: 1,
      spend: 200,
      valueSum: 200,
      deltaSum: 0,
      avgDelta: 0,
      overPct: 0,
      spendShare: 0.64,
      appetite: 'no-read',
    },
    RB: {
      position: 'RB',
      buys: 0,
      spend: 0,
      valueSum: 0,
      deltaSum: 0,
      avgDelta: null,
      overPct: null,
      spendShare: 0,
      appetite: 'no-read',
    },
    WR: {
      position: 'WR',
      buys: 0,
      spend: 0,
      valueSum: 0,
      deltaSum: 0,
      avgDelta: null,
      overPct: null,
      spendShare: 0,
      appetite: 'no-read',
    },
    TE: {
      position: 'TE',
      buys: 0,
      spend: 0,
      valueSum: 0,
      deltaSum: 0,
      avgDelta: null,
      overPct: null,
      spendShare: 0,
      appetite: 'no-read',
    },
  },
  ...over,
});

describe('RosterTracker', () => {
  it('renders a dossier card per team and pins the owner first', () => {
    const teams = [makeTeam({ id: 2, handle: 'rival_b', displayName: 'B' }), makeTeam()];
    const tendencies = [makeTendency({ teamId: 2, handle: 'rival_b' }), makeTendency()];
    render(<RosterTracker teams={teams} tendencies={tendencies} ownerHandle="coreschke" />);
    const cards = screen.getAllByTestId(/^dossier-card-/);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAttribute('data-testid', 'dossier-card-1'); // owner pinned first
  });

  it('expands a card to reveal the grouped roster drawer', async () => {
    render(
      <RosterTracker teams={[makeTeam()]} tendencies={[makeTendency()]} ownerHandle="coreschke" />,
    );
    await userEvent.click(screen.getByTestId('dossier-expand-1'));
    expect(screen.getByTestId('roster-group-QB')).toBeInTheDocument();
  });
});
