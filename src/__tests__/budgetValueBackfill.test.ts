import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  planBudgetValueBackfill,
  runBudgetValueBackfill,
  type BudgetValueBackfillDependencies,
  type BudgetValueBackfillDraft,
  type BudgetValueBackfillPrisma,
} from '@/lib/budgetValueBackfill';
import { DEFAULT_SCORING_SETTINGS, DEFAULT_STARTING_LINEUP } from '@/types';
import {
  parseBudgetValueBackfillArgs,
  toOperatorSummary,
  writeBudgetValueSnapshot,
} from '../../prisma/backfill-budget-scaled-values';

const draft200: BudgetValueBackfillDraft = {
  id: 5,
  name: '$200 Draft',
  createdAt: new Date('2026-07-01T12:00:00.000Z'),
  budget: 200,
  playerValueSourceBudget: 1000,
  teamCount: 12,
  rosterSize: 30,
  futurePickAuctionMode: 'PACKAGES',
  startingLineup: [...DEFAULT_STARTING_LINEUP],
  scoringSettings: { ...DEFAULT_SCORING_SETTINGS },
  targetRoster: { QB: 4, RB: 9, WR: 11, TE: 3 },
  players: [
    {
      id: 10,
      name: 'Player One',
      nflTeam: 'BUF',
      pos: 'QB',
      age: 25,
      sfRank: 1,
      notes: '',
      budget: 100,
      ceiling: 115,
      floor: 87,
      baseBudget: 100,
      baseCeiling: 115,
      baseFloor: 87,
      sleeperId: 's1',
      customKey: null,
      futurePickYear: null,
      futurePickRound: null,
      futurePickOriginHandle: null,
      futurePickAssetKind: null,
    },
    {
      id: 11,
      name: 'Team Package',
      nflTeam: 'team-one',
      pos: 'PKG',
      age: null,
      sfRank: 900,
      notes: '',
      budget: 109,
      ceiling: 131,
      floor: 75,
      baseBudget: 109,
      baseCeiling: 131,
      baseFloor: 75,
      sleeperId: null,
      customKey: 'pkg:team-one',
      futurePickYear: 2027,
      futurePickRound: null,
      futurePickOriginHandle: 'team-one',
      futurePickAssetKind: 'package',
    },
  ],
  playerValues: [
    {
      id: 20,
      draftId: 5,
      playerId: 10,
      projectionSourceId: 7,
      projectedPoints: 300,
      replacementPoints: 200,
      vor: 100,
      projectionAuctionValue: 105,
      fallbackAuctionValue: 100,
      activeAuctionValue: 110,
      valueSource: 'projection_adjusted_market',
      createdAt: new Date('2026-07-15T12:00:00.000Z'),
      updatedAt: new Date('2026-07-15T12:00:00.000Z'),
    },
  ],
};

const mockDraftFindMany = jest.fn();
const mockTransaction = jest.fn();
const mockActiveValueAggregate = jest.fn();
const mockPlayerUpdate = jest.fn();
const mockWriteSnapshot = jest.fn();
const mockApplyProjections = jest.fn();

const mockTx = { player: { update: mockPlayerUpdate } };

const prismaMock = {
  draft: { findMany: mockDraftFindMany },
  draftPlayerValue: { aggregate: mockActiveValueAggregate },
  $transaction: mockTransaction,
} satisfies {
  draft: { findMany: jest.Mock };
  draftPlayerValue: { aggregate: jest.Mock };
  $transaction: jest.Mock;
};
const prisma = prismaMock as unknown as BudgetValueBackfillPrisma;

const dependencies: BudgetValueBackfillDependencies = {
  writeSnapshot: mockWriteSnapshot,
  applyProjections: mockApplyProjections,
};

