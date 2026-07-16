import { createDraft } from '@/lib/actions';
import type { StartingSlot } from '@/types';
import { players as BASE_PLAYERS } from '@/data/players';
import { normalizeName } from '@/lib/sleeperNormalize';

const mockAuth = jest.fn();
const mockTransaction = jest.fn();
const mockRevalidatePath = jest.fn();
const mockRedirect = jest.fn();
const mockApplyProjectionValuesToDraft = jest.fn();
const mockSleeperPlayerFindMany = jest.fn();

// Mock tx client
const mockTxDraftCreate = jest.fn();
const mockTxDraftCount = jest.fn();
const mockTxDraftUpdate = jest.fn();
const mockTxTeamCreate = jest.fn();
const mockTxPlayerCreateMany = jest.fn().mockResolvedValue({ count: 270 });
const mockTxUserRankingSetFindUnique = jest.fn();
const mockTxOnboardingFindUnique = jest.fn();
const mockTxOnboardingCreate = jest.fn();
const mockTxOnboardingUpdateMany = jest.fn();
const mockTxExecuteRaw = jest.fn();
const mockTx = {
  $executeRaw: (...args: unknown[]) => mockTxExecuteRaw(...args),
  draft: { count: mockTxDraftCount, create: mockTxDraftCreate, update: mockTxDraftUpdate },
  team: { create: mockTxTeamCreate },
  player: { createMany: mockTxPlayerCreateMany },
  userRankingSet: { findUnique: mockTxUserRankingSetFindUnique },
  onboardingProgress: {
    create: mockTxOnboardingCreate,
    findUnique: mockTxOnboardingFindUnique,
    updateMany: mockTxOnboardingUpdateMany,
  },
};

jest.mock('@/auth', () => ({ auth: () => mockAuth() }));
jest.mock('next/navigation', () => ({ redirect: (...args: unknown[]) => mockRedirect(...args) }));
jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));
jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
    sleeperPlayer: { findMany: (...args: unknown[]) => mockSleeperPlayerFindMany(...args) },
  },
}));
jest.mock('@/lib/projectionApplication', () => ({
  applyProjectionValuesToDraft: (...args: unknown[]) => mockApplyProjectionValuesToDraft(...args),
}));

const MOCK_SESSION = { user: { id: '123456789', name: 'Cole' } };
const MOCK_DRAFT_CREATED_AT = new Date('2026-07-10T12:00:00.000Z');

const VALID_INPUT = {
  name: "Cole's Draft 2025",
  budgetPerTeam: 1000,
  rosterSize: 30,
  futurePickAuctionMode: 'packages' as const,
  targetRoster: { QB: 4, RB: 9, WR: 11, TE: 3 },
  startingLineup: [
    'QB',
    'RB',
    'RB',
    'WR',
    'WR',
    'TE',
    'FLEX',
    'FLEX',
    'FLEX',
    'SUPER_FLEX',
  ] as StartingSlot[],
  scoringSettings: {
    passYdsPerPoint: 25,
    passTD: 4,
    passInt: -2,
    rushAtt: 0,
    rushFD: 0,
    pprRB: 1,
    pprWR: 1,
    pprTE: 1,
    recFD: 0,
    rbFDBonus: 0,
    wrFDBonus: 0,
    teFDBonus: 0,
  },
  teams: [
    { handle: 'coreschke', displayName: 'Cole', isMine: true },
    { handle: 'team2', displayName: 'Team Two', isMine: false },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
  mockTxDraftCount.mockResolvedValue(0);
  mockTxDraftCreate.mockResolvedValue({ id: 5, createdAt: MOCK_DRAFT_CREATED_AT });
  mockTxTeamCreate
    .mockResolvedValueOnce({ id: 10, handle: 'coreschke' })
    .mockResolvedValueOnce({ id: 11, handle: 'team2' });
  mockTxDraftUpdate.mockResolvedValue({});
  mockApplyProjectionValuesToDraft.mockResolvedValue({ projectionSourceId: 7, appliedCount: 250 });
  mockTxExecuteRaw.mockResolvedValue(1);
  mockTxOnboardingCreate.mockResolvedValue({});
  mockTxOnboardingFindUnique.mockResolvedValue(null);
  mockTxOnboardingUpdateMany.mockResolvedValue({ count: 0 });
  mockSleeperPlayerFindMany.mockResolvedValue([
    {
      id: 'sleeper-1',
      name: BASE_PLAYERS[0].player,
      normalizedName: normalizeName(BASE_PLAYERS[0].player),
      team: BASE_PLAYERS[0].team,
      pos: BASE_PLAYERS[0].pos,
    },
  ]);
  mockTransaction.mockImplementation((callback) => callback(mockTx));
});

