import { render, screen } from '@testing-library/react';
import TeamRosterDetail from '@/components/RosterTracker/TeamRosterDetail';
import type { RosterEntry } from '@/types';

describe('TeamRosterDetail', () => {
  it('renders "No players won yet." when results are empty', () => {
    render(<TeamRosterDetail results={[]} />);
    expect(screen.getByText('No players won yet.')).toBeInTheDocument();
  });

  it('renders a roster-group for each non-empty position only', () => {
    const results: RosterEntry[] = [
      {
        id: 1,
        player: 'Patrick Mahomes',
        position: 'QB',
        nflTeam: 'KC',
        price: 200,
        sfRank: 1,
        teamId: 1,
        teamHandle: 'a',
        delta: 20,
      },
      {
        id: 3,
        player: 'Bijan Robinson',
        position: 'RB',
        nflTeam: 'ATL',
        price: 150,
        sfRank: 5,
        teamId: 1,
        teamHandle: 'a',
        delta: -10,
      },
    ];

    render(<TeamRosterDetail results={results} />);

    expect(screen.getByTestId('roster-group-QB')).toBeInTheDocument();
    expect(screen.getByTestId('roster-group-RB')).toBeInTheDocument();
    expect(screen.queryByTestId('roster-group-WR')).not.toBeInTheDocument();
    expect(screen.queryByTestId('roster-group-TE')).not.toBeInTheDocument();
    expect(screen.queryByTestId('roster-group-PICK')).not.toBeInTheDocument();
    expect(screen.queryByTestId('roster-group-PKG')).not.toBeInTheDocument();
  });

  it('renders groups in correct order: QB, RB, WR, TE, PICK, PKG', () => {
    const results: RosterEntry[] = [
      {
        id: 1,
        player: 'Patrick Mahomes',
        position: 'QB',
        nflTeam: 'KC',
        price: 200,
        sfRank: 1,
        teamId: 1,
        teamHandle: 'a',
        delta: 0,
      },
      {
        id: 2,
        player: 'Bijan Robinson',
        position: 'RB',
        nflTeam: 'ATL',
        price: 150,
        sfRank: 5,
        teamId: 1,
        teamHandle: 'a',
        delta: 0,
      },
      {
        id: 3,
        player: 'Justin Jefferson',
        position: 'WR',
        nflTeam: 'MIN',
        price: 160,
        sfRank: 3,
        teamId: 1,
        teamHandle: 'a',
        delta: 0,
      },
    ];

    render(<TeamRosterDetail results={results} />);

    const groups = screen.getAllByTestId(/^roster-group-/);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toHaveAttribute('data-testid', 'roster-group-QB');
    expect(groups[1]).toHaveAttribute('data-testid', 'roster-group-RB');
    expect(groups[2]).toHaveAttribute('data-testid', 'roster-group-WR');
  });

  it('calculates subtotal correctly for each group', () => {
    const results: RosterEntry[] = [
      {
        id: 1,
        player: 'Patrick Mahomes',
        position: 'QB',
        nflTeam: 'KC',
        price: 200,
        sfRank: 1,
        teamId: 1,
        teamHandle: 'a',
        delta: 0,
      },
      {
        id: 2,
        player: 'Josh Allen',
        position: 'QB',
        nflTeam: 'BUF',
        price: 180,
        sfRank: 2,
        teamId: 1,
        teamHandle: 'a',
        delta: 0,
      },
    ];

    render(<TeamRosterDetail results={results} />);

    const qbGroup = screen.getByTestId('roster-group-QB');
    expect(qbGroup).toHaveTextContent('$380');
  });

  it('calculates delta-total correctly, treating null delta as 0', () => {
    const results: RosterEntry[] = [
      {
        id: 1,
        player: 'Patrick Mahomes',
        position: 'QB',
        nflTeam: 'KC',
        price: 200,
        sfRank: 1,
        teamId: 1,
        teamHandle: 'a',
        delta: 20,
      },
      {
        id: 2,
        player: 'Josh Allen',
        position: 'QB',
        nflTeam: 'BUF',
        price: 180,
        sfRank: 2,
        teamId: 1,
        teamHandle: 'a',
        delta: null,
      },
    ];

    render(<TeamRosterDetail results={results} />);

    const qbGroup = screen.getByTestId('roster-group-QB');
    expect(qbGroup).toHaveTextContent('(+$20)');
  });

  it('shows negative delta-total when sum of deltas is negative', () => {
    const results: RosterEntry[] = [
      {
        id: 1,
        player: 'Player One',
        position: 'RB',
        nflTeam: 'KC',
        price: 100,
        sfRank: 1,
        teamId: 1,
        teamHandle: 'a',
        delta: -15,
      },
      {
        id: 2,
        player: 'Player Two',
        position: 'RB',
        nflTeam: 'BUF',
        price: 80,
        sfRank: 2,
        teamId: 1,
        teamHandle: 'a',
        delta: -20,
      },
    ];

    render(<TeamRosterDetail results={results} />);

    const rbGroup = screen.getByTestId('roster-group-RB');
    expect(rbGroup).toHaveTextContent('(-$35)');
  });

  it('does not show delta-total when sum of deltas is zero', () => {
    const results: RosterEntry[] = [
      {
        id: 1,
        player: 'Player One',
        position: 'WR',
        nflTeam: 'KC',
        price: 100,
        sfRank: 1,
        teamId: 1,
        teamHandle: 'a',
        delta: 10,
      },
      {
        id: 2,
        player: 'Player Two',
        position: 'WR',
        nflTeam: 'BUF',
        price: 80,
        sfRank: 2,
        teamId: 1,
        teamHandle: 'a',
        delta: -10,
      },
    ];

    render(<TeamRosterDetail results={results} />);

    const wrGroup = screen.getByTestId('roster-group-WR');
    // Should show subtotal but not delta-total
    expect(wrGroup).toHaveTextContent('$180');
    expect(wrGroup).not.toHaveTextContent('(+$');
    expect(wrGroup).not.toHaveTextContent('(-$');
  });

  it('renders individual player entries with price and delta', () => {
    const results: RosterEntry[] = [
      {
        id: 1,
        player: 'Patrick Mahomes',
        position: 'QB',
        nflTeam: 'KC',
        price: 200,
        sfRank: 1,
        teamId: 1,
        teamHandle: 'a',
        delta: 25,
      },
    ];

    render(<TeamRosterDetail results={results} />);

    const playerRow = screen.getByText('Patrick Mahomes');
    expect(playerRow).toBeInTheDocument();
    expect(screen.getByText('KC')).toBeInTheDocument();
    expect(playerRow.closest('div')?.parentElement).toHaveTextContent('+$25');
  });

  it('does not show individual delta when player delta is 0 or null', () => {
    const results: RosterEntry[] = [
      {
        id: 1,
        player: 'Player One',
        position: 'QB',
        nflTeam: 'KC',
        price: 100,
        sfRank: 1,
        teamId: 1,
        teamHandle: 'a',
        delta: 0,
      },
      {
        id: 2,
        player: 'Player Two',
        position: 'QB',
        nflTeam: 'BUF',
        price: 80,
        sfRank: 2,
        teamId: 1,
        teamHandle: 'a',
        delta: null,
      },
    ];

    render(<TeamRosterDetail results={results} />);

    const playerOneRow = screen.getByText('Player One').closest('div');
    const playerTwoRow = screen.getByText('Player Two').closest('div');

    // Player One with delta 0 should not show individual delta
    expect(playerOneRow).not.toHaveTextContent('+$0');
    expect(playerOneRow).not.toHaveTextContent('-$0');

    // Player Two with delta null should not show individual delta
    expect(playerTwoRow).not.toHaveTextContent('+$');
    expect(playerTwoRow).not.toHaveTextContent('-$');
  });

  it('shows a neutral placeholder instead of omitting the delta column when delta is 0 or null', () => {
    // Omitting the trailing delta span entirely (rather than rendering a
    // same-width placeholder) makes that row shorter than its siblings,
    // breaking the price/delta column alignment across the group.
    const results: RosterEntry[] = [
      {
        id: 1,
        player: 'Player One',
        position: 'QB',
        nflTeam: 'KC',
        price: 100,
        sfRank: 1,
        teamId: 1,
        teamHandle: 'a',
        delta: 0,
      },
      {
        id: 2,
        player: 'Player Two',
        position: 'QB',
        nflTeam: 'BUF',
        price: 80,
        sfRank: 2,
        teamId: 1,
        teamHandle: 'a',
        delta: null,
      },
    ];

    render(<TeamRosterDetail results={results} />);

    const playerOneRow = screen.getByText('Player One').closest('div');
    const playerTwoRow = screen.getByText('Player Two').closest('div');

    expect(playerOneRow).toHaveTextContent('—');
    expect(playerTwoRow).toHaveTextContent('—');
  });
});
