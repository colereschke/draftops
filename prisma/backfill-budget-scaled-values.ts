import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  runBudgetValueBackfill,
  type BudgetValueBackfillOptions,
  type BudgetValueBackfillResult,
  type BudgetValueSnapshot,
} from '@/lib/budgetValueBackfill';
import { applyProjectionValuesToDraft } from '@/lib/projectionApplication';

const DEFAULT_SNAPSHOT_DIR = 'valuation-backfill-snapshots';
const USAGE =
  'Usage: pnpm db:backfill-budget-values -- ' +
  '[--apply] [--draft-id <id>] [--snapshot-dir <dir>]';

export function parseBudgetValueBackfillArgs(argv: string[]): BudgetValueBackfillOptions {
  const options: BudgetValueBackfillOptions = {
    apply: false,
    draftId: undefined,
    snapshotDir: DEFAULT_SNAPSHOT_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (index === 0 && argument === '--') continue;

    if (argument === '--apply') {
      options.apply = true;
      continue;
    }

    if (argument === '--draft-id') {
      const value = Number(argv[index + 1]);
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error(USAGE);
      options.draftId = value;
      index += 1;
      continue;
    }

    if (argument === '--snapshot-dir') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(USAGE);
      options.snapshotDir = value;
      index += 1;
      continue;
    }

    throw new Error(USAGE);
  }

  return options;
}

export async function writeBudgetValueSnapshot(
  snapshot: BudgetValueSnapshot,
  directory: string,
): Promise<string> {
  await mkdir(directory, { recursive: true });
  const timestamp = snapshot.createdAt.replace(/[:.]/g, '-');
  const path = resolve(directory, `budget-values-${timestamp}.json`);
  await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  return path;
}

async function main(): Promise<void> {
  const options = parseBudgetValueBackfillArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

  const [{ PrismaClient }, { PrismaPg }, { Pool }] = await Promise.all([
    import('@prisma/client'),
    import('@prisma/adapter-pg'),
    import('pg'),
  ]);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const result = await runBudgetValueBackfill(prisma, options, {
      writeSnapshot: writeBudgetValueSnapshot,
      applyProjections: applyProjectionValuesToDraft,
    });
    console.log(JSON.stringify(toOperatorSummary(result), null, 2));
  } finally {
    try {
      await prisma.$disconnect();
    } finally {
      await pool.end();
    }
  }
}

export function toOperatorSummary(result: BudgetValueBackfillResult) {
  return {
    mode: result.mode,
    snapshotPath: result.snapshotPath,
    drafts: result.drafts.map((draft) => ({
      draftId: draft.draftId,
      draftName: draft.draftName,
      changedPlayerCount: draft.changedPlayerCount,
      beforeFallbackTotal: draft.beforeFallbackTotal,
      afterFallbackTotal: draft.afterFallbackTotal,
      beforeActiveTotal: draft.beforeActiveTotal,
      ...(result.mode === 'dry-run'
        ? { estimatedAfterActiveTotal: draft.afterActiveTotal }
        : { afterActiveTotal: draft.afterActiveTotal }),
    })),
  };
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
