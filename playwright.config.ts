import { defineConfig } from '@playwright/test';

/**
 * Browser tests run against the built single-file page (dist-single), opened
 * from disk exactly as a person would. `npm run test:e2e` builds it first.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  globalSetup: './e2e/global-setup.ts',
  timeout: 60_000,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  projects: [
    // The installed Google Chrome, so no browser download is needed for it.
    { name: 'chrome', use: { channel: 'chrome' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
