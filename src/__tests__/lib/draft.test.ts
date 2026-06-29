const mockDraftFindFirst = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    draft: {
      findFirst: (...args: unknown[]) => mockDraftFindFirst(...args),
    },
  },
}));

import { getDraftForUser } from '@/lib/draft';

const OWNER_TEAM = { id: 7, handle: 'coreschke', displayName: 'Cole' };
const CLAIMED_DRAFT = {
  id: 1,
  name: "Cole's Draft 2025",
  ownerId: 'discord-123',
  ownerTeamId: 7,
  ownerTeam: OWNER_TEAM,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getDraftForUser', () => {
  it('returns draft owned by the userId', async () => {
    mockDraftFindFirst.mockResolvedValue(CLAIMED_DRAFT);
    const result = await getDraftForUser('discord-123');
    expect(mockDraftFindFirst).toHaveBeenCalledWith({
      where: { ownerId: 'discord-123' },
      include: { ownerTeam: true },
    });
    expect(result).toEqual(CLAIMED_DRAFT);
  });

  it('returns null when no draft found for userId', async () => {
    mockDraftFindFirst.mockResolvedValue(null);
    const result = await getDraftForUser('discord-123');
    expect(result).toBeNull();
  });
});
