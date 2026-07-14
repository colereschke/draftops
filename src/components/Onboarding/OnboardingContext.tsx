'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { advanceOnboardingStep } from '@/lib/onboarding-actions';
import OnboardingTour from './OnboardingTour';
import type { OnboardingContextValue, TourProgress } from './types';

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

interface OnboardingProviderProps {
  children: React.ReactNode;
  progress: TourProgress | null;
}

export function OnboardingProvider({
  children,
  progress: initialProgress,
}: OnboardingProviderProps) {
  const [progress, setProgress] = useState(initialProgress);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);

  const recordAction = useCallback(
    async (
      playerName: string,
      expectedStep: TourProgress['step'],
      nextStep: TourProgress['step'],
    ) => {
      if (!progress || progress.step !== expectedStep) return;
      try {
        await advanceOnboardingStep({
          draftId: progress.draftId,
          step: nextStep,
          subjectPlayerName: playerName,
        });
        setPersistenceError(null);
        setProgress({ ...progress, step: nextStep, subjectPlayerName: playerName });
      } catch {
        setPersistenceError(
          'Unable to save tour progress. You can keep using DraftOps or skip the tour.',
        );
      }
    },
    [progress],
  );

  const value: OnboardingContextValue = {
    progress,
    recordBidLogged: (playerName) => recordAction(playerName, 'BID_PRACTICE', 'BID_UNDO'),
    recordPlayerNominated: (playerName) =>
      recordAction(playerName, 'NOMINATE_PRACTICE', 'NOMINATE_UNDO'),
  };

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      <OnboardingTour
        onProgressChange={setProgress}
        persistenceError={persistenceError}
        progress={progress}
      />
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error('useOnboarding must be used within an OnboardingProvider');
  return context;
}
