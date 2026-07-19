import { test, expect } from '@playwright/test';
import { getSeededDraftId } from './fixtures/getDraftId';
import { NOMINATE_TARGET } from './fixtures/players';

test('nominating a player removes it from the rival-demand table', async ({ page }) => {
  const draftId = await getSeededDraftId();
  await page.goto(`/draft/${draftId}/nominate`);

  const nominateButton = page.getByTestId(`nominate-player-${NOMINATE_TARGET.name}`);
  await expect(nominateButton).toBeVisible();
  await nominateButton.click();

  await expect(nominateButton).toHaveCount(0);
});
