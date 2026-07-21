import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { expect, test, type Page, type Route } from '@playwright/test';
import { format as formatWithPrettier } from 'prettier';
import { LEAGUE_TEAMS } from '../src/lib/teams';
import { runCleanupSteps } from '../scripts/testDatabase';
import { prisma, closeDb } from './db';
import { assertDisposablePerformanceDatabase } from './databaseSafety';
import { E2E_TEST_USER_ID } from './env';

const PLAYER_COUNT = 267;
const QB_COUNT = 67;
const SLEEPER_IDENTITY_COUNT = 5_000;
const SAMPLE_COUNT = 25;
const WARMUP_SAMPLES = 5;
const INTERACTION_BUDGET_MS = 200;
const BASELINE_FILE = 'docs/performance/hard-017-baseline.json';
const PREFIX = `hard-017-${Date.now()}`;
const NORMALIZED_PREFIX = PREFIX.replaceAll('-', ' ');
const VARIANT = process.env.HARD_017_VARIANT === 'baseline' ? 'baseline' : 'final';
let draftId: number | null = null;
let rankingSetId: number | null = null;
let rankingPlayerId: number | null = null;

interface PerformanceMeasurement {
  variant: 'baseline' | 'final';
  sourceCommit?: string;
  date: string;
  browser: string;
  valueSheetRscBytes: number;
  rankingsRscBytes: number;
  searchResponseBytes: number | null;
  searchResultCount: number | null;
  renderedRows: number;
  domNodes: number;
  filterSamples: number[];
  sortSamples: number[];
  filterP75: number;
  sortP75: number;
}

assertDisposablePerformanceDatabase(process.env.DATABASE_URL);

function percentile75(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.75) - 1];
}

function percentDelta(baseline: number, final: number): string {
  if (baseline === 0) return 'n/a';
  const delta = ((final - baseline) / baseline) * 100;
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
}

function currentSourceRevision(): string {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
  return dirty ? `${commit} (working tree includes changes)` : commit;
}

async function settlePaint(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function captureRscNavigation(
  page: Page,
  targetPath: string,
  navigate: () => Promise<void>,
): Promise<number> {
  let bytes = 0;
  const matchesTargetRsc = (url: URL) =>
    url.pathname === targetPath && url.searchParams.has('_rsc');
  const measureRoute = async (route: Route) => {
    const response = await route.fetch();
    const body = await response.body();
    bytes += body.byteLength;
    await route.fulfill({ response, body });
  };

  await page.route(matchesTargetRsc, measureRoute);
  try {
    await navigate();
    await settlePaint(page);
  } finally {
    await page.unroute(matchesTargetRsc, measureRoute);
  }
  return bytes;
}

async function clickFilterAndWait(
  page: Page,
  testId: string,
  expectedRows: number,
): Promise<number> {
  return page.evaluate(
    async ({ buttonTestId, rowCount }) => {
      const button = document.querySelector<HTMLButtonElement>(`[data-testid="${buttonTestId}"]`);
      if (!button) throw new Error(`Missing filter button: ${buttonTestId}`);

      const start = performance.now();
      button.click();
      await new Promise<void>((resolve, reject) => {
        const deadline = start + 5_000;
        const check = () => {
          const renderedRows = document.querySelectorAll('[data-testid^="player-row-"]').length;
          if (renderedRows === rowCount) {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          } else if (performance.now() >= deadline) {
            reject(new Error(`Timed out waiting for ${rowCount} player rows`));
          } else {
            requestAnimationFrame(check);
          }
        };
        requestAnimationFrame(check);
      });
      return performance.now() - start;
    },
    { buttonTestId: testId, rowCount: expectedRows },
  );
}

async function measureFilter(page: Page): Promise<number[]> {
  const samples: number[] = [];
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    samples.push(await clickFilterAndWait(page, 'position-filter-QB', QB_COUNT));
    await clickFilterAndWait(page, 'position-filter-ALL', PLAYER_COUNT);
  }
  return samples.slice(WARMUP_SAMPLES);
}

