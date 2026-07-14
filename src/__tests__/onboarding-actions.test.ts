const mockAuth = jest.fn();
const mockRevalidatePath = jest.fn();
const mockOnboardingUpsert = jest.fn();
const mockOnboardingUpdateMany = jest.fn();

jest.mock('@/auth', () => ({ auth: () => mockAuth() }));
jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));
jest.mock('@/lib/db', () => ({
  prisma: {
    onboardingProgress: {
      upsert: (...args: unknown[]) => mockOnboardingUpsert(...args),
      updateMany: (...args: unknown[]) => mockOnboardingUpdateMany(...args),
    },
  },
}));

import {
  advanceOnboardingStep,
  beginOnboarding,
  completeOnboarding,
} from '@/lib/onboarding-actions';

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: '123456789' } });
  mockOnboardingUpsert.mockResolvedValue({});
  mockOnboardingUpdateMany.mockResolvedValue({ count: 1 });
});

describe('beginOnboarding', () => {
  it('rejects an unauthenticated user', async () => {
    mockAuth.mockResolvedValue(null);

    await expect(beginOnboarding()).rejects.toThrow('Unauthorized');
  });

  it('creates draft setup progress without overwriting existing progress', async () => {
    await beginOnboarding();

    expect(mockOnboardingUpsert).toHaveBeenCalledWith({
      where: { userId: '123456789' },
      create: { userId: '123456789', phase: 'DRAFT_SETUP' },
      update: {},
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/drafts');
  });
});

describe('advanceOnboardingStep', () => {
  it('updates only the active tour for the user and draft', async () => {
    await advanceOnboardingStep({
      draftId: 5,
      step: 'BID_UNDO',
      subjectPlayerName: 'Josh Allen',
    });

    expect(mockOnboardingUpdateMany).toHaveBeenCalledWith({
      where: { userId: '123456789', phase: 'FEATURE_TOUR', draftId: 5 },
      data: { step: 'BID_UNDO', subjectPlayerName: 'Josh Allen' },
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/draft/5');
  });

  it('throws when no active tour is found', async () => {
    mockOnboardingUpdateMany.mockResolvedValue({ count: 0 });

    await expect(advanceOnboardingStep({ draftId: 5, step: 'BID_UNDO' })).rejects.toThrow(
      'Onboarding not found',
    );
  });
});

describe('completeOnboarding', () => {
  it('marks onboarding complete and clears draft-specific progress', async () => {
    await completeOnboarding();

    expect(mockOnboardingUpsert).toHaveBeenCalledWith({
      where: { userId: '123456789' },
      create: expect.objectContaining({
        userId: '123456789',
        phase: 'COMPLETED',
        completedAt: expect.any(Date),
      }),
      update: expect.objectContaining({
        phase: 'COMPLETED',
        completedAt: expect.any(Date),
        draftId: null,
        subjectPlayerName: null,
      }),
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/drafts');
  });
});
