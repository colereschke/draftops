'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OnboardingStep } from '@prisma/client';
import { advanceOnboardingStep, completeOnboarding } from '@/lib/onboarding-actions';
import { TOUR_STEPS } from './tourSteps';
import type { TourProgress } from './types';

const PERSISTENCE_ERROR =
  'Unable to save tour progress. You can keep using DraftOps or skip the tour.';
const VIEWPORT_MARGIN = 16;

interface OnboardingTourProps {
  progress: TourProgress | null;
  onProgressChange?: (progress: TourProgress | null) => void;
  persistenceError?: string | null;
}

interface TourPosition {
  top: number;
  left: number;
}

export default function OnboardingTour({
  progress: initialProgress,
  onProgressChange,
  persistenceError,
}: OnboardingTourProps) {
  const router = useRouter();
  const [uncontrolledProgress, setUncontrolledProgress] = useState(initialProgress);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [position, setPosition] = useState<TourPosition>({
    top: VIEWPORT_MARGIN,
    left: VIEWPORT_MARGIN,
  });
  const popoverRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const bypassedProgressRef = useRef<string | null>(null);
  const isControlled = onProgressChange !== undefined;
  const progress = isControlled ? initialProgress : uncontrolledProgress;
  const displayedError = error ?? persistenceError;

  const updateProgress = useCallback(
    (nextProgress: TourProgress | null) => {
      if (onProgressChange) {
        onProgressChange(nextProgress);
        return;
      }
      setUncontrolledProgress(nextProgress);
    },
    [onProgressChange],
  );

  const restoreFocus = useCallback(() => {
    previousFocusRef.current?.focus();
    previousFocusRef.current = null;
  }, []);

  const finishTour = useCallback(async () => {
    if (isPending) return;
    setIsPending(true);
    setError(null);
    try {
      await completeOnboarding();
      updateProgress(null);
      restoreFocus();
    } catch {
      setError(PERSISTENCE_ERROR);
    } finally {
      setIsPending(false);
    }
  }, [isPending, restoreFocus, updateProgress]);

  const advance = useCallback(
    async (nextStep: OnboardingStep, nextRoute: (draftId: number) => string) => {
      if (!progress || isPending) return;
      setIsPending(true);
      setError(null);
      try {
        await advanceOnboardingStep({ draftId: progress.draftId, step: nextStep });
        updateProgress({ ...progress, step: nextStep, subjectPlayerName: null });
        router.push(nextRoute(progress.draftId));
      } catch {
        setError(PERSISTENCE_ERROR);
      } finally {
        setIsPending(false);
      }
    },
    [isPending, progress, router, updateProgress],
  );

  const bypassMissingTarget = useCallback(async () => {
    if (!progress) return;
    const progressKey = `${progress.draftId}:${progress.step}`;
    if (bypassedProgressRef.current === progressKey) return;
    bypassedProgressRef.current = progressKey;
    const step = TOUR_STEPS[progress.step];
    if (!step.nextStep || !step.nextRoute) {
      await finishTour();
      return;
    }
    await advance(step.nextStep, step.nextRoute);
  }, [advance, finishTour, progress]);

  useEffect(() => {
    if (!progress) return;
    const step = TOUR_STEPS[progress.step];
    const anchor = document.querySelector<HTMLElement>(`[data-onboarding-target="${step.target}"]`);

    if (!anchor) {
      const timeout = window.setTimeout(() => void bypassMissingTarget(), 0);
      return () => window.clearTimeout(timeout);
    }

    const updatePosition = () => {
      const anchorRect = anchor.getBoundingClientRect();
      const popoverRect = popoverRef.current?.getBoundingClientRect();
      const width = popoverRect?.width ?? 320;
      const height = popoverRect?.height ?? 180;
      setPosition({
        top: clamp(
          anchorRect.bottom + 8,
          VIEWPORT_MARGIN,
          window.innerHeight - height - VIEWPORT_MARGIN,
        ),
        left: clamp(anchorRect.left, VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN),
      });
    };

    if (!previousFocusRef.current && document.activeElement instanceof HTMLElement) {
      previousFocusRef.current = document.activeElement;
    }
    updatePosition();
    popoverRef.current?.focus();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [bypassMissingTarget, progress]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && progress) {
        event.preventDefault();
        void finishTour();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [finishTour, progress]);

  if (!progress) return null;

  const step = TOUR_STEPS[progress.step];
  const hasNext = step.nextStep !== null && step.nextRoute !== null;

  function handleNext() {
    if (step.nextStep && step.nextRoute) {
      void advance(step.nextStep, step.nextRoute);
      return;
    }
    void finishTour();
  }

  return (
    <div
      aria-modal="false"
      aria-labelledby="onboarding-tour-title"
      data-testid="onboarding-tour"
      ref={popoverRef}
      role="dialog"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderLeft: '3px solid var(--pos-qb)',
        borderRadius: '6px',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
        left: `${position.left}px`,
        maxWidth: 'calc(100vw - 32px)',
        padding: '1rem',
        position: 'fixed',
        top: `${position.top}px`,
        width: '320px',
        zIndex: 60,
      }}
      tabIndex={-1}
    >
      <p style={{ color: 'var(--pos-qb)', fontFamily: 'var(--font-barlow)', margin: '0 0 0.3rem' }}>
        DraftOps tour
      </p>
      <h2 id="onboarding-tour-title" style={{ color: 'var(--text-primary)', margin: 0 }}>
        {step.title}
      </h2>
      <p style={{ color: 'var(--text-secondary)', lineHeight: 1.45 }}>
        {step.copy(progress.subjectPlayerName)}
      </p>
      {displayedError && (
        <p role="alert" style={{ color: 'var(--age-old)' }}>
          {displayedError}
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <button
          data-testid="onboarding-skip"
          disabled={isPending}
          onClick={() => void finishTour()}
          type="button"
        >
          Skip tour
        </button>
        <button
          data-testid="onboarding-next"
          disabled={isPending}
          onClick={handleNext}
          type="button"
        >
          {step.waitsForAction ? 'Continue without trying it' : hasNext ? 'Next' : 'Finish tour'}
        </button>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
