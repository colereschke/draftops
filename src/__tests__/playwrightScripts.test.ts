/** @jest-environment node */

import packageJson from '../../package.json';

describe('Playwright scripts', () => {
  it('keeps the diagnostic performance project out of the normal E2E command', () => {
    expect(packageJson.scripts['test:e2e']).toBe(
      'playwright test --project=unauthenticated --project=authenticated',
    );
    expect(packageJson.scripts['performance:hard-017']).toBe(
      'pnpm build && PLAYWRIGHT_FORCE_NEW_SERVER=1 playwright test --project=performance',
    );
  });
});