async function measureSort(page: Page): Promise<number[]> {
  const samples: number[] = [];
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    samples.push(
      await page.evaluate(async () => {
        const button = document.querySelector<HTMLButtonElement>('[data-testid="sort-player"]');
        const header = button?.closest('th');
        if (!button || !header) throw new Error('Missing player sort control');
        const previousSort = header.getAttribute('aria-sort');
        const start = performance.now();
        button.click();

        await new Promise<void>((resolve, reject) => {
          const deadline = start + 5_000;
          const check = () => {
            const currentSort = header.getAttribute('aria-sort');
            if (currentSort !== previousSort && currentSort !== 'none') {
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            } else if (performance.now() >= deadline) {
              reject(new Error('Timed out waiting for player sort'));
            } else {
              requestAnimationFrame(check);
            }
          };
          requestAnimationFrame(check);
        });
        return performance.now() - start;
      }),
    );
  }
  return samples.slice(WARMUP_SAMPLES);
}

function formatMeasurement(measurement: PerformanceMeasurement): string {
  const search =
    measurement.searchResponseBytes === null
      ? 'n/a (bounded endpoint not present)'
      : `${measurement.searchResponseBytes} (${measurement.searchResultCount} results)`;
  return `### ${measurement.variant === 'baseline' ? 'Baseline' : 'Final'}

- Date: ${measurement.date}
- Source commit: ${measurement.sourceCommit ?? 'current HARD-017 working tree'}
- Browser: ${measurement.browser}
- Value-sheet RSC bytes: ${measurement.valueSheetRscBytes}
- Rankings RSC bytes: ${measurement.rankingsRscBytes}
- Bounded Sleeper search bytes: ${search}
- Rendered rows: ${measurement.renderedRows}
- Main descendant DOM nodes: ${measurement.domNodes}
- QB-filter p75: ${measurement.filterP75.toFixed(1)} ms
- Player-sort p75: ${measurement.sortP75.toFixed(1)} ms
- QB-filter samples: ${measurement.filterSamples.map((value) => value.toFixed(1)).join(', ')}
- Player-sort samples: ${measurement.sortSamples.map((value) => value.toFixed(1)).join(', ')}
`;
}

function renderReport(
  baseline: PerformanceMeasurement | null,
  final: PerformanceMeasurement,
): string {
  const comparison = baseline
    ? `| Metric | Baseline | Final | Delta |
| --- | ---: | ---: | ---: |
| Value-sheet RSC bytes | ${baseline.valueSheetRscBytes} | ${final.valueSheetRscBytes} | ${percentDelta(baseline.valueSheetRscBytes, final.valueSheetRscBytes)} |
| Rankings RSC bytes | ${baseline.rankingsRscBytes} | ${final.rankingsRscBytes} | ${percentDelta(baseline.rankingsRscBytes, final.rankingsRscBytes)} |
| Main descendant DOM nodes | ${baseline.domNodes} | ${final.domNodes} | ${percentDelta(baseline.domNodes, final.domNodes)} |
| QB-filter p75 (ms) | ${baseline.filterP75.toFixed(1)} | ${final.filterP75.toFixed(1)} | ${percentDelta(baseline.filterP75, final.filterP75)} |
| Player-sort p75 (ms) | ${baseline.sortP75.toFixed(1)} | ${final.sortP75.toFixed(1)} | ${percentDelta(baseline.sortP75, final.sortP75)} |`
    : 'Baseline measurement was not supplied.';

  return `# HARD-017 Performance Results

- Command: \`pnpm performance:hard-017\`
- Viewport: 390 × 844
- CPU throttle: 4× Chromium CDP emulation
- Fixture players: ${PLAYER_COUNT}
- Fixture Sleeper identities: ${SLEEPER_IDENTITY_COUNT}
- Warm-up samples discarded: ${WARMUP_SAMPLES}
- Retained samples per interaction: ${SAMPLE_COUNT - WARMUP_SAMPLES}
- Interaction budget: ≤ ${INTERACTION_BUDGET_MS} ms at p75

## Comparison

${comparison}

## Raw measurements

${baseline ? `${formatMeasurement(baseline)}\n` : ''}${formatMeasurement(final).trimEnd()}
`;
}

