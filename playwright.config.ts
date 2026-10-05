import { defineConfig } from '@playwright/test';

const PORT = 4173;

/**
 * Two projects:
 *  - "unit": fast Node-only tests of the pure modules in src/lib (no browser)
 *  - "chromium": end-to-end UI tests against the production build served by `vite preview`
 *
 * `npm test` runs both. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to use a locally
 * installed Chromium instead of the one Playwright downloads.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    },
  },
  projects: [
    { name: 'unit', testMatch: /unit\/.*\.spec\.ts$/ },
    { name: 'chromium', testMatch: /ui\/.*\.spec\.ts$/, use: { browserName: 'chromium' } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
