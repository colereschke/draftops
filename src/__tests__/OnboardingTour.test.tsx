import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { advanceOnboardingStep, completeOnboarding } from '@/lib/onboarding-actions';
import { OnboardingProvider, useOnboarding } from '@/components/Onboarding/OnboardingContext';
import OnboardingTour from '@/components/Onboarding/OnboardingTour';
import { TOUR_STEPS } from '@/components/Onboarding/tourSteps';
import type { TourProgress } from '@/components/Onboarding/types';

const mockPush = jest.fn();
const mockRouter = { push: mockPush };
let mockPathname = '/draft/5';

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPathname,
}));

jest.mock('@/lib/onboarding-actions', () => ({
  advanceOnboardingStep: jest.fn(),
  completeOnboarding: jest.fn(),
}));

const mockAdvanceOnboardingStep = jest.mocked(advanceOnboardingStep);
const mockCompleteOnboarding = jest.mocked(completeOnboarding);

const FEATURE_TOUR_PROGRESS: TourProgress = {
  draftId: 5,
  step: 'VALUE_SHEET_INTRO',
  subjectPlayerName: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = '/draft/5';
  mockAdvanceOnboardingStep.mockResolvedValue();
  mockCompleteOnboarding.mockResolvedValue();
});

describe('OnboardingTour', () => {
  it('defines the reviewed anchor and route contract for every step', () => {
    expect(
      Object.fromEntries(
        Object.entries(TOUR_STEPS).map(([step, definition]) => [
          step,
          { route: definition.route(5), target: definition.target },
        ]),
      ),
    ).toEqual({
      VALUE_SHEET_INTRO: { route: '/draft/5', target: 'value-sheet' },
      BID_PRACTICE: { route: '/draft/5', target: 'bid-practice' },
      BID_UNDO: { route: '/draft/5', target: 'bid-undo' },
      BUDGET_PRESSURE: { route: '/draft/5/budget', target: 'budget-pressure' },
      TEAM_ROSTERS: { route: '/draft/5/teams', target: 'team-rosters' },
      NOMINATE_INTRO: { route: '/draft/5/nominate', target: 'nominate-intro' },
      NOMINATE_PRACTICE: { route: '/draft/5/nominate', target: 'nominate-practice' },
      NOMINATE_UNDO: { route: '/draft/5/nominate', target: 'nominate-undo' },
    });
  });

  it('navigates to the current step route before checking for its anchor', async () => {
    mockPathname = '/draft/5/budget';

    render(<OnboardingTour progress={FEATURE_TOUR_PROGRESS} />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/draft/5');
    });
    expect(mockAdvanceOnboardingStep).not.toHaveBeenCalled();
  });

  it('persists the next step before navigating', async () => {
    const user = userEvent.setup();
    const valueSheet = TOUR_STEPS.VALUE_SHEET_INTRO;

    render(
      <>
        <div data-onboarding-target={valueSheet.target} />
        <OnboardingTour progress={FEATURE_TOUR_PROGRESS} />
      </>,
    );

    expect(screen.getByTestId('onboarding-tour')).toHaveTextContent('Your market board');

    await user.click(screen.getByTestId('onboarding-next'));

    expect(mockAdvanceOnboardingStep).toHaveBeenCalledWith({
      draftId: 5,
      step: 'BID_PRACTICE',
    });
    expect(mockPush).toHaveBeenCalledWith('/draft/5');
  });

  it('completes through the skip path when Escape is pressed', async () => {
    const user = userEvent.setup();
    const valueSheet = TOUR_STEPS.VALUE_SHEET_INTRO;

    const { rerender } = render(<button data-testid="prior-focus" type="button" />);
    screen.getByTestId('prior-focus').focus();
    rerender(
      <>
        <button data-testid="prior-focus" type="button" />
        <div data-onboarding-target={valueSheet.target} />
        <OnboardingTour progress={FEATURE_TOUR_PROGRESS} />
      </>,
    );

    await user.keyboard('{Escape}');

    expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByTestId('onboarding-tour')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('prior-focus')).toHaveFocus();
  });

  it('bypasses a missing anchor by persisting the next defined step', async () => {
    const bidPractice = TOUR_STEPS.BID_PRACTICE;

    render(
      <>
        <div data-onboarding-target={bidPractice.target} />
        <OnboardingTour progress={FEATURE_TOUR_PROGRESS} />
      </>,
    );

    await waitFor(() => {
      expect(mockAdvanceOnboardingStep).toHaveBeenCalledWith({
        draftId: 5,
        step: 'BID_PRACTICE',
      });
    });
    expect(mockPush).toHaveBeenCalledWith('/draft/5');
    expect(screen.getByTestId('onboarding-tour')).toHaveTextContent('Log a practice bid');
  });

  it('shows a persistence error instead of repeatedly bypassing a missing anchor', async () => {
    mockAdvanceOnboardingStep.mockRejectedValue(new Error('offline'));

    render(<OnboardingTour progress={FEATURE_TOUR_PROGRESS} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to save tour progress. You can keep using DraftOps or skip the tour.',
    );
    expect(mockAdvanceOnboardingStep).toHaveBeenCalledTimes(1);
  });

  it('does not complete again after the tour has been skipped', async () => {
    const user = userEvent.setup();
    const valueSheet = TOUR_STEPS.VALUE_SHEET_INTRO;

    render(
      <>
        <div data-onboarding-target={valueSheet.target} />
        <OnboardingTour progress={FEATURE_TOUR_PROGRESS} />
      </>,
    );

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByTestId('onboarding-tour')).not.toBeInTheDocument();
    });
    await user.keyboard('{Escape}');

    expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
  });

  it('does not complete twice when Escape is pressed synchronously', async () => {
    const user = userEvent.setup();
    const valueSheet = TOUR_STEPS.VALUE_SHEET_INTRO;
    let resolveCompletion: (() => void) | undefined;
    mockCompleteOnboarding.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCompletion = resolve;
        }),
    );

    render(
      <>
        <div data-onboarding-target={valueSheet.target} />
        <OnboardingTour progress={FEATURE_TOUR_PROGRESS} />
      </>,
    );

    await user.keyboard('{Escape}{Escape}');

    expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
    await act(async () => resolveCompletion?.());
  });

  it('skips bid practice directly to budget pressure without creating an undo step', async () => {
    const user = userEvent.setup();
    const progress: TourProgress = { ...FEATURE_TOUR_PROGRESS, step: 'BID_PRACTICE' };
    const bidPractice = TOUR_STEPS.BID_PRACTICE;

    render(
      <>
        <div data-onboarding-target={bidPractice.target} />
        <OnboardingTour progress={progress} />
      </>,
    );
    await user.click(screen.getByTestId('onboarding-next'));

    expect(mockAdvanceOnboardingStep).toHaveBeenCalledWith({ draftId: 5, step: 'BUDGET_PRESSURE' });
    expect(mockPush).toHaveBeenCalledWith('/draft/5/budget');
  });

  it('finishes when nomination practice is continued without an action', async () => {
    const user = userEvent.setup();
    const progress: TourProgress = { ...FEATURE_TOUR_PROGRESS, step: 'NOMINATE_PRACTICE' };
    const nominationPractice = TOUR_STEPS.NOMINATE_PRACTICE;
    mockPathname = '/draft/5/nominate';

    render(
      <>
        <div data-onboarding-target={nominationPractice.target} />
        <OnboardingTour progress={progress} />
      </>,
    );
    await user.click(screen.getByTestId('onboarding-next'));

    expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
    expect(mockAdvanceOnboardingStep).not.toHaveBeenCalled();
  });

  it('records a successful bid practice action with its player before showing the undo step', async () => {
    const user = userEvent.setup();
    const progress: TourProgress = { ...FEATURE_TOUR_PROGRESS, step: 'BID_PRACTICE' };
    const bidPractice = TOUR_STEPS.BID_PRACTICE;

    render(
      <OnboardingProvider progress={progress}>
        <div data-onboarding-target={bidPractice.target} />
        <OnboardingEventButton />
      </OnboardingProvider>,
    );
    await user.click(screen.getByTestId('record-bid'));

    expect(mockAdvanceOnboardingStep).toHaveBeenCalledWith({
      draftId: 5,
      step: 'BID_UNDO',
      subjectPlayerName: 'Ja’Marr Chase',
    });
    expect(screen.getByTestId('onboarding-tour')).toHaveTextContent(
      'Ja’Marr Chase is now in the auction log',
    );
  });

  it('records a successful nomination practice action with its player before showing the undo step', async () => {
    const user = userEvent.setup();
    const progress: TourProgress = { ...FEATURE_TOUR_PROGRESS, step: 'NOMINATE_PRACTICE' };
    const nominationPractice = TOUR_STEPS.NOMINATE_PRACTICE;
    mockPathname = '/draft/5/nominate';

    render(
      <OnboardingProvider progress={progress}>
        <div data-onboarding-target={nominationPractice.target} />
        <OnboardingEventButton />
      </OnboardingProvider>,
    );
    await user.click(screen.getByTestId('record-nomination'));

    expect(mockAdvanceOnboardingStep).toHaveBeenCalledWith({
      draftId: 5,
      step: 'NOMINATE_UNDO',
      subjectPlayerName: 'Ja’Marr Chase',
    });
    expect(screen.getByTestId('onboarding-tour')).toHaveTextContent('Ja’Marr Chase is live');
  });
});

function OnboardingEventButton() {
  const { recordBidLogged, recordPlayerNominated } = useOnboarding();
  return (
    <>
      <button
        data-testid="record-bid"
        onClick={() => void recordBidLogged('Ja’Marr Chase')}
        type="button"
      />
      <button
        data-testid="record-nomination"
        onClick={() => void recordPlayerNominated('Ja’Marr Chase')}
        type="button"
      />
    </>
  );
}
