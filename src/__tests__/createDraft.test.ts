import { createDraft } from '@/lib/actions';
import { players as BASE_PLAYERS } from '@/data/players';
import type { DraftInput } from '@/lib/draftInputSchema';
import { normalizeName } from '@/lib/sleeperNormalize';

const mockAuth = jest.fn();
const mockTransaction = jest.fn();
const mockRevalidatePath = jest.fn();
const mockApplyProjectionValuesToDraft = jest.fn();
const mockSleeperPlayerFindMany = jest.fn();
const mockRankingSetFindUnique = jest.fn();

const mockTxDraftCreate = jest.fn();
const mockTxDraftCount = jest.fn();
const mockTxDraftUpdate = jest.fn();
const mockTxTeamCreateManyAndReturn = jest.fn();
const mockTxPlayerCreateMany = jest.fn().mockResolvedValue({ count: 270 });
const mockTxOnboardingCreateMany = jest.fn();
const mockTxOnboardingUpdateMany = jest.fn();
const mockTxExecuteRaw = jest.fn();
const mockTx = {
  $executeRaw: (...args: unknown[]) => mockTxExecuteRaw(...args),
  draft: { count: mockTxDraftCount, create: mockTxDraftCreate, update: mockTxDraftUpdate },
  team: { createManyAndReturn: (...args: unknown[]) => mockTxTeamCreateManyAndReturn(...args) },
  player: { createMany: mockTxPlayerCreateMany },
  onboardingProgress: {
    createMany: mockTxOnboardingCreateMany,
    updateMany: mockTxOnboardingUpdateMany,
  },
};

jest.mock('@/auth', () => ({ auth: () => mockAuth() }));
jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));
jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
    sleeperPlayer: { findMany: (...args: unknown[]) => mockSleeperPlayerFindMany(...args) },
    userRankingSet: { findUnique: (...args: unknown[]) => mockRankingSetFindUnique(...args) },
  },
}));
jest.mock('@/lib/projectionApplication', () => ({
  applyProjectionValuesToDraft: (...args: unknown[]) => mockApplyProjectionValuesToDraft(...args),
}));

const MOCK_SESSION = { user: { id: '123456789', name: 'Cole' } };
const MOCK_DRAFT_CREATED_AT = new Date('2026-07-10T12:00:00.000Z');

