import { render, screen, waitFor } from '@testing-library/react';
import type { OnboardingProgress } from '@prisma/client';
import DraftLayout from '@/app/draft/[draftId]/layout';
import AuctionSheet from '@/components/AuctionSheet/AuctionSheet';
import BudgetPressureView from '@/components/BudgetPressure/BudgetPressureView';
import NominationHelper from '@/components/NominationHelper/NominationHelper';
import RosterTracker from '@/components/RosterTracker/RosterTracker';
import type { ManagerTendency } from '@/lib/tendencies';
import { getOnboardingProgress } from '@/lib/onboarding';
import type { ClaimedBid, LeagueTeam, Player, TeamStats, TeamWithRoster } from '@/types';
import {
  DEFAULT_BUDGET,
  DEFAULT_ROSTER_SIZE,
  DEFAULT_SCORING_SETTINGS,
  DEFAULT_STARTING_LINEUP,
  DEFAULT_TEAM_COUNT,
} from '@/types';

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/draft', () => ({
  getDraft: jest.fn(),
}));

jest.mock('@/lib/onboarding', () => ({
  getOnboardingProgress: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }),
  notFound: jest.fn(),
  redirect: jest.fn(),
}));

jest.mock('@/components/Onboarding', () => ({
  OnboardingProvider: ({
    children,
    progress,
  }: {
    children: React.ReactNode;
    progress: unknown;
  }) => (
    <>
      {children}
      {progress ? <div data-testid="onboarding-tour" /> : null}
    </>
  ),
}));

jest.mock('@/components/Onboarding/OnboardingContext', () => ({
  useOnboarding: () => ({
    progress: null,
    recordBidLogged: jest.fn().mockResolvedValue(undefined),
    recordPlayerNominated: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock('@/lib/actions', () => ({
  deleteBid: jest.fn(),
  logBid: jest.fn(),
  updateBid: jest.fn(),
}));

jest.mock('@/components/BudgetPressure/BudgetRefresher', () => ({
  __esModule: true,
  default: () => null,
}));

const mockProgress = jest.mocked(getOnboardingProgress);
const mockAuth = jest.requireMock('@/auth').auth as jest.Mock;
const mockGetDraft = jest.requireMock('@/lib/draft').getDraft as jest.Mock;

const FEATURE_TOUR_PROGRESS: OnboardingProgress = {
  id: 1,
  userId: 'user-1',
  phase: 'FEATURE_TOUR',
  draftId: 5,
  step: 'VALUE_SHEET_INTRO',
  subjectPlayerName: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  completedAt: null,
};

const PLAYER: Player = {
  player: 'Josh Allen',
  team: 'BUF',
  pos: 'QB',
  age: 28,
  sfRank: 1,
  budget: 120,
  ceiling: 138,
  floor: 104,
  notes: '',
};

const TEAM: LeagueTeam = { id: 1, handle: 'coreschke', displayName: 'Cole' };
const TEAM_STATS: TeamStats = {
  ...TEAM,
  budget: 1000,
  spent: 0,
  remaining: 1000,
  rosterCount: 0,
  rosterRemaining: 30,
  buyingPower: 970,
  pkgCount: 0,
  avgAge: null,
};
const TENDENCY: ManagerTendency = {
  teamId: TEAM.id,
  handle: TEAM.handle,
  displayName: TEAM.displayName,
  buys: 0,
  totalSpend: 0,
  totalValue: 0,
  overallOverPct: null,
  topBuy: 0,
  lean: 'balanced',
  aggression: 'neutral',
  positions: {
    QB: {
      position: 'QB',
      buys: 0,
      spend: 0,
      valueSum: 0,
      deltaSum: 0,
      avgDelta: null,
      overPct: null,
      spendShare: 0,
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
const ROSTER_TEAM: TeamWithRoster = { ...TEAM_STATS, results: [] };

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
  mockGetDraft.mockResolvedValue({ id: 5, status: 'ACTIVE' });
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      teamStats: [],
      auctionResults: [],
      watchlist: [],
      nominated: [],
      ownerHandle: null,
      targetRoster: {},
    }),
  } as Response);
});

describe('onboarding targets', () => {
  it('mounts the provider tour only when progress belongs to the active draft', async () => {
    mockProgress.mockResolvedValue(FEATURE_TOUR_PROGRESS);
    const firstRender = render(
      await DraftLayout({ children: <div />, params: Promise.resolve({ draftId: '5' }) }),
    );
    expect(screen.getByTestId('onboarding-tour')).toBeInTheDocument();
    firstRender.unmount();

    mockProgress.mockResolvedValue({ ...FEATURE_TOUR_PROGRESS, draftId: 6 });
    render(await DraftLayout({ children: <div />, params: Promise.resolve({ draftId: '5' }) }));
    expect(screen.queryByTestId('onboarding-tour')).not.toBeInTheDocument();
  });

  it('does not mount onboarding practice UI for a completed draft', async () => {
    mockProgress.mockResolvedValue(FEATURE_TOUR_PROGRESS);
    mockGetDraft.mockResolvedValue({ id: 5, status: 'COMPLETE' });

    render(await DraftLayout({ children: <div />, params: Promise.resolve({ draftId: '5' }) }));

    expect(screen.queryByTestId('onboarding-tour')).not.toBeInTheDocument();
  });

  it('renders stable informational tour anchors', async () => {
    render(
      <AuctionSheet
        players={[PLAYER]}
        claimedBids={[] as ClaimedBid[]}
        teams={[TEAM]}
        nominatedPlayers={[]}
        draftId={5}
        ownerHandle={TEAM.handle}
        ownerBudget={1000}
        scoringSettings={DEFAULT_SCORING_SETTINGS}
        teamCount={DEFAULT_TEAM_COUNT}
        budget={DEFAULT_BUDGET}
        rosterSize={DEFAULT_ROSTER_SIZE}
        startingLineup={DEFAULT_STARTING_LINEUP}
      />,
    );
    expect(document.querySelector('[data-onboarding-target="value-sheet"]')).toBeInTheDocument();
    expect(document.querySelector('[data-onboarding-target="bid-practice"]')).toBeInTheDocument();

    render(
      <BudgetPressureView
        teams={[TEAM_STATS]}
        tendencies={[TENDENCY]}
        livePosition={null}
        liveName={null}
        ownerHandle={TEAM.handle}
      />,
    );
    expect(
      document.querySelector('[data-onboarding-target="budget-pressure"]'),
    ).toBeInTheDocument();

    render(
      <RosterTracker teams={[ROSTER_TEAM]} tendencies={[TENDENCY]} ownerHandle={TEAM.handle} />,
    );
    expect(document.querySelector('[data-onboarding-target="team-rosters"]')).toBeInTheDocument();

    render(<NominationHelper draftId={5} players={[PLAYER]} />);
    await waitFor(() => {
      expect(
        document.querySelector('[data-onboarding-target="nominate-intro"]'),
      ).toBeInTheDocument();
    });
  });
});
