const mockOnboardingFindUnique = jest.fn();
const mockDraftCount = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    onboardingProgress: {
      findUnique: (...args: unknown[]) => mockOnboardingFindUnique(...args),
    },
    draft: {
      count: (...args: unknown[]) => mockDraftCount(...args),
    },
  },
}));

import { isFirstDraftOnboardingEligible } from '@/lib/onboarding';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isFirstDraftOnboardingEligible', () => {
  it('enrolls only an account with no progress and no drafts', async () => {
    mockOnboardingFindUnique.mockResolvedValue(null);
    mockDraftCount.mockResolvedValue(0);

    await expect(isFirstDraftOnboardingEligible('discord-1')).resolves.toBe(true);
  });

  it('does not enroll an existing owner with a draft', async () => {
    mockOnboardingFindUnique.mockResolvedValue(null);
    mockDraftCount.mockResolvedValue(1);

    await expect(isFirstDraftOnboardingEligible('discord-1')).resolves.toBe(false);
  });
});
