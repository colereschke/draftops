import { render, screen, fireEvent } from '@testing-library/react';
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
    render(<RosterTracker teams={[makeTeam(), emptyTeam]} />);
    expect(screen.getByText('coreschke')).toBeInTheDocument();
    expect(screen.getByText('chappy72')).toBeInTheDocument();
  });

  it('does not show roster player rows by default', () => {
    render(<RosterTracker teams={[makeTeam()]} />);
    expect(screen.queryByText('Patrick Mahomes')).not.toBeInTheDocument();
  });

  it('shows roster when a team row is clicked', () => {
    render(<RosterTracker teams={[makeTeam()]} />);
    fireEvent.click(screen.getByText('coreschke').closest('tr')!);
    expect(screen.getByText('Patrick Mahomes')).toBeInTheDocument();
  });

  it('collapses roster when the same row is clicked again', () => {
    render(<RosterTracker teams={[makeTeam()]} />);
    const row = screen.getByText('coreschke').closest('tr')!;
    fireEvent.click(row);
    fireEvent.click(row);
    expect(screen.queryByText('Patrick Mahomes')).not.toBeInTheDocument();
  });

  it('keeps multiple rows expanded simultaneously', () => {
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
        },
      ],
    });
    render(<RosterTracker teams={[makeTeam(), team2]} />);
    fireEvent.click(screen.getByText('coreschke').closest('tr')!);
    fireEvent.click(screen.getByText('chappy72').closest('tr')!);
    expect(screen.getByText('Patrick Mahomes')).toBeInTheDocument();
    expect(screen.getByText('Justin Jefferson')).toBeInTheDocument();
  });

  it('shows PKG badge for teams with pick packages', () => {
    render(<RosterTracker teams={[makeTeam()]} />);
    expect(screen.getByText('1×')).toBeInTheDocument();
  });

  it('does not render a PKG badge for teams with zero pick packages', () => {
    render(<RosterTracker teams={[emptyTeam]} />);
    expect(screen.queryByText('0×')).not.toBeInTheDocument();
  });

  it('shows empty state message when an expanded team has no results', () => {
    render(<RosterTracker teams={[emptyTeam]} />);
    fireEvent.click(screen.getByText('chappy72').closest('tr')!);
    expect(screen.getByText('No players won yet.')).toBeInTheDocument();
  });
});
