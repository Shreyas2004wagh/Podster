import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  retries: 0,
  webServer: process.env.CI
    ? {
        command: 'pnpm --filter frontend start',
        url: 'http://localhost:3000',
        timeout: 120 * 1000,
        reuseExistingServer: false,
      }
    : undefined,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
});
