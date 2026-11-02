// Renders public/logo.svg to public/logo.png and every favicon size.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const svg = readFileSync('public/logo.svg', 'utf8');
const browser = await chromium.launch({ executablePath: exe });

async function render(size) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
  );
  const png = await page.screenshot({ omitBackground: true });
  await page.close();
  return png;
}

const outputs = {
  'public/logo.png': 1024,
  'public/favicon.png': 512,
  'public/android-chrome-512x512.png': 512,
  'public/android-chrome-192x192.png': 192,
  'public/apple-touch-icon.png': 180,
  'public/favicon-32x32.png': 32,
  'public/favicon-16x16.png': 16
};
for (const [path, size] of Object.entries(outputs)) writeFileSync(path, await render(size));

// favicon.ico holds PNG frames at 16, 32 and 48 px.
const frames = await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await render(size) })));
const header = Buffer.alloc(6 + 16 * frames.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach(({ size, png }, index) => {
  const entry = 6 + 16 * index;
  header[entry] = size;
  header[entry + 1] = size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
writeFileSync('public/favicon.ico', Buffer.concat([header, ...frames.map((frame) => frame.png)]));

// A contact sheet at real sizes, for checking legibility.
const sheet = await browser.newPage({ viewport: { width: 420, height: 140 }, deviceScaleFactor: 3 });
await sheet.setContent(
  `<body style="margin:0;display:flex;gap:18px;align-items:center;padding:16px;background:#fff">${[96, 48, 32, 24, 16]
    .map((size) => `<span style="display:block;width:${size}px;height:${size}px">${svg.replace(/width="1024" height="1024"/, `width="${size}" height="${size}"`)}</span>`)
    .join('')}<span style="width:32px;height:32px;padding:6px;background:#1c1c1e">${svg.replace(/width="1024" height="1024"/, 'width="32" height="32"')}</span></body>`
);
await sheet.screenshot({ path: '.tmp/shots/logo-sheet.png' });
await browser.close();
