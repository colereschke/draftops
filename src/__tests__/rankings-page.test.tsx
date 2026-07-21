import RankingsPage from '@/app/rankings/page';

const mockFindUnique = jest.fn();

jest.mock('@/auth', () => ({ auth: jest.fn().mockResolvedValue({ user: { id: 'owner' } }) }));
jest.mock('@/lib/db', () => ({
  getPrisma: () => ({
    userRankingSet: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
  }),
}));
jest.mock('@/components/RankingsUpload/RankingsUploadForm', () => () => null);
jest.mock('@/components/RankingsUpload/ResolveUnmatchedList', () => () => null);
jest.mock('@/components/RankingsUpload/MissingFromEtrList', () => () => null);

describe('RankingsPage', () => {
  beforeEach(() => {
    mockFindUnique.mockResolvedValue({
      fileName: 'rankings.csv',
      uploadedAt: new Date('2026-07-21T00:00:00.000Z'),
      players: [
        { id: 1, name: 'Josh Allen', team: 'BUF', pos: 'QB', matchStatus: 'matched' },
        { id: 2, name: 'Unknown QB', team: 'FA', pos: 'QB', matchStatus: 'unmatched' },
      ],
    });
  });

  it('selects only ranking fields needed for the summary and unmatched rows', async () => {
    await RankingsPage();

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { userId: 'owner' },
      select: {
        fileName: true,
        uploadedAt: true,
        players: {
          select: {
            id: true,
            name: true,
            team: true,
            pos: true,
            matchStatus: true,
          },
        },
      },
    });
  });
});
