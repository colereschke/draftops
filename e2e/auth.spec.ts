import { test, expect } from '@playwright/test';

test('unauthenticated visitor is redirected to sign-in', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in/);
});
