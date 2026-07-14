import type { OnboardingStep } from '@prisma/client';
import type { TourStep } from './types';

export const TOUR_STEPS: Record<OnboardingStep, TourStep> = {
  VALUE_SHEET_INTRO: {
    route: (draftId) => `/draft/${draftId}`,
    target: 'value-sheet',
    title: 'Your market board',
    copy: () =>
      'This is your live value sheet. Filter, sort, and compare every target in the room.',
    nextStep: 'BID_PRACTICE',
    nextRoute: (draftId) => `/draft/${draftId}`,
    waitsForAction: false,
  },
  BID_PRACTICE: {
    route: (draftId) => `/draft/${draftId}`,
    target: 'bid-practice',
    title: 'Log a practice bid',
    copy: () => 'Try logging a bid to see budgets and rosters update together.',
    nextStep: 'BUDGET_PRESSURE',
    nextRoute: (draftId) => `/draft/${draftId}/budget`,
    waitsForAction: true,
  },
  BID_UNDO: {
    route: (draftId) => `/draft/${draftId}`,
    target: 'bid-undo',
    title: 'Undo a bid',
    copy: (playerName) =>
      playerName
        ? `${playerName} is now in the auction log. You can edit or delete a bid whenever you need to.`
        : 'You can edit or delete a bid from the auction log whenever you need to.',
    nextStep: 'BUDGET_PRESSURE',
    nextRoute: (draftId) => `/draft/${draftId}/budget`,
    waitsForAction: false,
  },
  BUDGET_PRESSURE: {
    route: (draftId) => `/draft/${draftId}/budget`,
    target: 'budget-pressure',
    title: 'Budget pressure',
    copy: () => 'See which managers can still push the price and where the room is running thin.',
    nextStep: 'TEAM_ROSTERS',
    nextRoute: (draftId) => `/draft/${draftId}/teams`,
    waitsForAction: false,
  },
  TEAM_ROSTERS: {
    route: (draftId) => `/draft/${draftId}/teams`,
    target: 'team-rosters',
    title: 'Team rosters',
    copy: () =>
      'Track every roster as the auction unfolds, including each manager’s remaining power.',
    nextStep: 'NOMINATE_INTRO',
    nextRoute: (draftId) => `/draft/${draftId}/nominate`,
    waitsForAction: false,
  },
  NOMINATE_INTRO: {
    route: (draftId) => `/draft/${draftId}/nominate`,
    target: 'nominate-intro',
    title: 'Nomination helper',
    copy: () => 'Use rival demand to surface players who will make other managers spend.',
    nextStep: 'NOMINATE_PRACTICE',
    nextRoute: (draftId) => `/draft/${draftId}/nominate`,
    waitsForAction: false,
  },
  NOMINATE_PRACTICE: {
    route: (draftId) => `/draft/${draftId}/nominate`,
    target: 'nominate-practice',
    title: 'Try a nomination',
    copy: () => 'Nominate a player to mark them live for the room.',
    nextStep: null,
    nextRoute: null,
    waitsForAction: true,
  },
  NOMINATE_UNDO: {
    route: (draftId) => `/draft/${draftId}/nominate`,
    target: 'nominate-undo',
    title: 'Undo a nomination',
    copy: (playerName) =>
      playerName
        ? `${playerName} is live. Remove the nomination if the auction moves on.`
        : 'Remove a nomination if the auction moves on.',
    nextStep: null,
    nextRoute: null,
    waitsForAction: false,
  },
};
