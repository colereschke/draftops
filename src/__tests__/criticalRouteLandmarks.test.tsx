import { render, screen, waitFor } from '@testing-library/react';
import SkipLink from '@/components/SkipLink';
import AuctionSheet from '@/components/AuctionSheet/AuctionSheet';
import NominationHelper from '@/components/NominationHelper/NominationHelper';
import RosterTracker from '@/components/RosterTracker/RosterTracker';
import BudgetPressureView from '@/components/BudgetPressure/BudgetPressureView';
import {
  auctionSheetProps,
  budgetPressureViewProps,
  rosterTrackerProps,
  nominationHelperProps,
} from './helpers/criticalRouteFixtures';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn(), replace: jest.fn() }),
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

jest.mock('@/components/BudgetPressure/BudgetRefresher', () => ({
  __esModule: true,
  default: () => <div data-testid="budget-refresher" />,
}));

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      teamStats: [],
      auctionResults: [],
      watchlist: [],
      nominated: [],
      ownerHandle: null,
      targetRoster: { QB: 4, RB: 9, WR: 11, TE: 3 },
    }),
  } as Response);
});

describe('critical route landmarks', () => {
  it('renders a skip link targeting #main-content', () => {
    render(<SkipLink />);
    const link = screen.getByRole('link', { name: /skip to main content/i });
    expect(link).toHaveAttribute('href', '#main-content');
  });

  it('AuctionSheet renders exactly one main landmark with id="main-content"', () => {
    render(<AuctionSheet {...auctionSheetProps()} />);
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute('id', 'main-content');
    expect(mains[0]).toHaveAttribute('tabindex', '-1');
  });

  it('BudgetPressureView renders exactly one main landmark with id="main-content"', () => {
    render(<BudgetPressureView {...budgetPressureViewProps()} />);
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute('id', 'main-content');
    expect(mains[0]).toHaveAttribute('tabindex', '-1');
  });

  it('RosterTracker renders exactly one main landmark with id="main-content"', () => {
    render(<RosterTracker {...rosterTrackerProps()} />);
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute('id', 'main-content');
    expect(mains[0]).toHaveAttribute('tabindex', '-1');
  });

  it('NominationHelper renders exactly one main landmark with id="main-content"', async () => {
    render(<NominationHelper {...nominationHelperProps()} />);
    await waitFor(() => expect(screen.getByText('Nomination Helper')).toBeInTheDocument());
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute('id', 'main-content');
    expect(mains[0]).toHaveAttribute('tabindex', '-1');
  });
});
