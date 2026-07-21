import { defineConfig, devices } from '@playwright/test';
import { BASE_URL, PORT } from './e2e/env';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI && process.env.PLAYWRIGHT_FORCE_NEW_SERVER !== '1',
    timeout: 60_000,
  },
  projects: [
    {
      name: 'unauthenticated',
      testMatch: /auth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'authenticated',
      testMatch: /(bid|csp|nominate|rosters)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: './e2e/.auth/user.json' },
    },
    {
      name: 'performance',
      testMatch: /performance\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: './e2e/.auth/user.json' },
    },
  ],
});
