import { defineConfig } from '@playwright/test';
import { BASE_URL } from './tests/e2e/base-url';

// Runs against a dev server that's already running; see tests/e2e/base-url.ts.
// Local preview never sends real email, and test data is named `e2e-`.
//
// Uses the browser from `playwright install`. To use another Chromium, set
// PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to its executable.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: '.tmp/playwright-results',
  use: {
    baseURL: BASE_URL,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined
    },
    trace: 'off'
  }
});
