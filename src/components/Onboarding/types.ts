import type { OnboardingStep } from '@prisma/client';

export interface TourProgress {
  draftId: number;
  step: OnboardingStep;
  subjectPlayerName: string | null;
}

export interface OnboardingContextValue {
  /** Available to client descendants of the draft-layout OnboardingProvider. */
  progress: TourProgress | null;
  recordBidLogged: (playerName: string) => Promise<void>;
  recordPlayerNominated: (playerName: string) => Promise<void>;
}

export interface TourStep {
  route: (draftId: number) => string;
  target: string;
  title: string;
  copy: (subjectPlayerName: string | null) => string;
  nextStep: OnboardingStep | null;
  nextRoute: ((draftId: number) => string) | null;
  waitsForAction: boolean;
}
