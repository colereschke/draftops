import { test, expect } from '@playwright/test';
import { getSeededDraftId } from './fixtures/getDraftId';

test('teams and budget pages render seeded data', async ({ page }) => {
  const draftId = await getSeededDraftId();

  await page.goto(`/draft/${draftId}/teams`);
  await expect(page.locator('[data-testid^="dossier-card-"]')).toHaveCount(12);

  await page.goto(`/draft/${draftId}/budget`);
  await expect(page.getByTestId('threat-pos-QB')).toBeVisible();
});