describe('budget value backfill CLI', () => {
  it('parses dry-run, apply, draft, and snapshot-directory options', () => {
    expect(parseBudgetValueBackfillArgs([])).toEqual({
      apply: false,
      draftId: undefined,
      snapshotDir: 'valuation-backfill-snapshots',
    });
    expect(
      parseBudgetValueBackfillArgs(['--apply', '--draft-id', '5', '--snapshot-dir', '/tmp/values']),
    ).toEqual({ apply: true, draftId: 5, snapshotDir: '/tmp/values' });
    expect(parseBudgetValueBackfillArgs(['--', '--draft-id', '5'])).toEqual({
      apply: false,
      draftId: 5,
      snapshotDir: 'valuation-backfill-snapshots',
    });
  });

  it.each<string[]>([['--draft-id'], ['--draft-id', '0'], ['--draft-id', '1.5'], ['--unknown']])(
    'rejects malformed arguments: %s',
    (...args) => {
      expect(() => parseBudgetValueBackfillArgs(args)).toThrow('Usage:');
    },
  );

  it('writes a parseable timestamped JSON snapshot', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'draftops-values-'));
    try {
      const path = await writeBudgetValueSnapshot(
        { createdAt: '2026-07-16T12:00:00.000Z', drafts: [draft200] },
        directory,
      );

      expect(path).toContain('budget-values-2026-07-16T12-00-00-000Z.json');
      await expect(readFile(path, 'utf8').then(JSON.parse)).resolves.toMatchObject({
        drafts: [{ id: 5 }],
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('refuses to overwrite an existing snapshot', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'draftops-values-'));
    const snapshot = { createdAt: '2026-07-16T12:00:00.000Z', drafts: [draft200] };
    try {
      await writeBudgetValueSnapshot(snapshot, directory);

      await expect(writeBudgetValueSnapshot(snapshot, directory)).rejects.toMatchObject({
        code: 'EEXIST',
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockDraftFindMany.mockResolvedValue([draft200]);
  mockWriteSnapshot.mockResolvedValue('/snapshots/value-backfill.json');
  mockTransaction.mockImplementation((callback) => callback(mockTx));
  mockPlayerUpdate.mockResolvedValue({});
  mockApplyProjections.mockResolvedValue({ projectionSourceId: 7, appliedCount: 1 });
  mockActiveValueAggregate.mockResolvedValue({ _sum: { activeAuctionValue: 24 } });
});

describe('planBudgetValueBackfill', () => {
  it('plans from immutable base values and reports aggregate changes', () => {
    const plan = planBudgetValueBackfill([draft200]);

    expect(plan.drafts[0]).toMatchObject({
      draftId: 5,
      changedPlayerCount: 2,
      beforeFallbackTotal: 209,
      afterFallbackTotal: 42,
      beforeActiveTotal: 110,
      afterActiveTotal: 22,
    });
    expect(plan.drafts[0].playerUpdates).toEqual([
      { id: 10, budget: 20, ceiling: 23, floor: 17 },
      { id: 11, budget: 22, ceiling: 26, floor: 15 },
    ]);
  });

  it('skips scale-one drafts', () => {
    expect(planBudgetValueBackfill([{ ...draft200, budget: 1000 }]).drafts).toHaveLength(0);
  });

  it('rejects an invalid persisted source budget with the draft ID', () => {
    const invalidDraft = { ...draft200, playerValueSourceBudget: 0 };

    expect(() => planBudgetValueBackfill([invalidDraft])).toThrow(
      'Draft 5: source budget must be a positive safe integer',
    );
  });

  it('rejects an invalid persisted draft budget with the draft ID', () => {
    const invalidDraft = { ...draft200, budget: 0 };

    expect(() => planBudgetValueBackfill([invalidDraft])).toThrow(
      'Draft 5: draft budget must be a positive safe integer',
    );
  });

  it('rejects equal invalid persisted budgets instead of skipping the draft', () => {
    const invalidDraft = { ...draft200, budget: 0, playerValueSourceBudget: 0 };

    expect(() => planBudgetValueBackfill([invalidDraft])).toThrow(
      'Draft 5: source budget must be a positive safe integer',
    );
  });

  it('is idempotent because current fallback values do not affect recomputation', () => {
    const first = planBudgetValueBackfill([draft200]);
    const alreadyScaled = {
      ...draft200,
      players: draft200.players.map((player) => {
        const update = first.drafts[0].playerUpdates.find((item) => item.id === player.id)!;
        return { ...player, ...update };
      }),
    };

    expect(planBudgetValueBackfill([alreadyScaled]).drafts[0].playerUpdates).toEqual(
      first.drafts[0].playerUpdates,
    );
  });

  it('rejects an invalid persisted future-pick asset kind with the player ID', () => {
    const invalidDraft = {
      ...draft200,
      players: [{ ...draft200.players[0], futurePickAssetKind: 'bundle' }],
    };

    expect(() => planBudgetValueBackfill([invalidDraft])).toThrow(
      'Invalid future pick asset kind for player 10: bundle',
    );
  });
});

describe('runBudgetValueBackfill', () => {
  it('dry run neither snapshots nor opens a transaction', async () => {
    const result = await runBudgetValueBackfill(prisma, { apply: false }, dependencies);

    expect(result.mode).toBe('dry-run');
    expect(result.snapshotPath).toBeNull();
    expect(result.drafts[0].afterActiveTotal).toBe(22);
    expect(dependencies.writeSnapshot).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('labels the dry-run active total as an estimate in operator output', async () => {
    const result = await runBudgetValueBackfill(prisma, { apply: false }, dependencies);

    expect(toOperatorSummary(result).drafts[0]).toMatchObject({
      estimatedAfterActiveTotal: 22,
    });
    expect(toOperatorSummary(result).drafts[0]).not.toHaveProperty('afterActiveTotal');
  });

  it('writes one complete snapshot before the first transaction', async () => {
    await runBudgetValueBackfill(prisma, { apply: true }, dependencies);

    expect(dependencies.writeSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ drafts: [expect.objectContaining({ id: 5 })] }),
      'valuation-backfill-snapshots',
    );
    expect(dependencies.writeSnapshot).toHaveBeenCalledTimes(1);
    expect(mockWriteSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      mockTransaction.mock.invocationCallOrder[0],
    );
  });

  it('performs no database mutation when snapshot writing fails', async () => {
    mockWriteSnapshot.mockRejectedValue(new Error('snapshot denied'));

    await expect(runBudgetValueBackfill(prisma, { apply: true }, dependencies)).rejects.toThrow(
      'snapshot denied',
    );
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockPlayerUpdate).not.toHaveBeenCalled();
  });

  it('updates players and reapplies projections inside the same draft transaction', async () => {
    await runBudgetValueBackfill(prisma, { apply: true }, dependencies);

    expect(mockPlayerUpdate).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { budget: 20, ceiling: 23, floor: 17 },
    });
    expect(mockPlayerUpdate).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { budget: 22, ceiling: 26, floor: 15 },
    });
    expect(dependencies.applyProjections).toHaveBeenCalledWith(mockTx, {
      draftId: 5,
      useBatchTransaction: false,
    });
    expect(mockPlayerUpdate.mock.invocationCallOrder[1]).toBeLessThan(
      mockApplyProjections.mock.invocationCallOrder[0],
    );
  });

  it('allows sixty seconds for each draft transaction', async () => {
    await runBudgetValueBackfill(prisma, { apply: true }, dependencies);

    expect(mockTransaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 60_000 });
  });

  it('replaces the dry-run active estimate with the committed active total after apply', async () => {
    const result = await runBudgetValueBackfill(prisma, { apply: true }, dependencies);

    expect(result.mode).toBe('applied');
    expect(result.snapshotPath).toBe('/snapshots/value-backfill.json');
    expect(result.drafts[0].afterActiveTotal).toBe(24);
    expect(mockActiveValueAggregate).toHaveBeenCalledWith({
      where: { draftId: 5 },
      _sum: { activeAuctionValue: true },
    });
  });

  it('limits the source query when a draft ID is provided', async () => {
    await runBudgetValueBackfill(prisma, { apply: false, draftId: 5 }, dependencies);

    expect(mockDraftFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 5 } }));
  });

  it('allows projection reapplication failures to propagate', async () => {
    mockApplyProjections.mockRejectedValue(new Error('projection failure'));

    await expect(runBudgetValueBackfill(prisma, { apply: true }, dependencies)).rejects.toThrow(
      'projection failure',
    );
  });
});