test.beforeAll(async () => {
  const draft = await prisma.draft.create({ data: { name: PREFIX, ownerId: E2E_TEST_USER_ID } });
  draftId = draft.id;
  const fixtureDraftId = draft.id;
  await prisma.team.createMany({
    data: LEAGUE_TEAMS.map((team) => ({ ...team, budget: 1000, draftId: fixtureDraftId })),
  });
  const owner = await prisma.team.findFirstOrThrow({
    where: { draftId: fixtureDraftId, handle: 'coreschke' },
  });
  await prisma.draft.update({ where: { id: fixtureDraftId }, data: { ownerTeamId: owner.id } });
  await prisma.player.createMany({
    data: Array.from({ length: PLAYER_COUNT }, (_, index) => ({
      name: `${PREFIX} Player ${index + 1}`,
      nflTeam: 'FA',
      pos: (['QB', 'RB', 'WR', 'TE'] as const)[index % 4],
      age: 24,
      sfRank: index + 1,
      budget: PLAYER_COUNT - index,
      ceiling: 300 - index,
      floor: Math.max(1, 230 - index),
      baseBudget: PLAYER_COUNT - index,
      baseCeiling: 300 - index,
      baseFloor: Math.max(1, 230 - index),
      draftId: fixtureDraftId,
    })),
  });
  await prisma.sleeperPlayer.createMany({
    data: Array.from({ length: SLEEPER_IDENTITY_COUNT }, (_, index) => ({
      id: `${PREFIX}-sleeper-${index}`,
      name: `${PREFIX} Search ${index + 1}`,
      normalizedName: `${NORMALIZED_PREFIX} search ${index + 1}`,
      team: 'FA',
      pos: 'QB',
    })),
  });
  const rankingSet = await prisma.userRankingSet.create({
    data: {
      userId: E2E_TEST_USER_ID,
      fileName: `${PREFIX}.csv`,
    },
  });
  rankingSetId = rankingSet.id;
  const rankingPlayer = await prisma.userRankingPlayer.create({
    data: {
      rankingSetId: rankingSet.id,
      name: `${PREFIX} Unmatched`,
      team: 'FA',
      pos: 'QB',
      sfRank: 1,
      budget: 100,
      ceiling: 115,
      floor: 87,
      matchStatus: 'unmatched',
    },
  });
  rankingPlayerId = rankingPlayer.id;
});

test.afterAll(async () => {
  await runCleanupSteps([
    async () => {
      if (rankingSetId !== null) {
        await prisma.userRankingSet.delete({ where: { id: rankingSetId } });
      }
    },
    async () => {
      if (draftId !== null) await prisma.player.deleteMany({ where: { draftId } });
    },
    async () => {
      if (draftId !== null) {
        await prisma.draft.update({ where: { id: draftId }, data: { ownerTeamId: null } });
      }
    },
    async () => {
      if (draftId !== null) await prisma.team.deleteMany({ where: { draftId } });
    },
    async () => {
      if (draftId !== null) await prisma.draft.delete({ where: { id: draftId } });
    },
    async () => {
      await prisma.sleeperPlayer.deleteMany({ where: { id: { startsWith: PREFIX } } });
    },
    closeDb,
  ]);
});

