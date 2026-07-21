import { expect, test } from '@playwright/test';
import { installCspViolationCollector, readCspViolations } from './cspViolations';
import { getSeededDraftId } from './fixtures/getDraftId';
import { BID_TARGET } from './fixtures/players';

test('report-only CSP has no violations across representative authenticated flows', async ({
  page,
}) => {
  await installCspViolationCollector(page);
  const draftId = await getSeededDraftId();

  await page.goto(`/draft/${draftId}`);
  await page.getByTestId(`player-row-${BID_TARGET.sfRank}`).click();
  await expect(page.getByTestId('bid-price')).toBeVisible();

  await page.goto(`/draft/${draftId}/nominate`);
  await expect(page.getByTestId('nomination-helper-layout')).toBeVisible();
  await page.goto(`/draft/${draftId}/budget`);
  await expect(page.getByTestId('threat-pos-QB')).toBeVisible();

  expect(await readCspViolations(page)).toEqual([]);
});
