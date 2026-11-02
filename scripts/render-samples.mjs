// Renders the sample mockups in scripts/samples/ to public/samples/.
// Run from the project root: node scripts/render-samples.mjs
// Needs `playwright install chromium`, or PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
// Also writes scripts/samples/pins.json: the page-relative centre of every
// element with a data-pin attribute, so sample comments land on real elements.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const samples = resolve(root, 'scripts/samples');
const out = resolve(root, 'public/samples');
const fixtures = resolve(root, 'tests/fixtures');
mkdirSync(out, { recursive: true });
mkdirSync(fixtures, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined
});

const pins = {};
const sizes = {};

/** Convert PNG bytes to WebP with the browser's encoder. */
async function encoder() {
  const page = await browser.newPage();
  return async (png, file, quality = 0.88) => {
    const b64 = await page.evaluate(
      async ({ data, quality }) => {
        const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        const webp = await new Promise((r) => canvas.toBlob(r, 'image/webp', quality));
        const bytes = new Uint8Array(await webp.arrayBuffer());
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000)
          s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return { data: btoa(s), width: bitmap.width, height: bitmap.height };
      },
      { data: png.toString('base64'), quality }
    );
    writeFileSync(resolve(out, file), Buffer.from(b64.data, 'base64'));
    sizes[file] = { width: b64.width, height: b64.height, bytes: statSync(resolve(out, file)).size };
  };
}
const toWebp = await encoder();

async function open(html, viewport, scale) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(`[${html}]`, e.message));
  await page.goto(pathToFileURL(resolve(samples, html)).href);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function measure(page, name, rootSelector) {
  pins[name] = await page.evaluate((sel) => {
    const base = (sel ? document.querySelector(sel) : document.documentElement).getBoundingClientRect();
    const result = {};
    (sel ? document.querySelector(sel) : document).querySelectorAll('[data-pin]').forEach((el) => {
      const r = el.getBoundingClientRect();
      result[el.dataset.pin] = {
        cx: +((r.left + r.width / 2 - base.left) / base.width).toFixed(4),
        cy: +((r.top + r.height / 2 - base.top) / base.height).toFixed(4),
        left: +((r.left - base.left) / base.width).toFixed(4),
        top: +((r.top - base.top) / base.height).toFixed(4),
        right: +((r.right - base.left) / base.width).toFixed(4),
        bottom: +((r.bottom - base.top) / base.height).toFixed(4)
      };
    });
    return result;
  }, rootSelector ?? null);
}

// Homepage V1 and V2: 1440 CSS px at 2x, so 2880 px wide.
for (const [html, file, name] of [
  ['skerry/homepage-v1.html', 'skerry-homepage-v1.webp', 'skerry-v1'],
  ['skerry/homepage-v2.html', 'skerry-homepage-v2.webp', 'skerry-v2']
]) {
  const page = await open(html, { width: 1440, height: 900 }, 2);
  await measure(page, name);
  await toWebp(await page.screenshot({ fullPage: true, type: 'png' }), file);
  await page.context().close();
}

// Brand guidelines: one WebP per page, and a real PDF.
{
  const page = await open('oxbow/guidelines.html', { width: 1280, height: 800 }, 2);
  for (let i = 1; i <= 6; i++) {
    await measure(page, `oxbow-p${i}`, `#p${i}`);
    const el = page.locator(`#p${i}`);
    await toWebp(await el.screenshot({ type: 'png' }), `oxbow-guidelines-p${i}.webp`);
  }
  const pdf = resolve(out, 'oxbow-brand-guidelines.pdf');
  await page.pdf({ path: pdf, printBackground: true, preferCSSPageSize: true });
  copyFileSync(pdf, resolve(fixtures, 'brand-guidelines.pdf'));
  sizes['oxbow-brand-guidelines.pdf'] = { bytes: statSync(pdf).size };
  await page.context().close();
}

// Packaging label.
{
  const page = await open('aldaia/label.html', { width: 1400, height: 900 }, 2);
  await measure(page, 'aldaia');
  await toWebp(await page.screenshot({ type: 'png' }), 'aldaia-label.webp');
  await page.context().close();
}

// Studio logo.
{
  const page = await open('studio/logo.html', { width: 256, height: 256 }, 1);
  await toWebp(await page.screenshot({ type: 'png' }), 'studio-logo.webp', 0.95);
  await page.context().close();
}

// Test fixture: a finished small mockup as PNG.
{
  const page = await open('skerry/poster.html', { width: 800, height: 1000 }, 1);
  const png = resolve(fixtures, 'sample-image.png');
  await page.screenshot({ path: png, type: 'png' });
  sizes['tests/fixtures/sample-image.png'] = { bytes: statSync(png).size };
  await page.context().close();
}

writeFileSync(resolve(samples, 'pins.json'), `${JSON.stringify(pins, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(sizes, null, 2));
