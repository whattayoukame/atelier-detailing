import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:5173',
    ...devices['iPhone 13'],
    browserName: 'chromium',
    channel: 'chrome'
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:5173/s/atelier/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
});
