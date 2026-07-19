import { test, expect } from '@playwright/test';
import { getSeededDraftId } from './fixtures/getDraftId';
import { BID_TARGET } from './fixtures/players';

test('logging a bid is reflected on the value sheet', async ({ page }) => {
  const draftId = await getSeededDraftId();
  await page.goto(`/draft/${draftId}`);

  const row = page.getByTestId(`player-row-${BID_TARGET.sfRank}`);
  await expect(row).toBeVisible();
  await row.click();

  await expect(page.getByTestId('bid-price')).toBeVisible();
  await page.getByTestId('bid-price').fill('42');
  await page.getByTestId('bid-submit').click();

  await expect(page.getByTestId('bid-price')).toHaveCount(0);
  await expect(row).toContainText('$42');
});
