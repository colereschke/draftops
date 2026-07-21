import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import AuctionSheet from '@/components/AuctionSheet/AuctionSheet';
import NominationHelper from '@/components/NominationHelper/NominationHelper';
import RosterTracker from '@/components/RosterTracker/RosterTracker';
import BudgetPressureView from '@/components/BudgetPressure/BudgetPressureView';
import userEvent from '@testing-library/user-event';
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

// jsdom cannot compute real layout/paint, so axe-core's color-contrast rule is
// unreliable there — contrast is already covered by src/lib/__tests__/tokenContrast.test.ts.
const AXE_OPTIONS = { rules: { 'color-contrast': { enabled: false } } };

describe('critical route accessibility', () => {
  it('AuctionSheet has no serious axe violations', async () => {
    const { container } = render(<AuctionSheet {...auctionSheetProps()} />);
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it('BudgetPressureView has no serious axe violations', async () => {
    const { container } = render(<BudgetPressureView {...budgetPressureViewProps()} />);
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it('RosterTracker has no serious axe violations', async () => {
    const { container } = render(<RosterTracker {...rosterTrackerProps()} />);
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it('NominationHelper has no serious axe violations', async () => {
    const { container } = render(<NominationHelper {...nominationHelperProps()} />);
    await waitFor(() => expect(screen.getByText('Nomination Helper')).toBeInTheDocument());
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it('opens the bid modal end-to-end via keyboard alone', async () => {
    const user = userEvent.setup();
    render(<AuctionSheet {...auctionSheetProps()} />);

    screen.getByRole('button', { name: /open bid modal for josh allen/i }).focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
