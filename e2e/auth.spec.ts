import { test, expect } from '@playwright/test';

test('unauthenticated visitor is redirected to sign-in', async ({ page }) => {
  const response = await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in/);
  expect(response?.headers()['x-content-type-options']).toBe('nosniff');
  expect(response?.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(response?.headers()['x-frame-options']).toBe('DENY');
  expect(response?.headers()['permissions-policy']).toContain('camera=()');
  expect(response?.headers()['content-security-policy-report-only']).toContain(
    "default-src 'self'",
  );
  expect(response?.headers()['content-security-policy']).toBeUndefined();
});
