import { expect, test } from '@playwright/test';
import {
  installCspViolationCollector,
  readCspViolations,
  type CspViolation,
} from './cspViolations';
import { getSeededDraftId } from './fixtures/getDraftId';
import { BID_TARGET } from './fixtures/players';

test('keeps CSP violations collected before a full-page navigation', async ({ page }) => {
  await installCspViolationCollector(page);
  await page.goto('data:text/html,<title>first document</title>');
  await page.evaluate(() => {
    const violation = new Event('securitypolicyviolation');
    Object.defineProperties(violation, {
      effectiveDirective: { value: 'script-src' },
      violatedDirective: { value: 'script-src' },
      disposition: { value: 'report' },
      documentURI: { value: 'https://draftops.test/draft/1' },
      blockedURI: { value: 'https://cdn.example.test/script.js?token=private' },
    });
    window.dispatchEvent(violation);
  });
  await page.evaluate(async () => {
    const collectorWindow = window as unknown as {
      __draftopsRecordCspViolation: (
        violation: CspViolation & { sensitiveDetail: string },
      ) => Promise<void>;
    };
    await collectorWindow.__draftopsRecordCspViolation({
      directive: 'style-src',
      disposition: 'report',
      documentPath: 'https://draftops.test/draft/2?token=private#details',
      blockedResource: 'https://user:pass@styles.example.test/main.css?token=private',
      sensitiveDetail: 'must not be retained',
    });
  });

  await page.goto('data:text/html,<title>second document</title>');

  expect(await readCspViolations(page)).toEqual([
    {
      directive: 'script-src',
      disposition: 'report',
      documentPath: '/draft/1',
      blockedResource: 'https://cdn.example.test',
    },
    {
      directive: 'style-src',
      disposition: 'report',
      documentPath: '/draft/2',
      blockedResource: 'https://styles.example.test',
    },
  ]);
});

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
