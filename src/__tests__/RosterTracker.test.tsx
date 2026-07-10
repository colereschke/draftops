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

    it('sorts by number of buys, descending', async () => {
      const user = userEvent.setup();
      const teams = [
        makeTeam({ id: 2, handle: 'fewBuys', displayName: 'Few Buys' }),
        makeTeam({ id: 3, handle: 'manyBuys', displayName: 'Many Buys' }),
      ];
      const tendencies = [
        makeTendency({ teamId: 2, handle: 'fewBuys', buys: 5 }),
        makeTendency({ teamId: 3, handle: 'manyBuys', buys: 22 }),
      ];
      render(<RosterTracker teams={teams} tendencies={tendencies} ownerHandle={null} />);

      await user.selectOptions(screen.getByTestId('dossier-sort'), 'buys');

      const cards = screen.getAllByTestId(/^dossier-card-/);
      expect(cards[0]).toHaveAttribute('data-testid', 'dossier-card-3'); // 22 buys before 5
      expect(cards[1]).toHaveAttribute('data-testid', 'dossier-card-2');
    });

    it('sorts by average roster age, youngest first, with unknown age sinking to the bottom', async () => {
      const user = userEvent.setup();
      const teams = [
        makeTeam({ id: 2, handle: 'older', displayName: 'Older', avgAge: 28.1 }),
        makeTeam({ id: 3, handle: 'younger', displayName: 'Younger', avgAge: 23.8 }),
        makeTeam({ id: 4, handle: 'unknown', displayName: 'Unknown', avgAge: null }),
      ];
      const tendencies = [
        makeTendency({ teamId: 2, handle: 'older' }),
        makeTendency({ teamId: 3, handle: 'younger' }),
        makeTendency({ teamId: 4, handle: 'unknown' }),
      ];
      render(<RosterTracker teams={teams} tendencies={tendencies} ownerHandle={null} />);

      await user.selectOptions(screen.getByTestId('dossier-sort'), 'age');

      const cards = screen.getAllByTestId(/^dossier-card-/);
      expect(cards[0]).toHaveAttribute('data-testid', 'dossier-card-3'); // 23.8, youngest
      expect(cards[1]).toHaveAttribute('data-testid', 'dossier-card-2'); // 28.1
      expect(cards[2]).toHaveAttribute('data-testid', 'dossier-card-4'); // unknown, last
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
