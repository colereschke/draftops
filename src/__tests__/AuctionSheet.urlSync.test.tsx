// src/__tests__/AuctionSheet.urlSync.test.tsx
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuctionSheet from '@/components/AuctionSheet/AuctionSheet';
import type { Player, ClaimedBid, LeagueTeam } from '@/types';
import {
  DEFAULT_BUDGET,
  DEFAULT_ROSTER_SIZE,
  DEFAULT_SCORING_SETTINGS,
  DEFAULT_STARTING_LINEUP,
  DEFAULT_TEAM_COUNT,
} from '@/types';

let mockSearch = '';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
  usePathname: () => '/draft/1',
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

jest.mock('@/lib/actions', () => ({
  logBid: jest.fn(),
  updateBid: jest.fn(),
  deleteBid: jest.fn(),
}));

jest.mock('@/components/Onboarding/OnboardingContext', () => ({
  useOnboarding: () => ({
    progress: null,
    recordBidLogged: jest.fn().mockResolvedValue(undefined),
    recordPlayerNominated: jest.fn().mockResolvedValue(undefined),
  }),
}));

const MOCK_PLAYERS: Player[] = [
  {
    id: 10,
    player: 'Josh Allen',
    team: 'BUF',
    pos: 'QB',
    age: 28,
    sfRank: 1,
    budget: 120,
    ceiling: 138,
    floor: 104,
    notes: '',
  },
  {
    id: 11,
    player: 'Justin Jefferson',
    team: 'MIN',
    pos: 'WR',
    age: 25,
    sfRank: 5,
    budget: 95,
    ceiling: 109,
    floor: 83,
    notes: '',
  },
];

const MOCK_TEAMS: LeagueTeam[] = [{ id: 1, handle: 'coreschke', displayName: 'Cole' }];

function renderSheet() {
  return render(
    <AuctionSheet
      players={MOCK_PLAYERS}
      claimedBids={[] as ClaimedBid[]}
      teams={MOCK_TEAMS}
      nominatedPlayers={[]}
      draftId={1}
      ownerHandle="coreschke"
      ownerBudget={1000}
      scoringSettings={{ ...DEFAULT_SCORING_SETTINGS }}
      teamCount={DEFAULT_TEAM_COUNT}
      budget={DEFAULT_BUDGET}
      rosterSize={DEFAULT_ROSTER_SIZE}
      startingLineup={[...DEFAULT_STARTING_LINEUP]}
    />,
  );
}

describe('AuctionSheet URL state', () => {
  beforeEach(() => {
    mockSearch = '';
    window.history.replaceState(null, '', '/draft/1');
  });

  it('hydrates the position filter from the URL on mount', () => {
    mockSearch = 'pos=WR';
    renderSheet();
    expect(screen.queryByTestId('player-row-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('player-row-5')).toBeInTheDocument();
  });

  it('writes the position filter to the URL when changed', async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByTestId('position-filter-WR'));
    expect(window.location.search).toBe('?pos=WR');
  });

  it('clears the pos param when returning to ALL', async () => {
    const user = userEvent.setup();
    mockSearch = 'pos=WR';
    renderSheet();
    await user.click(screen.getByTestId('position-filter-ALL'));
    expect(window.location.search).toBe('');
  });

  it('ignores a stale ?strategy= param when no player has a strategyTag', () => {
    // hasStrategyTags gates the archetype chips out of the UI entirely when no player carries
    // a strategyTag (no projections applied). A shared/bookmarked ?strategy= URL from a draft
    // that once had projections must not silently filter the table down to zero rows with no
    // visible control left to clear it.
    mockSearch = 'strategy=BARGAIN';
    renderSheet();
    expect(screen.getByTestId('player-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('player-row-5')).toBeInTheDocument();
  });

  it('debounces the search query before writing it to the URL', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ delay: null, advanceTimers: jest.advanceTimersByTime });
    renderSheet();
    await user.type(screen.getByLabelText('Search player or team'), 'jeff');
    expect(window.location.search).toBe('');
    act(() => jest.advanceTimersByTime(400));
    expect(window.location.search).toBe('?q=jeff');
    jest.useRealTimers();
  });

  it('filters visible rows immediately while search URL synchronization is debounced', async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(screen.getByLabelText('Search player or team'), 'jeff');
    expect(screen.queryByTestId('player-row-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('player-row-5')).toBeInTheDocument();
  });
});
