import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DossierCard from '@/components/RosterTracker/DossierCard';
import type { TeamWithRoster } from '@/types';
import type { ManagerTendency } from '@/lib/tendencies';

const tendency = (over: Partial<ManagerTendency> = {}): ManagerTendency => ({
  teamId: 1,
  handle: 'rival_a',
  displayName: 'Rival A',
  buys: 6,
  totalSpend: 610,
  totalValue: 570,
  overallOverPct: 0.07,
  topBuy: 95,
  lean: 'WR',
  aggression: 'aggressive',
  positions: {
    QB: {
      position: 'QB',
      buys: 4,
      spend: 410,
      valueSum: 358,
      deltaSum: 52,
      avgDelta: 13,
      overPct: 0.145,
      spendShare: 0.67,
      appetite: 'overpays',
    },
    RB: {
      position: 'RB',
      buys: 3,
      spend: 80,
      valueSum: 110,
      deltaSum: -30,
      avgDelta: -10,
      overPct: -0.27,
      spendShare: 0.13,
      appetite: 'thrifty',
    },
    WR: {
      position: 'WR',
      buys: 5,
      spend: 100,
      valueSum: 100,
      deltaSum: 0,
      avgDelta: 0,
      overPct: 0,
      spendShare: 0.16,
      appetite: 'neutral',
    },
    TE: {
      position: 'TE',
      buys: 1,
      spend: 20,
      valueSum: 20,
      deltaSum: 0,
      avgDelta: 0,
      overPct: 0,
      spendShare: 0.03,
      appetite: 'no-read',
    },
  },
  ...over,
});

const team = (over: Partial<TeamWithRoster> = {}): TeamWithRoster => ({
  id: 1,
  handle: 'rival_a',
  displayName: 'Rival A',
  budget: 1000,
  spent: 610,
  remaining: 390,
  rosterCount: 6,
  rosterRemaining: 24,
  buyingPower: 366,
  pkgCount: 0,
  avgAge: null,
  results: [],
  ...over,
});

const noop = () => {};

describe('DossierCard', () => {
  it('shows lean, aggression, and an appetite chip per position', () => {
    render(
      <DossierCard
        team={team()}
        tendency={tendency()}
        isOwner={false}
        isExpanded={false}
        onToggle={noop}
      />,
    );
    expect(screen.getByTestId('dossier-lean-1')).toHaveTextContent('WR');
    expect(screen.getByTestId('dossier-aggression-1')).toHaveTextContent(/aggressive/i);
    expect(screen.getByTestId('dossier-chip-QB-1')).toBeInTheDocument();
    expect(screen.getByTestId('dossier-chip-TE-1')).toBeInTheDocument();
  });

  it('hides the habit line when every position is no-read/neutral', () => {
    const flat = tendency({
      lean: 'balanced',
      positions: {
        QB: {
          position: 'QB',
          buys: 1,
          spend: 100,
          valueSum: 100,
          deltaSum: 0,
          avgDelta: null,
          overPct: null,
          spendShare: 0.5,
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
    });
    render(
      <DossierCard
        team={team()}
        tendency={flat}
        isOwner={false}
        isExpanded={false}
        onToggle={noop}
      />,
    );
    expect(screen.queryByTestId('dossier-habit-1')).not.toBeInTheDocument();
  });

  it('does not show buying power / remaining on the face', () => {
    render(
      <DossierCard
        team={team()}
        tendency={tendency()}
        isOwner={false}
        isExpanded={false}
        onToggle={noop}
      />,
    );
    expect(screen.queryByText(/\$366/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$390/)).not.toBeInTheDocument();
  });

  it('calls onToggle when the card face is clicked (not just the chevron)', async () => {
    const onToggle = jest.fn();
    render(
      <DossierCard
        team={team()}
        tendency={tendency()}
        isOwner={false}
        isExpanded={false}
        onToggle={onToggle}
      />,
    );
    await userEvent.click(screen.getByTestId('dossier-expand-1'));
    expect(onToggle).toHaveBeenCalledWith(1);
  });

  it('toggles the roster from the keyboard', async () => {
    const onToggle = jest.fn();
    render(
      <DossierCard
        team={team()}
        tendency={tendency()}
        isOwner={false}
        isExpanded={false}
        onToggle={onToggle}
      />,
    );
    screen.getByTestId('dossier-expand-1').focus();
    await userEvent.keyboard('{Enter}');
    expect(onToggle).toHaveBeenCalledWith(1);
  });

  it('shows a pick-package badge on the face when the team holds packages', () => {
    render(
      <DossierCard
        team={team({ pkgCount: 2 })}
        tendency={tendency()}
        isOwner={false}
        isExpanded={false}
        onToggle={noop}
      />,
    );
    expect(screen.getByTestId('dossier-pkg-1')).toHaveTextContent('2× PKG');
  });

  it('omits the package badge when the team holds none', () => {
    render(
      <DossierCard
        team={team({ pkgCount: 0 })}
        tendency={tendency()}
        isOwner={false}
        isExpanded={false}
        onToggle={noop}
      />,
    );
    expect(screen.queryByTestId('dossier-pkg-1')).not.toBeInTheDocument();
  });
});
