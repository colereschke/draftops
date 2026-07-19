import { render, screen } from '@testing-library/react';
import TeamDetailPane from '@/components/RosterTracker/TeamDetailPane';
import type { TeamWithRoster } from '@/types';
import type { ManagerTendency } from '@/lib/tendencies';

const team: TeamWithRoster = {
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
  avgAge: 26.4,
  results: [
    {
      id: 1,
      playerId: 1,
      player: 'Patrick Mahomes',
      position: 'QB',
      nflTeam: 'KC',
      price: 200,
      sfRank: 1,
      teamId: 1,
      teamHandle: 'coreschke',
      delta: null,
    },
  ],
};

const tendency: ManagerTendency = {
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
};

describe('TeamDetailPane', () => {
  it('renders the header summary and the roster groups for the given team', () => {
    render(<TeamDetailPane team={team} tendency={tendency} isOwner={true} />);
    expect(screen.getByTestId('team-detail-pane')).toBeInTheDocument();
    expect(screen.getByTestId('dossier-lean-1-detail')).toHaveTextContent('Balanced');
    expect(screen.getByTestId('roster-group-QB')).toBeInTheDocument();
    expect(screen.getByText('Patrick Mahomes')).toBeInTheDocument();
  });
});
