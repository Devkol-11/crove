import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],

  projects: [
    // ── API (headless HTTP tests — no browser needed) ─────────────────────────
    {
      name: 'api',
      testMatch: /.*\.api\.spec\.ts/,
      use: {
        baseURL: process.env['API_URL'] ?? 'http://localhost:3001',
        extraHTTPHeaders: {
          'Content-Type': 'application/json',
        },
      },
    },

    // ── Browser E2E (full-stack flows) ────────────────────────────────────────
    {
      name: 'chromium',
      testMatch: /.*\.e2e\.spec\.ts/,
      use: {
        baseURL: process.env['WEB_URL'] ?? 'http://localhost:3000',
        headless: true,
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
      },
    },
  ],

  // Automatically start both servers when running locally
  webServer: process.env['CI']
    ? undefined
    : [
        {
          command: 'pnpm --filter api dev',
          url: process.env['API_URL'] ?? 'http://localhost:3001/health',
          reuseExistingServer: true,
          timeout: 60_000,
        },
        {
          command: 'pnpm --filter web dev',
          url: process.env['WEB_URL'] ?? 'http://localhost:3000',
          reuseExistingServer: true,
          timeout: 60_000,
        },
      ],
})
