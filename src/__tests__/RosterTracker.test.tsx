import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RosterTracker from '@/components/RosterTracker/RosterTracker';
import type { TeamWithRoster } from '@/types';

const makeTeam = (overrides: Partial<TeamWithRoster> = {}): TeamWithRoster => ({
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
  ...overrides,
});

const emptyTeam: TeamWithRoster = {
  id: 2,
  handle: 'chappy72',
  displayName: null,
  budget: 1000,
  spent: 0,
  remaining: 1000,
  rosterCount: 0,
  rosterRemaining: 30,
  buyingPower: 970,
  pkgCount: 0,
  results: [],
};

describe('RosterTracker', () => {
  it('renders all team handles in the table', () => {
    render(<RosterTracker teams={[makeTeam(), emptyTeam]} ownerHandle="coreschke" />);
    expect(screen.getByText('coreschke')).toBeInTheDocument();
    expect(screen.getByText('chappy72')).toBeInTheDocument();
  });

  it('renders roster summary metrics in the page intro', () => {
    render(<RosterTracker teams={[makeTeam(), emptyTeam]} ownerHandle="coreschke" />);

    expect(screen.getByText('Teams')).toBeInTheDocument();
    expect(screen.getByTestId('roster-metric-teams')).toHaveTextContent('2');
    expect(screen.getByText('Open Slots')).toBeInTheDocument();
    expect(screen.getByTestId('roster-metric-open-slots')).toHaveTextContent('58');
    expect(screen.getByText('Most Flexible')).toBeInTheDocument();
    expect(screen.getByTestId('roster-metric-most-flexible')).toHaveTextContent('chappy72');
    expect(screen.getByText('Packages Held')).toBeInTheDocument();
    expect(screen.getByTestId('roster-metric-packages')).toHaveTextContent('1');
  });

  it('does not show roster player rows by default', () => {
    render(<RosterTracker teams={[makeTeam()]} ownerHandle="coreschke" />);
    expect(screen.queryByText('Patrick Mahomes')).not.toBeInTheDocument();
  });

  it('shows roster when a team expand button is clicked', async () => {
    const user = userEvent.setup();
    render(<RosterTracker teams={[makeTeam()]} ownerHandle="coreschke" />);
    await user.click(screen.getByRole('button', { name: /expand roster for coreschke/i }));
    expect(screen.getByText('Patrick Mahomes')).toBeInTheDocument();
  });

  it('shows roster when the team row is clicked', async () => {
    const user = userEvent.setup();
    render(<RosterTracker teams={[makeTeam()]} ownerHandle="coreschke" />);

    await user.click(screen.getByText('coreschke').closest('tr')!);

    expect(screen.getByText('Patrick Mahomes')).toBeInTheDocument();
  });

  it('collapses roster when the same expand button is clicked again', async () => {
    const user = userEvent.setup();
    render(<RosterTracker teams={[makeTeam()]} ownerHandle="coreschke" />);
    const button = screen.getByRole('button', { name: /expand roster for coreschke/i });
    await user.click(button);
    await user.click(button);
    expect(screen.queryByText('Patrick Mahomes')).not.toBeInTheDocument();
  });

  it('keeps multiple rows expanded simultaneously', async () => {
    const user = userEvent.setup();
    const team2 = makeTeam({
      id: 2,
      handle: 'chappy72',
      displayName: null,
      pkgCount: 0,
      results: [
        {
          id: 3,
          player: 'Justin Jefferson',
          position: 'WR',
          nflTeam: 'MIN',
          price: 180,
          sfRank: 5,
          teamId: 2,
          teamHandle: 'chappy72',
          delta: null,
        },
      ],
    });
    render(<RosterTracker teams={[makeTeam(), team2]} ownerHandle="coreschke" />);
    await user.click(screen.getByRole('button', { name: /expand roster for coreschke/i }));
    await user.click(screen.getByRole('button', { name: /expand roster for chappy72/i }));
    expect(screen.getByText('Patrick Mahomes')).toBeInTheDocument();
    expect(screen.getByText('Justin Jefferson')).toBeInTheDocument();
  });

  it('sort headers can be operated with the keyboard', async () => {
    const user = userEvent.setup();
    render(<RosterTracker teams={[makeTeam(), emptyTeam]} ownerHandle="coreschke" />);

    await user.tab();
    expect(screen.getByRole('button', { name: /sort by roster/i })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('columnheader', { name: /roster/i })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  it('shows PKG badge for teams with pick packages', () => {
    render(<RosterTracker teams={[makeTeam()]} ownerHandle="coreschke" />);
    expect(screen.getByText('1×')).toBeInTheDocument();
  });

  it('does not render a PKG badge for teams with zero pick packages', () => {
    render(<RosterTracker teams={[emptyTeam]} ownerHandle="coreschke" />);
    expect(screen.queryByText('0×')).not.toBeInTheDocument();
  });

  it('shows empty state message when an expanded team has no results', async () => {
    const user = userEvent.setup();
    render(<RosterTracker teams={[emptyTeam]} ownerHandle="coreschke" />);
    await user.click(screen.getByRole('button', { name: /expand roster for chappy72/i }));
    expect(screen.getByText('No players won yet.')).toBeInTheDocument();
  });
});