describe('createDraft', () => {
  it('throws when called without a session', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(createDraft(VALID_INPUT)).rejects.toThrow('Unauthorized');
  });

  it('throws when handles contain duplicates', async () => {
    await expect(
      createDraft({
        ...VALID_INPUT,
        teams: [
          { handle: 'dup', displayName: '', isMine: true },
          { handle: 'dup', displayName: '', isMine: false },
        ],
      }),
    ).rejects.toThrow('Duplicate handles');
  });

  it('throws when no team is marked as mine', async () => {
    await expect(
      createDraft({
        ...VALID_INPUT,
        teams: VALID_INPUT.teams.map((t) => ({ ...t, isMine: false })),
      }),
    ).rejects.toThrow('No team marked as mine');
  });

  it('creates the draft inside the transaction', async () => {
    await createDraft(VALID_INPUT);
    expect(mockTxDraftCreate).toHaveBeenCalledWith({
      data: {
        name: "Cole's Draft 2025",
        ownerId: '123456789',
        status: 'ACTIVE',
        teamCount: 2,
        rosterSize: 30,
        budget: 1000,
        playerValueSourceBudget: 1000,
        futurePickAuctionMode: 'PACKAGES',
        startingLineup: VALID_INPUT.startingLineup,
        scoringSettings: VALID_INPUT.scoringSettings,
        targetRoster: VALID_INPUT.targetRoster,
        sleeperLeagueId: undefined,
      },
    });
  });

  it('creates all teams with correct budget scoped to the draft', async () => {
    await createDraft(VALID_INPUT);
    expect(mockTxTeamCreate).toHaveBeenCalledTimes(2);
    expect(mockTxTeamCreate).toHaveBeenCalledWith({
      data: {
        handle: 'coreschke',
        displayName: 'Cole',
        budget: 1000,
        draftId: 5,
        sleeperRosterId: undefined,
      },
    });
  });

  it('persists Sleeper league and roster IDs for imported drafts', async () => {
    await createDraft({
      ...VALID_INPUT,
      sleeperLeagueId: '1360707683916734464',
      teams: [
        { ...VALID_INPUT.teams[0], sleeperRosterId: 1 },
        { ...VALID_INPUT.teams[1], sleeperRosterId: 2 },
      ],
    });

    expect(mockTxDraftCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sleeperLeagueId: '1360707683916734464' }),
      }),
    );
    expect(mockTxTeamCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sleeperRosterId: 1 }),
      }),
    );
  });

  it('sets ownerTeamId to the "mine" team', async () => {
    await createDraft(VALID_INPUT);
    expect(mockTxDraftUpdate).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { ownerTeamId: 10 },
    });
  });

  it('coerces blank displayName to the handle', async () => {
    await createDraft({
      ...VALID_INPUT,
      teams: [
        { handle: 'coreschke', displayName: '  ', isMine: true },
        { handle: 'team2', displayName: '', isMine: false },
      ],
    });
    expect(mockTxTeamCreate).toHaveBeenCalledWith({
      data: { handle: 'coreschke', displayName: 'coreschke', budget: 1000, draftId: 5 },
    });
  });

  it('redirects to /draft/[id] after creation', async () => {
    await createDraft(VALID_INPUT);
    expect(mockRedirect).toHaveBeenCalledWith('/draft/5');
  });

  it('applies stored projections to the new draft before redirecting', async () => {
    await createDraft(VALID_INPUT);

    expect(mockApplyProjectionValuesToDraft).toHaveBeenCalledWith(mockTx, {
      draftId: 5,
      etrMatches: expect.any(Map),
      useBatchTransaction: false,
    });
    expect(mockRedirect).toHaveBeenCalledWith('/draft/5');
  });

  it('starts the feature tour after successfully creating the owner’s first draft', async () => {
    mockTxOnboardingUpdateMany.mockResolvedValue({ count: 1 });

    await createDraft(VALID_INPUT);

    expect(mockTxDraftCount).toHaveBeenCalledWith({ where: { ownerId: '123456789' } });
    expect(mockTxOnboardingUpdateMany).toHaveBeenCalledWith({
      where: { userId: '123456789', phase: 'DRAFT_SETUP' },
      data: {
        phase: 'FEATURE_TOUR',
        draftId: 5,
        step: 'VALUE_SHEET_INTRO',
        subjectPlayerName: null,
      },
    });
  });

  it('creates a feature tour when the first-draft owner has no onboarding progress', async () => {
    await createDraft(VALID_INPUT);

    expect(mockTxOnboardingCreate).toHaveBeenCalledWith({
      data: {
        userId: '123456789',
        phase: 'FEATURE_TOUR',
        draftId: 5,
        step: 'VALUE_SHEET_INTRO',
      },
    });
  });

  it('preserves an existing feature tour for the first draft', async () => {
    mockTxOnboardingFindUnique.mockResolvedValue({ phase: 'FEATURE_TOUR', draftId: 4 });

    await createDraft(VALID_INPUT);

    expect(mockTxOnboardingCreate).not.toHaveBeenCalled();
  });

  it('preserves completed onboarding for the first draft', async () => {
    mockTxOnboardingFindUnique.mockResolvedValue({ phase: 'COMPLETED' });

    await createDraft(VALID_INPUT);

    expect(mockTxOnboardingCreate).not.toHaveBeenCalled();
  });

  it('serializes a user’s first-draft eligibility check with an advisory transaction lock', async () => {
    await createDraft(VALID_INPUT);

    expect(mockTxExecuteRaw).toHaveBeenCalledTimes(1);
    expect(mockTxExecuteRaw.mock.calls[0][0].join('')).toContain('pg_advisory_xact_lock');
    expect(mockTxExecuteRaw.mock.calls[0][1]).toBe('123456789');
    expect(mockTxExecuteRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mockTxDraftCount.mock.invocationCallOrder[0],
    );
  });

  it('fails loudly when automatic projection application fails', async () => {
    let transactionRejected = false;
    mockTransaction.mockImplementation(async (callback) => {
      try {
        return await callback(mockTx);
      } catch (error) {
        transactionRejected = true;
        throw error;
      }
    });
    mockApplyProjectionValuesToDraft.mockRejectedValue(new Error('No projection source found'));

    await expect(createDraft(VALID_INPUT)).rejects.toThrow('No projection source found');
    expect(transactionRejected).toBe(true);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('seeds players from base ETR data into the Player table', async () => {
    await createDraft(VALID_INPUT);
    expect(mockTxPlayerCreateMany).toHaveBeenCalledTimes(1);
    const { data } = mockTxPlayerCreateMany.mock.calls[0][0] as { data: unknown[] };
    expect(data.length).toBeGreaterThan(200);
    expect(data[0]).toMatchObject({
      nflTeam: expect.any(String),
      pos: expect.any(String),
      draftId: 5,
      budget: expect.any(Number),
      ceiling: expect.any(Number),
      floor: expect.any(Number),
    });
  });

  it('seeds origin-team future pick assets for all teams', async () => {
    await createDraft(VALID_INPUT);

    const payload = mockTxPlayerCreateMany.mock.calls[0][0].data as Array<{
      name: string;
      pos: string;
      futurePickOriginHandle?: string | null;
      futurePickAssetKind?: string | null;
      futurePickRound?: number | null;
    }>;

    expect(payload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "coreschke's 2027 package",
          pos: 'PKG',
          futurePickOriginHandle: 'coreschke',
          futurePickAssetKind: 'package',
          futurePickRound: null,
        }),
        expect.objectContaining({
          name: 'team2 2027 1st',
          pos: 'PICK',
          futurePickOriginHandle: 'team2',
          futurePickAssetKind: 'pick',
          futurePickRound: 1,
        }),
      ]),
    );
  });

  it('scales ETR players and generated picks into a $200 draft', async () => {
    await createDraft({ ...VALID_INPUT, budgetPerTeam: 200 });
    const created = mockTxPlayerCreateMany.mock.calls[0][0].data as Array<{
      name: string;
      pos: string;
      budget: number;
      baseBudget: number;
      futurePickAssetKind?: string | null;
    }>;
    const firstSkillPlayer = created.find((player) => player.pos === 'QB')!;
    const packageAsset = created.find((player) => player.futurePickAssetKind === 'package')!;

    expect(firstSkillPlayer.baseBudget).toBe(BASE_PLAYERS[0].budget);
    expect(firstSkillPlayer.budget).toBeLessThan(firstSkillPlayer.baseBudget);
    expect(packageAsset).toMatchObject({ budget: 22, baseBudget: 109 });
  });

  it('does not seed legacy static future pick rows from base data', async () => {
    await createDraft(VALID_INPUT);

    const payload = mockTxPlayerCreateMany.mock.calls[0][0].data as Array<{
      name: string;
    }>;

    expect(payload.map((p) => p.name)).not.toEqual(
      expect.arrayContaining(['Matt Gay', '2027 1st Round Pick']),
    );
  });

  it('records base values verbatim and lifts TE budgets under a TE premium', async () => {
    await createDraft({
      ...VALID_INPUT,
      scoringSettings: { ...VALID_INPUT.scoringSettings, pprTE: 2 },
    });

    const payload = mockTxPlayerCreateMany.mock.calls[0][0].data as Array<{
      name: string;
      pos: string;
      budget: number;
      baseBudget: number;
      baseCeiling: number;
      baseFloor: number;
    }>;

    // Row order mirrors BASE_PLAYERS — base columns are the untouched source values.
    expect(payload[0].baseBudget).toBe(BASE_PLAYERS[0].budget);
    expect(payload[0].baseCeiling).toBe(BASE_PLAYERS[0].ceiling);
    expect(payload[0].baseFloor).toBe(BASE_PLAYERS[0].floor);

    // A 2x TE premium unambiguously lifts adjusted TE budgets above their base.
    const te = payload.find((r) => r.pos === 'TE')!;
    expect(te.budget).toBeGreaterThan(te.baseBudget);
  });

  it('seeds ETR sleeper identity from the match map before applying projections', async () => {
    await createDraft(VALID_INPUT);

    const payload = mockTxPlayerCreateMany.mock.calls[0][0].data as Array<{
      sleeperId?: string | null;
      projectionAuctionValue?: number | null;
    }>;

    expect(payload[0].sleeperId).toBe('sleeper-1');
    expect('projectionAuctionValue' in payload[0]).toBe(false);
  });
});

