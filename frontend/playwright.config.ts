import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  retries: 0,
  webServer: {
    command: 'pnpm run dev:test',
    url: 'http://localhost:3100',
    timeout: 120 * 1000,
    reuseExistingServer: false,
  },
  use: {
    baseURL: 'http://localhost:3100',
    permissions: ['camera', 'microphone'],
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['camera', 'microphone'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
          ],
        },
      },
    },
  ],
});
