import { defineConfig } from '@playwright/test';

// Set BASE_URL to test a deployed site, e.g. BASE_URL=https://sih.nish24.workers.dev
const baseURL = process.env.BASE_URL || 'http://localhost:4321';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'bun run dev',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
