import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { advanceOnboardingStep, completeOnboarding } from '@/lib/onboarding-actions';
import OnboardingTour from '@/components/Onboarding/OnboardingTour';
import { TOUR_STEPS } from '@/components/Onboarding/tourSteps';
import type { TourProgress } from '@/components/Onboarding/types';

const mockPush = jest.fn();
const mockRouter = { push: mockPush };

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
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
  mockAdvanceOnboardingStep.mockResolvedValue();
  mockCompleteOnboarding.mockResolvedValue();
});

describe('OnboardingTour', () => {
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
});
