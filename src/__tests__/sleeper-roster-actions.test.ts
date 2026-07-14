import {
  logSleeperRosterCatchUp,
  previewSleeperRosterSync,
  saveSleeperRosterMapping,
} from '@/lib/sleeper-roster-actions';

const mockAuth = jest.fn();
const mockGetDraft = jest.fn();
const mockFetchLeague = jest.fn();
const mockFetchUsers = jest.fn();
const mockFetchRosters = jest.fn();
const mockRevalidatePath = jest.fn();
const mockTransaction = jest.fn();
const mockDraftUpdate = jest.fn();
const mockTeamFindMany = jest.fn();
const mockTeamUpdateMany = jest.fn();
const mockTeamUpdate = jest.fn();
const mockPlayerFindMany = jest.fn();
const mockAuctionFindMany = jest.fn();
const mockAuctionCreate = jest.fn();
const mockNominationDeleteMany = jest.fn();

jest.mock('@/auth', () => ({ auth: () => mockAuth() }));
jest.mock('@/lib/draft', () => ({ getDraft: (...args: unknown[]) => mockGetDraft(...args) }));
jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));
jest.mock('@/lib/sleeper', () => ({
  fetchSleeperLeague: (...args: unknown[]) => mockFetchLeague(...args),
  fetchSleeperLeagueUsers: (...args: unknown[]) => mockFetchUsers(...args),
  fetchSleeperLeagueRosters: (...args: unknown[]) => mockFetchRosters(...args),
}));
jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
    draft: { update: (...args: unknown[]) => mockDraftUpdate(...args) },
    team: {
      findMany: (...args: unknown[]) => mockTeamFindMany(...args),
      updateMany: (...args: unknown[]) => mockTeamUpdateMany(...args),
      update: (...args: unknown[]) => mockTeamUpdate(...args),
    },
    player: { findMany: (...args: unknown[]) => mockPlayerFindMany(...args) },
    auctionResult: {
      findMany: (...args: unknown[]) => mockAuctionFindMany(...args),
      create: (...args: unknown[]) => mockAuctionCreate(...args),
    },
    nominatedPlayer: { deleteMany: (...args: unknown[]) => mockNominationDeleteMany(...args) },
  },
}));

const DRAFT = { id: 4, sleeperLeagueId: 'league-1' };
const TEAM = { id: 7, sleeperRosterId: 9, handle: 'cole', displayName: 'Cole' };
const PLAYER = {
  id: 3,
  sleeperId: 's-3',
  name: 'Josh Allen',
  pos: 'QB',
  nflTeam: 'BUF',
  budget: 42,
  sfRank: 1,
};

function transactionClient() {
  return {
    team: { findMany: mockTeamFindMany, updateMany: mockTeamUpdateMany, update: mockTeamUpdate },
    draft: { update: mockDraftUpdate },
    player: { findMany: mockPlayerFindMany },
    auctionResult: { findMany: mockAuctionFindMany, create: mockAuctionCreate },
    nominatedPlayer: { deleteMany: mockNominationDeleteMany },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'owner' } });
  mockGetDraft.mockResolvedValue(DRAFT);
  mockFetchLeague.mockResolvedValue({});
  mockFetchUsers.mockResolvedValue([]);
  mockFetchRosters.mockResolvedValue([{ roster_id: 9, owner_id: 'owner', players: ['s-3'] }]);
  mockTeamFindMany.mockResolvedValue([TEAM]);
  mockPlayerFindMany.mockResolvedValue([PLAYER]);
  mockAuctionFindMany.mockResolvedValue([]);
  mockAuctionCreate.mockResolvedValue({});
  mockTransaction.mockImplementation(
    (callback: (tx: ReturnType<typeof transactionClient>) => unknown) =>
      callback(transactionClient()),
  );
});