const VALID_INPUT: DraftInput = {
  name: "Cole's Draft 2025",
  budgetPerTeam: 1000,
  rosterSize: 30,
  futurePickAuctionMode: 'packages',
  targetRoster: { QB: 4, RB: 9, WR: 11, TE: 3 },
  startingLineup: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'FLEX', 'SUPER_FLEX'],
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
  jest.useFakeTimers({ doNotFake: ['performance'] });
  jest.setSystemTime(MOCK_DRAFT_CREATED_AT);
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
  mockTxDraftCount.mockResolvedValue(0);
  mockTxDraftCreate.mockResolvedValue({ id: 5, createdAt: MOCK_DRAFT_CREATED_AT });
  mockTxTeamCreateManyAndReturn.mockResolvedValue([
    { id: 10, handle: 'coreschke' },
    { id: 11, handle: 'team2' },
  ]);
  mockTxDraftUpdate.mockResolvedValue({});
  mockApplyProjectionValuesToDraft.mockResolvedValue({ projectionSourceId: 7, appliedCount: 250 });
  mockTxExecuteRaw.mockResolvedValue(1);
  mockTxOnboardingCreateMany.mockResolvedValue({ count: 1 });
  mockTxOnboardingUpdateMany.mockResolvedValue({ count: 0 });
  mockRankingSetFindUnique.mockResolvedValue(null);
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

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('createDraft — auth and validation gate', () => {
  it('returns UNAUTHORIZED when called without a session', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(createDraft(VALID_INPUT)).resolves.toEqual({ ok: false, code: 'UNAUTHORIZED' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('returns INVALID_INPUT for an empty draft name', async () => {
    const result = await createDraft({ ...VALID_INPUT, name: '   ' });
    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('returns INVALID_INPUT for a non-integer budgetPerTeam', async () => {
    const result = await createDraft({ ...VALID_INPUT, budgetPerTeam: 999.5 });
    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT' });
  });

  it('returns INVALID_INPUT for a rosterSize over the maximum', async () => {
    const result = await createDraft({ ...VALID_INPUT, rosterSize: 101 });
    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT' });
  });

  it('returns INVALID_INPUT for a starting lineup with no QB or SUPER_FLEX slot', async () => {
    const result = await createDraft({
      ...VALID_INPUT,
      startingLineup: ['RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'FLEX', 'FLEX', 'FLEX'],
    });
    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT' });
  });

  it('returns INVALID_INPUT for an out-of-range scoring setting', async () => {
    const result = await createDraft({
      ...VALID_INPUT,
      scoringSettings: { ...VALID_INPUT.scoringSettings, pprRB: 10 },
    });
    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT' });
  });

  it('returns INVALID_INPUT when handles collide case-insensitively', async () => {
    const result = await createDraft({
      ...VALID_INPUT,
      teams: [
        { handle: 'Cole', displayName: '', isMine: true },
        { handle: 'cole', displayName: '', isMine: false },
      ],
    });
    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT' });
  });

  it('returns INVALID_INPUT when no team is marked as mine', async () => {
    const result = await createDraft({
      ...VALID_INPUT,
      teams: VALID_INPUT.teams.map((t) => ({ ...t, isMine: false })),
    });
    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT' });
  });

  it('returns INVALID_INPUT when multiple teams are marked as mine', async () => {
    const result = await createDraft({
      ...VALID_INPUT,
      teams: VALID_INPUT.teams.map((t) => ({ ...t, isMine: true })),
    });
    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT' });
  });

  it('returns INVALID_INPUT for a duplicate sleeperRosterId among submitted teams', async () => {
    const result = await createDraft({
      ...VALID_INPUT,
      teams: [
        { ...VALID_INPUT.teams[0], sleeperRosterId: 1 },
        { ...VALID_INPUT.teams[1], sleeperRosterId: 1 },
      ],
    });
    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT' });
  });

  it('returns NO_RANKING_SET when playerSource is custom and no ranking set exists', async () => {
    mockRankingSetFindUnique.mockResolvedValue(null);
    const result = await createDraft({ ...VALID_INPUT, playerSource: 'custom' });
    expect(result).toEqual({ ok: false, code: 'NO_RANKING_SET' });
    expect(mockTxDraftCreate).not.toHaveBeenCalled();
  });
});

describe('createDraft — happy path', () => {
  it('persists the timestamp used to derive future-pick years', async () => {
    const creationTimestamp = new Date('2026-12-31T23:59:59.999Z');
    jest.setSystemTime(creationTimestamp);
    mockTxDraftCreate.mockResolvedValue({
      id: 5,
      createdAt: new Date('2027-01-01T00:00:00.001Z'),
    });

    await createDraft(VALID_INPUT);

    expect(mockTxDraftCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ createdAt: creationTimestamp }),
    });
    const playerRows = mockTxPlayerCreateMany.mock.calls[0][0].data as Array<{
      futurePickYear: number | null;
    }>;
    expect(playerRows.filter((player) => player.futurePickYear !== null)).toEqual(
      expect.arrayContaining([expect.objectContaining({ futurePickYear: 2027 })]),
    );
  });

  it('creates the draft inside the transaction and returns its id', async () => {
    const result = await createDraft(VALID_INPUT);
    expect(result).toEqual({ ok: true, data: { draftId: 5 } });
    expect(mockTxDraftCreate).toHaveBeenCalledWith({
      data: {
        name: "Cole's Draft 2025",
        ownerId: '123456789',
        createdAt: MOCK_DRAFT_CREATED_AT,
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

  it('creates all teams in one batched call scoped to the draft', async () => {
    await createDraft(VALID_INPUT);
    expect(mockTxTeamCreateManyAndReturn).toHaveBeenCalledTimes(1);
    expect(mockTxTeamCreateManyAndReturn).toHaveBeenCalledWith({
      data: [
        {
          handle: 'coreschke',
          displayName: 'Cole',
          budget: 1000,
          draftId: 5,
          sleeperRosterId: undefined,
        },
        {
          handle: 'team2',
          displayName: 'Team Two',
          budget: 1000,
          draftId: 5,
          sleeperRosterId: undefined,
        },
      ],
      select: { id: true, handle: true },
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
    expect(mockTxTeamCreateManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([expect.objectContaining({ sleeperRosterId: 1 })]),
      }),
    );
  });

  it('sets ownerTeamId by correlating the returned rows on handle, not position', async () => {
    // createManyAndReturn's row order is not a documented guarantee — return them reversed
    // relative to the input array to prove the lookup isn't positional.
    mockTxTeamCreateManyAndReturn.mockResolvedValue([
      { id: 11, handle: 'team2' },
      { id: 10, handle: 'coreschke' },
    ]);
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
    expect(mockTxTeamCreateManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ handle: 'coreschke', displayName: 'coreschke' }),
        ]),
      }),
    );
  });

  it('applies stored projections to the new draft before returning', async () => {
    await createDraft(VALID_INPUT);
    expect(mockApplyProjectionValuesToDraft).toHaveBeenCalledWith(mockTx, {
      draftId: 5,
      etrMatches: expect.any(Map),
      useBatchTransaction: false,
    });
  });

  it('returns DUPLICATE_TEAM when the batched team insert hits a unique-constraint conflict', async () => {
    mockTxTeamCreateManyAndReturn.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['handle', 'draftId'] },
    });
    const result = await createDraft(VALID_INPUT);
    expect(result).toEqual({ ok: false, code: 'DUPLICATE_TEAM' });
  });

  it('logs a duration for each transaction stage', async () => {
    await createDraft(VALID_INPUT);
    const infoSpy = console.info as jest.Mock;
    const stageLogs = infoSpy.mock.calls.map((call) => call[0] as string);
    expect(stageLogs.some((line) => line.includes('stage=team-insert'))).toBe(true);
    expect(stageLogs.some((line) => line.includes('stage=player-insert'))).toBe(true);
    expect(stageLogs.some((line) => line.includes('stage=projection-application'))).toBe(true);
  });

  it('starts the feature tour after successfully creating the owner’s first draft', async () => {
    mockTxOnboardingUpdateMany.mockResolvedValue({ count: 1 });
    await createDraft(VALID_INPUT);
    expect(mockTxDraftCount).toHaveBeenCalledWith({ where: { ownerId: '123456789' } });
    expect(mockTxOnboardingCreateMany).toHaveBeenCalledWith({
      data: {
        userId: '123456789',
        phase: 'FEATURE_TOUR',
        draftId: 5,
        step: 'VALUE_SHEET_INTRO',
      },
      skipDuplicates: true,
    });
    expect(mockTxOnboardingUpdateMany).toHaveBeenCalledWith({
      where: { userId: '123456789', phase: 'DRAFT_SETUP' },
      data: {
        phase: 'FEATURE_TOUR',
        draftId: 5,
        step: 'VALUE_SHEET_INTRO',
        subjectPlayerName: null,
      },
    });
    expect(mockTxOnboardingCreateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mockTxOnboardingUpdateMany.mock.invocationCallOrder[0],
    );
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

  it('fails loudly (throws, not a typed result) when automatic projection application fails', async () => {
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
    const payload = mockTxPlayerCreateMany.mock.calls[0][0].data as Array<{ name: string }>;
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

    expect(payload[0].baseBudget).toBe(BASE_PLAYERS[0].budget);
    expect(payload[0].baseCeiling).toBe(BASE_PLAYERS[0].ceiling);
    expect(payload[0].baseFloor).toBe(BASE_PLAYERS[0].floor);

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
  it('seeds from the custom ranking set plus generated future pick assets', async () => {
    mockRankingSetFindUnique.mockResolvedValue({
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
    mockRankingSetFindUnique.mockResolvedValue({
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
    mockRankingSetFindUnique.mockResolvedValue({
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

    const twelveTeams = Array.from({ length: 12 }, (_, index) => ({
      handle: `team${index + 1}`,
      displayName: `Team ${index + 1}`,
      isMine: index === 0,
    }));
    mockTxTeamCreateManyAndReturn.mockResolvedValue(
      twelveTeams.map((team, index) => ({ id: index + 1, handle: team.handle })),
    );

    await createDraft({
      ...VALID_INPUT,
      playerSource: 'custom',
      budgetPerTeam: 1000,
      teams: twelveTeams,
    });
    expect(mockTxDraftCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ playerValueSourceBudget: 500 }),
      }),
    );
    const created = mockTxPlayerCreateMany.mock.calls[0][0].data as Array<{
      name: string;
      budget: number;
      ceiling: number;
      floor: number;
      baseBudget: number;
      baseCeiling: number;
      baseFloor: number;
    }>;
    expect(created[0]).toMatchObject({
      budget: 200,
      baseBudget: 100,
    });
    expect(created.find((player) => player.name === "team1's 2027 package")).toMatchObject({
      budget: 110,
      ceiling: 132,
      floor: 76,
      baseBudget: 55,
      baseCeiling: 66,
      baseFloor: 38,
    });
    expect(created.find((player) => player.name === 'team1 2027 1st')).toMatchObject({
      budget: 76,
      ceiling: 90,
      floor: 52,
      baseBudget: 38,
      baseCeiling: 45,
      baseFloor: 26,
    });
  });
});
