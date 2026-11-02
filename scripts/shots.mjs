// Screenshots at desktop and phone widths: node scripts/shots.mjs <name=path>...
import { chromium } from '@playwright/test';
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const base = process.env.BASE ?? 'http://127.0.0.1:58806';
const browser = await chromium.launch({ executablePath: exe });
for (const [label, width, height, mobile] of [['d', 1440, 900, false], ['m', 390, 844, true]]) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`); });
  for (const arg of process.argv.slice(2)) {
    const [name, path] = arg.split('=');
    await page.goto(base + path, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `.tmp/shots/${name}-${label}.png` });
    console.log(label, name, await page.title(), 'overflowX:', await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  }
  if (errors.length) console.log(label, 'ERRORS', [...new Set(errors)].slice(0, 12).join('\n'));
  await context.close();
}
await browser.close();