test('records the HARD-017 diagnostic report', async ({ browser, page }) => {
  test.setTimeout(180_000);
  if (draftId === null || rankingPlayerId === null) {
    throw new Error('Performance fixture was not created');
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  await page.goto('/drafts');
  const navigationMarker = `hard-017-${Date.now()}`;
  await page.evaluate((marker) => {
    document.documentElement.dataset.hard017Navigation = marker;
  }, navigationMarker);
  const valueSheetPath = `/draft/${draftId}`;
  const valueSheetRscBytes = await captureRscNavigation(page, valueSheetPath, async () => {
    await page.getByTestId(`draft-link-${draftId}`).click();
    await page.waitForURL(valueSheetPath);
    await expect(page.getByTestId('player-row-1')).toBeVisible();
  });
  expect(await page.evaluate(() => document.documentElement.dataset.hard017Navigation)).toBe(
    navigationMarker,
  );
  const renderedRows = await page.locator('[data-testid^="player-row-"]').count();
  const domNodes = await page.locator('main').locator('*').count();
  const filterSamples = await measureFilter(page);
  const sortSamples = await measureSort(page);

  const rankingsRscBytes = await captureRscNavigation(page, '/rankings', async () => {
    await page.getByTestId('mobile-nav-menu').click();
    await page.getByTestId('mobile-nav-rankings').click();
    await page.waitForURL('/rankings');
    await expect(page.getByTestId(`unmatched-row-${rankingPlayerId}`)).toBeVisible();
  });
  expect(await page.evaluate(() => document.documentElement.dataset.hard017Navigation)).toBe(
    navigationMarker,
  );

  const searchResult =
    VARIANT === 'final'
      ? await page.evaluate(async () => {
          const response = await fetch('/api/rankings/sleeper-search?q=hard&position=QB');
          if (!response.ok) throw new Error(`Sleeper search failed with ${response.status}`);
          return (await response.json()) as { results: Array<{ id: string }> };
        })
      : null;
  const searchResponseBytes = searchResult ? Buffer.byteLength(JSON.stringify(searchResult)) : null;
  const filterP75 = percentile75(filterSamples);
  const sortP75 = percentile75(sortSamples);
  const measurement: PerformanceMeasurement = {
    variant: VARIANT,
    sourceCommit: currentSourceRevision(),
    date: new Date().toISOString(),
    browser: browser.version(),
    valueSheetRscBytes,
    rankingsRscBytes,
    searchResponseBytes,
    searchResultCount: searchResult?.results.length ?? null,
    renderedRows,
    domNodes,
    filterSamples,
    sortSamples,
    filterP75,
    sortP75,
  };

  const resultFile = process.env.HARD_017_RESULT_FILE;
  if (resultFile) {
    await writeFile(resultFile, `${JSON.stringify(measurement, null, 2)}\n`);
  } else {
    const baselineFile = process.env.HARD_017_BASELINE_FILE ?? BASELINE_FILE;
    const baseline = JSON.parse(await readFile(baselineFile, 'utf8')) as PerformanceMeasurement;
    const report = await formatWithPrettier(renderReport(baseline, measurement), {
      parser: 'markdown',
    });
    await writeFile('docs/performance/hard-017.md', report, 'utf8');
  }

  expect(renderedRows).toBe(PLAYER_COUNT);
  expect(valueSheetRscBytes).toBeGreaterThan(0);
  expect(rankingsRscBytes).toBeGreaterThan(0);
  expect(filterSamples).toHaveLength(SAMPLE_COUNT - WARMUP_SAMPLES);
  expect(sortSamples).toHaveLength(SAMPLE_COUNT - WARMUP_SAMPLES);
  if (VARIANT === 'final') {
    expect(searchResult?.results).toHaveLength(8);
    expect(filterP75).toBeLessThanOrEqual(INTERACTION_BUDGET_MS);
    expect(sortP75).toBeLessThanOrEqual(INTERACTION_BUDGET_MS);
    const baselineFile = process.env.HARD_017_BASELINE_FILE ?? BASELINE_FILE;
    const baseline = JSON.parse(await readFile(baselineFile, 'utf8')) as PerformanceMeasurement;
    expect(valueSheetRscBytes).toBeLessThanOrEqual(baseline.valueSheetRscBytes * 1.05);
    expect(rankingsRscBytes).toBeLessThanOrEqual(baseline.rankingsRscBytes * 1.05);
    expect(domNodes).toBeLessThanOrEqual(baseline.domNodes * 1.05);
  }
});
