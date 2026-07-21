import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { LEAGUE_TEAMS } from '../src/lib/teams';
import { prisma, closeDb } from './db';
import { E2E_TEST_USER_ID } from './env';

const PLAYER_COUNT = 267;
const SAMPLE_COUNT = 25;
const WARMUP_SAMPLES = 5;
const PREFIX = `hard-017-${Date.now()}`;
const NORMALIZED_PREFIX = PREFIX.replaceAll('-', ' ');
let draftId: number;

function percentile75(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.75) - 1];
}

async function settlePaint(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function measureFilter(page: Page): Promise<number[]> {
  const samples: number[] = [];
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const start = await page.evaluate(() => performance.now());
    await page.getByTestId('position-filter-QB').click();
    await expect(page.locator('[data-testid^="player-row-"]')).toHaveCount(67);
    await settlePaint(page);
    samples.push((await page.evaluate(() => performance.now())) - start);
    await page.getByTestId('position-filter-ALL').click();
    await expect(page.locator('[data-testid^="player-row-"]')).toHaveCount(PLAYER_COUNT);
  }
  return samples.slice(WARMUP_SAMPLES);
}

async function measureSort(page: Page): Promise<number[]> {
  const samples: number[] = [];
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const start = await page.evaluate(() => performance.now());
    await page.getByTestId('sort-player').click();
    await settlePaint(page);
    samples.push((await page.evaluate(() => performance.now())) - start);
  }
  return samples.slice(WARMUP_SAMPLES);
}

test.beforeAll(async () => {
  const draft = await prisma.draft.create({ data: { name: PREFIX, ownerId: E2E_TEST_USER_ID } });
  draftId = draft.id;
  await prisma.team.createMany({
    data: LEAGUE_TEAMS.map((team) => ({ ...team, budget: 1000, draftId })),
  });
  const owner = await prisma.team.findFirstOrThrow({ where: { draftId, handle: 'coreschke' } });
  await prisma.draft.update({ where: { id: draftId }, data: { ownerTeamId: owner.id } });
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
      draftId,
    })),
  });
  await prisma.sleeperPlayer.createMany({
    data: Array.from({ length: 8 }, (_, index) => ({
      id: `${PREFIX}-sleeper-${index}`,
      name: `${PREFIX} Search ${index + 1}`,
      normalizedName: `${NORMALIZED_PREFIX} search ${index + 1}`,
      team: 'FA',
      pos: 'QB',
    })),
  });
});

test.afterAll(async () => {
  await prisma.player.deleteMany({ where: { draftId } });
  await prisma.draft.update({ where: { id: draftId }, data: { ownerTeamId: null } });
  await prisma.team.deleteMany({ where: { draftId } });
  await prisma.draft.delete({ where: { id: draftId } });
  await prisma.sleeperPlayer.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await closeDb();
});

test('records the HARD-017 diagnostic report', async ({ browser, page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const rscBytes: number[] = [];
  page.on('response', (response) => {
    const contentType = response.headers()['content-type'] ?? '';
    if (contentType.includes('text/x-component')) {
      void response
        .text()
        .then((body) => rscBytes.push(Buffer.byteLength(body)))
        .catch(() => {});
    }
  });

  await page.goto(`/draft/${draftId}`);
  await expect(page.getByTestId('player-row-1')).toBeVisible();
  await settlePaint(page);
  const rows = await page.locator('[data-testid^="player-row-"]').count();
  const domNodes = await page.locator('main').locator('*').count();
  const filterSamples = await measureFilter(page);
  const sortSamples = await measureSort(page);

  await page.goto('/rankings');
  const searchResult = await page.evaluate(async () => {
    const response = await fetch('/api/rankings/sleeper-search?q=hard&position=QB');
    return (await response.json()) as { results: Array<{ id: string }> };
  });
  const searchResponseBytes = Buffer.byteLength(JSON.stringify(searchResult));
  await expect.poll(() => rscBytes.length).toBeGreaterThan(0);

  const report = `# HARD-017 Performance Results

- Date: ${new Date().toISOString()}
- Browser: ${browser.version()}
- Viewport: 390 × 844
- CPU throttle: 4× Chromium CDP emulation
- Fixture players: ${PLAYER_COUNT}
- Rendered rows: ${rows}
- Main descendant DOM nodes: ${domNodes}
- Value-sheet RSC bytes: ${rscBytes[0]}
- Bounded Sleeper search bytes: ${searchResponseBytes} (${searchResult.results.length} results)

## Interaction timing (ms)

Warm-up samples discarded: ${WARMUP_SAMPLES}; each list below has ${filterSamples.length} retained samples.

| Interaction | p75 | Raw samples |
| --- | ---: | --- |
| QB filter | ${percentile75(filterSamples).toFixed(1)} | ${filterSamples.map((value) => value.toFixed(1)).join(', ')} |
| Player sort | ${percentile75(sortSamples).toFixed(1)} | ${sortSamples.map((value) => value.toFixed(1)).join(', ')} |
`;
  await writeFile('docs/performance/hard-017.md', report);

  expect(rows).toBe(PLAYER_COUNT);
  expect(searchResult.results).toHaveLength(8);
  expect(searchResponseBytes).toBeLessThan(2_000);
  expect(percentile75(filterSamples)).toBeGreaterThan(0);
  expect(percentile75(sortSamples)).toBeGreaterThan(0);
});