describe('Sleeper roster actions', () => {
  it('returns not_found instead of throwing when unauthenticated or draft is not owned', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(previewSleeperRosterSync({ draftId: 4 })).resolves.toEqual({
      ok: false,
      code: 'not_found',
    });
    mockAuth.mockResolvedValue({ user: { id: 'other' } });
    mockGetDraft.mockResolvedValue(null);
    await expect(previewSleeperRosterSync({ draftId: 4 })).resolves.toEqual({
      ok: false,
      code: 'not_found',
    });
  });

  it('rejects invalid or duplicate mappings without persisting them', async () => {
    await expect(
      saveSleeperRosterMapping({
        draftId: 4,
        leagueId: 'league-1',
        mappings: [
          { teamId: 7, sleeperRosterId: 9 },
          { teamId: 7, sleeperRosterId: 9 },
        ],
      }),
    ).resolves.toEqual({ ok: false, code: 'mapping_required' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects mappings for roster IDs missing from Sleeper', async () => {
    await expect(
      saveSleeperRosterMapping({
        draftId: 4,
        leagueId: 'league-1',
        mappings: [{ teamId: 7, sleeperRosterId: 99 }],
      }),
    ).resolves.toEqual({ ok: false, code: 'mapping_required' });
  });

  it('replaces only the owned draft mappings after validating Sleeper roster IDs', async () => {
    await expect(
      saveSleeperRosterMapping({
        draftId: 4,
        leagueId: 'league-1',
        mappings: [{ teamId: 7, sleeperRosterId: 9 }],
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(mockTeamUpdateMany).toHaveBeenCalledWith({
      where: { draftId: 4 },
      data: { sleeperRosterId: null },
    });
    expect(mockTeamUpdate).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { sleeperRosterId: 9 },
    });
  });

  it('excludes existing results from a preview', async () => {
    mockAuctionFindMany.mockResolvedValue([{ playerId: 3 }]);
    const result = await previewSleeperRosterSync({ draftId: 4 });
    expect(result).toEqual({
      ok: true,
      preview: expect.objectContaining({
        actionable: [],
        diagnostics: expect.objectContaining({ alreadyLoggedCount: 1 }),
      }),
    });
  });

  it('creates only currently assigned bids and clears their nominations', async () => {
    const result = await logSleeperRosterCatchUp({
      draftId: 4,
      entries: [{ playerId: 3, teamId: 7, price: 42 }],
    });
    expect(result).toEqual({ ok: true, createdPlayerIds: [3], conflicts: [] });
    expect(mockNominationDeleteMany).toHaveBeenCalledWith({ where: { draftId: 4, playerId: 3 } });
  });

  it('marks a player moved after preview as an assignment conflict', async () => {
    mockFetchRosters.mockResolvedValue([{ roster_id: 10, owner_id: 'owner', players: ['s-3'] }]);
    await expect(
      logSleeperRosterCatchUp({ draftId: 4, entries: [{ playerId: 3, teamId: 7, price: 42 }] }),
    ).resolves.toEqual({
      ok: true,
      createdPlayerIds: [],
      conflicts: [{ playerId: 3, reason: 'assignment_changed' }],
    });
  });

  it('does not create results for nonexistent teams or players', async () => {
    await expect(
      logSleeperRosterCatchUp({
        draftId: 4,
        entries: [
          { playerId: 3, teamId: 99, price: 42 },
          { playerId: 99, teamId: 7, price: 42 },
        ],
      }),
    ).resolves.toEqual({
      ok: true,
      createdPlayerIds: [],
      conflicts: [
        { playerId: 3, reason: 'assignment_changed' },
        { playerId: 99, reason: 'assignment_changed' },
      ],
    });
    expect(mockAuctionCreate).not.toHaveBeenCalled();
  });

  it('translates a unique result conflict to already_logged', async () => {
    const error = Object.assign(new Error('unique'), { code: 'P2002' });
    mockAuctionCreate.mockRejectedValue(error);
    await expect(
      logSleeperRosterCatchUp({ draftId: 4, entries: [{ playerId: 3, teamId: 7, price: 42 }] }),
    ).resolves.toEqual({
      ok: true,
      createdPlayerIds: [],
      conflicts: [{ playerId: 3, reason: 'already_logged' }],
    });
  });

  it('rejects zero-price entries without creating results', async () => {
    await expect(
      logSleeperRosterCatchUp({ draftId: 4, entries: [{ playerId: 3, teamId: 7, price: 0 }] }),
    ).resolves.toEqual({ ok: false, code: 'invalid_input' });
    expect(mockAuctionCreate).not.toHaveBeenCalled();
  });
});
