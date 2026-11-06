import { expect, test } from '@playwright/test';
import { ready } from './helpers';

/** Clicks a part of the page image that no existing pin covers. */
async function dropPinOnEmptySpot(page: import('@playwright/test').Page) {
  const box = (await page.getByTestId('stage').locator('img').boundingBox())!;
  for (const y of [0.15, 0.3, 0.45, 0.6, 0.75]) {
    for (const x of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const point = { x: box.x + box.width * x, y: box.y + box.height * y };
      const free = await page.evaluate(
        ({ x, y }) => {
          const element = document.elementFromPoint(x, y);
          return Boolean(element?.closest('[data-testid=stage]') && !element.closest('.rl-pin'));
        },
        point
      );
      if (free) {
        await page.mouse.click(point.x, point.y);
        return;
      }
    }
  }
  throw new Error('No free spot on the page');
}

/** The Powered by Layerwise badge in the landing footer: a plain image read. */
const BADGE = /^https:\/\/layerwise\.app\/powered-by(-dark)?\.png$/;

/** Every request that isn't a plain read, and every server function call. */
function watchWrites(page: import('@playwright/test').Page) {
  const writes: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(page.url() === 'about:blank' ? request.url() : page.url()).origin) {
      if (request.method() === 'GET' && BADGE.test(url.href)) return;
      writes.push(`external ${request.method()} ${url.href}`);
      return;
    }
    if (url.pathname.startsWith('/@') || url.pathname.startsWith('/node_modules/')) return;
    if (request.method() !== 'GET' && request.method() !== 'HEAD') {
      writes.push(`${request.method()} ${url.pathname}`);
    }
    if (url.pathname.includes('_serverFn') || url.pathname.startsWith('/api/')) {
      writes.push(`${request.method()} ${url.pathname}`);
    }
  });
  return writes;
}

test.setTimeout(60_000);

test('Landing: a visitor drops a pin at once, with no server calls', async ({ page }) => {
  const writes = watchWrites(page);
  await ready(page, '/');
  await expect(page.getByTestId('stage')).toBeVisible();
  await dropPinOnEmptySpot(page);
  const composer = page.getByTestId('new-pin-composer');
  await composer.getByRole('textbox').fill('Could this headline sit lower?');
  await composer.getByRole('button', { name: 'Comment' }).click();
  await expect(page.getByTestId('thread').filter({ hasText: 'Could this headline sit lower?' })).toBeVisible();
  expect(writes).toEqual([]);
});

test('Try mode runs end to end in browser storage only', async ({ page }) => {
  const writes = watchWrites(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await ready(page, '/');
  await page.getByRole('link', { name: 'Try Redline' }).first().click();
  await expect(page).toHaveURL(/\/try/);

  // Dashboard: the three sample reviews.
  const rows = page.getByTestId('review-row');
  await expect(rows).toHaveCount(3);
  await page.getByPlaceholder('Search reviews').fill('Oxbow');
  await expect(rows).toHaveCount(1);
  await page.getByPlaceholder('Search reviews').fill('');
  await expect(rows).toHaveCount(3);

  // Inbox: unread state changes.
  await page.getByTestId('nav-inbox').click();
  await expect(page.getByTestId('inbox-item').first()).toBeVisible();
  expect(parseInt(await page.getByTestId('nav-unread').innerText(), 10)).toBeGreaterThan(0);
  await page.getByTestId('mark-all-read').click();
  await expect(page.getByTestId('nav-unread')).toHaveCount(0);

  // Team view: internal comments visible, a new internal comment works.
  await page.getByTestId('nav-reviews').click();
  await rows.filter({ hasText: 'Skerry' }).first().getByRole('link').first().click();
  await expect(page.getByTestId('stage')).toBeVisible();
  await page.getByTestId('filter-all').click();
  await expect(page.locator('[data-testid=thread][data-internal=true]').first()).toBeVisible();
  await dropPinOnEmptySpot(page);
  const composer = page.getByTestId('new-pin-composer');
  await composer.getByRole('textbox').fill('Try-mode team note');
  await composer.getByRole('checkbox').click();
  await composer.getByRole('button', { name: 'Comment' }).click();
  const note = page.getByTestId('thread').filter({ hasText: 'Try-mode team note' });
  await expect(note).toHaveAttribute('data-internal', 'true');

  // Compare two versions.
  await page.getByTestId('version-menu').click();
  await page.getByTestId('open-compare').click();
  await expect(page.getByTestId('compare')).toBeVisible();
  await page.getByTestId('compare-slider').fill('30');
  await page.getByRole('button', { name: 'Close compare' }).click();

  // Uploading and sharing say they're off rather than pretending.
  await page.getByTestId('try-share').click();
  await expect(page.getByText(/Try mode/).last()).toBeVisible();
  await page.getByTestId('try-upload').click();

  // Guest view of the same review: no internal comments, a pin and a decision.
  await page.getByTestId('try-guest-view').click();
  await expect(page).toHaveURL(/\/try\/guest\//);
  await expect(page.getByTestId('stage')).toBeVisible();
  await page.getByTestId('filter-all').click();
  await expect(page.getByTestId('thread').first()).toBeVisible();
  await expect(page.locator('[data-testid=thread][data-internal=true]')).toHaveCount(0);
  await expect(page.getByText('Try-mode team note')).toHaveCount(0);

  await dropPinOnEmptySpot(page);
  await composer.getByRole('textbox').fill('Try-mode guest pin');
  await composer.getByRole('button', { name: 'Comment' }).click();
  await expect(page.getByTestId('thread').filter({ hasText: 'Try-mode guest pin' })).toBeVisible();

  await page.getByTestId('approve').click();
  await expect(page.getByTestId('asset-status')).toContainText('Approved');

  // It all survives a reload, from browser storage.
  await page.reload();
  await expect(page.getByTestId('stage')).toBeVisible();
  await page.getByTestId('filter-all').click();
  await expect(page.getByTestId('thread').filter({ hasText: 'Try-mode guest pin' })).toBeVisible();

  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
