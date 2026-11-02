// Debug check: draws every sample pin onto its page and prints each page's
// comments, so coordinates can be verified by eye. Writes to .tmp/pins/.
// Run from the project root: node scripts/samples/debug-pins.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { sampleData } from '../../src/sample/data.ts';

const executablePath = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const browser = await chromium.launch({ executablePath });
mkdirSync('.tmp/pins', { recursive: true });
const data = sampleData();
let total = 0;
let internal = 0;
const ids = new Set();

for (const review of data.reviews) {
  for (const asset of review.assets) {
    for (const version of asset.versions) {
      total += version.comments.length;
      internal += version.comments.filter((c) => c.internal).length;
      for (const c of version.comments) {
        if (ids.has(c.id)) throw new Error(`duplicate id ${c.id}`);
        ids.add(c.id);
        if (c.parentId && !version.comments.some((p) => p.id === c.parentId))
          throw new Error(`bad parent ${c.id}`);
      }
      for (const [index, page] of version.pages.entries()) {
        const number = index + 1;
        const roots = version.comments.filter((c) => !c.parentId && c.pageNumber === number);
        if (!roots.length) continue;
        const width = 1200;
        const dots = roots
          .map(
            (c, i) =>
              `<div title="${c.id}" style="position:absolute;left:${c.x * 100}%;top:${c.y * 100}%;transform:translate(-50%,-50%);width:26px;height:26px;border-radius:50%;background:${c.internal ? '#7A4B00' : '#D92D20'};color:#fff;font:600 13px/26px Helvetica;text-align:center;outline:2px solid #fff">${i + 1}</div>`
          )
          .join('');
        const html = `<!doctype html><body style="margin:0"><div style="position:relative;width:${width}px"><img id=i src="${pathToFileURL(resolve(`public${page.src}`)).href}" style="display:block;width:100%">${dots}</div></body>`;
        const file = resolve(`.tmp/pins/${version.id}-p${number}`);
        writeFileSync(`${file}.html`, html);
        const p = await browser.newPage({ viewport: { width, height: 900 } });
        await p.goto(pathToFileURL(`${file}.html`).href, { waitUntil: 'load' });
        await p.screenshot({ path: `${file}.png`, fullPage: true });
        await p.close();
        console.log(`${version.id} p${number}`);
        roots.forEach((c, i) => console.log(`  ${i + 1} ${c.id}: ${c.body.slice(0, 70)}`));
      }
    }
  }
}
await browser.close();
console.log(`comments ${total}, internal ${internal}`);
