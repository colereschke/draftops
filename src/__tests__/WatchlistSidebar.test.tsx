import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WatchlistSidebar from '@/components/NominationHelper/WatchlistSidebar';
import type { Player } from '@/types';

const PLAYERS: Player[] = [
  {
    player: "Ja'Marr Chase",
    team: 'CIN',
    pos: 'WR',
    age: 26,
    sfRank: 3,
    budget: 245,
    ceiling: 282,
    floor: 213,
    notes: '',
  },
  {
    player: 'Josh Jacobs',
    team: 'GB',
    pos: 'RB',
    age: 27,
    sfRank: 12,
    budget: 150,
    ceiling: 172,
    floor: 130,
    notes: '',
  },
];

const NOOP = () => {};

describe('WatchlistSidebar search', () => {
  it('matches a punctuated player name against an unpunctuated normalized query', async () => {
    const user = userEvent.setup();
    render(
      <WatchlistSidebar
        players={PLAYERS}
        nominated={[]}
        watchlist={[]}
        wonNames={new Set()}
        onAddToWatchlist={NOOP}
        onRemoveFromWatchlist={NOOP}
        onUnNominate={NOOP}
      />,
    );

    await user.type(screen.getByPlaceholderText('Add player I want...'), 'jamarr');

    expect(await screen.findByText("Ja'Marr Chase")).toBeInTheDocument();
  });

  it('shows no results for a single-letter query instead of matching everything', async () => {
    const user = userEvent.setup();
    render(
      <WatchlistSidebar
        players={PLAYERS}
        nominated={[]}
        watchlist={[]}
        wonNames={new Set()}
        onAddToWatchlist={NOOP}
        onRemoveFromWatchlist={NOOP}
        onUnNominate={NOOP}
      />,
    );

    await user.type(screen.getByPlaceholderText('Add player I want...'), 'j');

    expect(screen.queryByText("Ja'Marr Chase")).not.toBeInTheDocument();
    expect(screen.queryByText('Josh Jacobs')).not.toBeInTheDocument();
  });

  it('still matches on team substring', async () => {
    const user = userEvent.setup();
    render(
      <WatchlistSidebar
        players={PLAYERS}
        nominated={[]}
        watchlist={[]}
        wonNames={new Set()}
        onAddToWatchlist={NOOP}
        onRemoveFromWatchlist={NOOP}
        onUnNominate={NOOP}
      />,
    );

    await user.type(screen.getByPlaceholderText('Add player I want...'), 'cin');

    expect(await screen.findByText("Ja'Marr Chase")).toBeInTheDocument();
    expect(screen.queryByText('Josh Jacobs')).not.toBeInTheDocument();
  });
});
