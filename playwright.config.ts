import { defineConfig } from '@playwright/test';

// Runs against the dev server Layerwise already owns. Local preview never sends
// real email, and test data is named `e2e-` and cleaned up by the tests.
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell`;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: '.tmp/playwright-results',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:58806',
    launchOptions: { executablePath },
    trace: 'off'
  }
});
