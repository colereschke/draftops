const mockDraftFindFirst = jest.fn();
const mockDraftFindMany = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    draft: {
      findFirst: (...args: unknown[]) => mockDraftFindFirst(...args),
      findMany: (...args: unknown[]) => mockDraftFindMany(...args),
    },
  },
}));

import { getDraft, getActiveDraftsForUser } from '@/lib/draft';

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

describe('getDraft', () => {
  it('returns draft when userId owns the draftId', async () => {
    mockDraftFindFirst.mockResolvedValue(CLAIMED_DRAFT);
    const result = await getDraft('discord-123', 1);
    expect(mockDraftFindFirst).toHaveBeenCalledWith({
      where: { id: 1, ownerId: 'discord-123' },
      include: { ownerTeam: true },
    });
    expect(result).toEqual(CLAIMED_DRAFT);
  });
  it('returns null when draft not found or not owned by user', async () => {
    mockDraftFindFirst.mockResolvedValue(null);
    const result = await getDraft('discord-123', 999);
    expect(result).toBeNull();
  });
});

describe('getActiveDraftsForUser', () => {
  it('returns active drafts ordered by createdAt asc', async () => {
    mockDraftFindMany.mockResolvedValue([{ id: 1, name: "Cole's Draft 2025" }]);
    const result = await getActiveDraftsForUser('discord-123');
    expect(mockDraftFindMany).toHaveBeenCalledWith({
      where: { ownerId: 'discord-123', status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(result).toEqual([{ id: 1, name: "Cole's Draft 2025" }]);
  });
  it('returns empty array when no active drafts', async () => {
    mockDraftFindMany.mockResolvedValue([]);
    const result = await getActiveDraftsForUser('discord-123');
    expect(result).toEqual([]);
  });
});