describe('createDraft with playerSource: custom', () => {
  it('throws when the user has no custom ranking set', async () => {
    mockTxUserRankingSetFindUnique.mockResolvedValue(null);
    await expect(createDraft({ ...VALID_INPUT, playerSource: 'custom' })).rejects.toThrow(
      'No custom ranking set found',
    );
    expect(mockTxDraftCreate).not.toHaveBeenCalled();
  });

  it('seeds from the custom ranking set plus generated future pick assets', async () => {
    mockTxUserRankingSetFindUnique.mockResolvedValue({
      id: 7,
      sourceBudget: 1000,
      players: [
        {
          name: 'Custom Guy',
          team: 'BUF',
          pos: 'QB',
          age: 25,
          sfRank: 1,
          budget: 200,
          ceiling: 230,
          floor: 174,
          notes: '',
          sleeperId: 's1',
        },
      ],
    });
    await createDraft({ ...VALID_INPUT, playerSource: 'custom' });
    const created = mockTxPlayerCreateMany.mock.calls[0][0].data as Array<{
      name: string;
      futurePickOriginHandle?: string | null;
      futurePickAssetKind?: string | null;
    }>;
    expect(created.some((p) => p.name === 'Custom Guy')).toBe(true);
    expect(created).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "coreschke's 2027 package",
          futurePickOriginHandle: 'coreschke',
          futurePickAssetKind: 'package',
        }),
      ]),
    );
  });

  it('uses explicit custom pick values as generated future pick baselines', async () => {
    mockTxUserRankingSetFindUnique.mockResolvedValue({
      id: 7,
      sourceBudget: 1000,
      players: [
        {
          name: 'Custom Guy',
          team: 'BUF',
          pos: 'QB',
          age: 25,
          sfRank: 1,
          budget: 200,
          ceiling: 230,
          floor: 174,
          notes: '',
          sleeperId: 's1',
        },
        {
          name: '2027 1st Round Pick',
          team: '',
          pos: 'PICK',
          age: null,
          sfRank: 2,
          budget: 90,
          ceiling: 104,
          floor: 78,
          notes: '',
          sleeperId: null,
        },
        {
          name: '2027 2nd Round Pick',
          team: '',
          pos: 'PICK',
          age: null,
          sfRank: 3,
          budget: 22,
          ceiling: 25,
          floor: 19,
          notes: '',
          sleeperId: null,
        },
        {
          name: '2027 3rd Round Pick',
          team: '',
          pos: 'PICK',
          age: null,
          sfRank: 4,
          budget: 8,
          ceiling: 9,
          floor: 7,
          notes: '',
          sleeperId: null,
        },
      ],
    });

    await createDraft({ ...VALID_INPUT, playerSource: 'custom' });

    const created = mockTxPlayerCreateMany.mock.calls[0][0].data as Array<{
      name: string;
      budget: number;
      ceiling: number;
      floor: number;
      baseBudget: number;
      futurePickAssetKind?: string | null;
    }>;

    expect(created.find((p) => p.name === "coreschke's 2027 package")).toMatchObject({
      budget: 120,
      ceiling: 138,
      floor: 104,
      baseBudget: 120,
      futurePickAssetKind: 'package',
    });
    expect(created.find((p) => p.name === 'coreschke 2027 1st')).toMatchObject({
      budget: 90,
      ceiling: 104,
      floor: 78,
      baseBudget: 90,
    });
  });

  it('uses the persisted custom ranking source budget', async () => {
    mockTxUserRankingSetFindUnique.mockResolvedValue({
      id: 7,
      sourceBudget: 500,
      players: [
        {
          name: 'Custom Guy',
          team: 'BUF',
          pos: 'QB',
          age: 25,
          sfRank: 1,
          budget: 100,
          ceiling: 115,
          floor: 87,
          notes: '',
          sleeperId: 's1',
        },
      ],
    });

    await createDraft({
      ...VALID_INPUT,
      playerSource: 'custom',
      budgetPerTeam: 1000,
      teams: Array.from({ length: 12 }, (_, index) => ({
        handle: `team${index + 1}`,
        displayName: `Team ${index + 1}`,
        isMine: index === 0,
      })),
    });
    expect(mockTxDraftCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ playerValueSourceBudget: 500 }),
      }),
    );
    expect(mockTxPlayerCreateMany.mock.calls[0][0].data[0]).toMatchObject({
      budget: 200,
      baseBudget: 100,
    });
  });
});
