import { render, screen, within } from '@testing-library/react';
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
  avgAge: null,
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

  describe('RosterTracker — sort tiebreakers', () => {
    it('breaks aggression ties by how extreme the over/under-value read is', async () => {
      const user = userEvent.setup();
      const teams = [
        makeTeam({ id: 2, handle: 'mild', displayName: 'Mild' }),
        makeTeam({ id: 3, handle: 'extreme', displayName: 'Extreme' }),
        makeTeam({ id: 1, handle: 'coreschke' }),
      ];
      const tendencies = [
        makeTendency({ teamId: 2, handle: 'mild', aggression: 'aggressive', overallOverPct: 0.1 }),
        makeTendency({
          teamId: 3,
          handle: 'extreme',
          aggression: 'aggressive',
          overallOverPct: 0.4,
        }),
        makeTendency({
          teamId: 1,
          handle: 'coreschke',
          aggression: 'aggressive',
          overallOverPct: 0.5,
        }),
      ];
      render(<RosterTracker teams={teams} tendencies={tendencies} ownerHandle="coreschke" />);

      await user.selectOptions(screen.getByTestId('dossier-sort'), 'aggression');

      const cards = screen.getAllByTestId(/^dossier-card-/);
      expect(cards[0]).toHaveAttribute('data-testid', 'dossier-card-1'); // owner still pinned first
      expect(cards[1]).toHaveAttribute('data-testid', 'dossier-card-3'); // extreme (0.4) before mild (0.1)
      expect(cards[2]).toHaveAttribute('data-testid', 'dossier-card-2');
    });

    it('breaks lean ties by how dominant the leaning position is', async () => {
      const user = userEvent.setup();
      const teams = [
        makeTeam({ id: 2, handle: 'lightRB', displayName: 'Light RB' }),
        makeTeam({ id: 3, handle: 'heavyRB', displayName: 'Heavy RB' }),
      ];
      const tendencies = [
        makeTendency({
          teamId: 2,
          handle: 'lightRB',
          lean: 'RB',
          positions: {
            ...makeTendency().positions,
            RB: { ...makeTendency().positions.RB, spendShare: 0.55 },
          },
        }),
        makeTendency({
          teamId: 3,
          handle: 'heavyRB',
          lean: 'RB',
          positions: {
            ...makeTendency().positions,
            RB: { ...makeTendency().positions.RB, spendShare: 0.85 },
          },
        }),
      ];
      render(<RosterTracker teams={teams} tendencies={tendencies} ownerHandle={null} />);

      await user.selectOptions(screen.getByTestId('dossier-sort'), 'lean');

      const cards = screen.getAllByTestId(/^dossier-card-/);
      expect(cards[0]).toHaveAttribute('data-testid', 'dossier-card-3'); // heavier RB lean first
      expect(cards[1]).toHaveAttribute('data-testid', 'dossier-card-2');
    });

    it('breaks balanced-lean ties by total spend', async () => {
      const user = userEvent.setup();
      const teams = [
        makeTeam({ id: 2, handle: 'lowSpend', displayName: 'Low Spend' }),
        makeTeam({ id: 3, handle: 'highSpend', displayName: 'High Spend' }),
      ];
      const tendencies = [
        makeTendency({ teamId: 2, handle: 'lowSpend', lean: 'balanced', totalSpend: 200 }),
        makeTendency({ teamId: 3, handle: 'highSpend', lean: 'balanced', totalSpend: 500 }),
      ];
      render(<RosterTracker teams={teams} tendencies={tendencies} ownerHandle={null} />);

      await user.selectOptions(screen.getByTestId('dossier-sort'), 'lean');

      const cards = screen.getAllByTestId(/^dossier-card-/);
      expect(cards[0]).toHaveAttribute('data-testid', 'dossier-card-3'); // higher spend first
      expect(cards[1]).toHaveAttribute('data-testid', 'dossier-card-2');
    });
  });

  describe('RosterTracker — desktop split view', () => {
    function mockDesktop() {
      window.matchMedia = jest.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      }));
    }

    afterEach(() => {
      // Restore the default (mobile) polyfill from jest.setup.ts for other test files.
      window.matchMedia = jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      }));
    });

    it('renders a list pane and a detail pane, defaulting selection to the owner', () => {
      mockDesktop();
      const teams = [makeTeam({ id: 2, handle: 'rival_b', displayName: 'B' }), makeTeam()];
      const tendencies = [makeTendency({ teamId: 2, handle: 'rival_b' }), makeTendency()];
      render(<RosterTracker teams={teams} tendencies={tendencies} ownerHandle="coreschke" />);
      expect(screen.getByTestId('team-detail-pane')).toBeInTheDocument();
      expect(screen.getByTestId('dossier-lean-1-detail')).toBeInTheDocument();
    });

    it('updates the detail pane when a different team is clicked in the list', async () => {
      mockDesktop();
      const teams = [makeTeam({ id: 2, handle: 'rival_b', displayName: 'B' }), makeTeam()];
      const tendencies = [makeTendency({ teamId: 2, handle: 'rival_b' }), makeTendency()];
      render(<RosterTracker teams={teams} tendencies={tendencies} ownerHandle="coreschke" />);
      await userEvent.click(screen.getByTestId('dossier-expand-2'));
      expect(screen.getByTestId('team-detail-pane')).toHaveTextContent('rival_b');
    });

    it('does not expand list cards inline in desktop mode', async () => {
      mockDesktop();
      render(
        <RosterTracker
          teams={[makeTeam()]}
          tendencies={[makeTendency()]}
          ownerHandle="coreschke"
        />,
      );
      await userEvent.click(screen.getByTestId('dossier-expand-1'));
      // Scoped to the list-pane DossierCard itself: with only one team, TeamDetailPane
      // legitimately renders its own `roster-group-QB` for the selected team from the
      // first render onward, so a document-wide query can never assert "no inline
      // expansion" here. Scoping to the list card is what actually distinguishes
      // "expanded inline in the list" from "shown in the detail pane".
      expect(
        within(screen.getByTestId('dossier-card-1')).queryByTestId('roster-group-QB'),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId('team-detail-pane')).toHaveTextContent('coreschke');
    });
  });
});
