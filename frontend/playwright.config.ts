import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  retries: 0,
  webServer: {
    command: 'pnpm exec next dev -p 3000',
    url: 'http://localhost:3000',
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
});
