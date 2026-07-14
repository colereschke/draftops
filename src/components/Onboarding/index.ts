/**
 * Task 5 should mount `OnboardingProvider` in the draft layout around every route child, passing
 * the server-fetched `TourProgress`. Descendant client components can then call `useOnboarding()`
 * after a successful bid or nomination mutation.
 */
export { OnboardingProvider, useOnboarding } from './OnboardingContext';
export { default as OnboardingTour } from './OnboardingTour';
export { TOUR_STEPS } from './tourSteps';
export type { OnboardingContextValue, TourProgress, TourStep } from './types';
