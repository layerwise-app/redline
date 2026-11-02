import { expect, test } from '@playwright/test';
import { ready, createReview, deleteWorkspace, dropPin, IMAGE, shareUrl, signUp, uploadFirstFile, type TestUser } from './helpers';

/**
 * Item 3, signed out, against the running server: raw HTML and every response a
 * guest's browser receives, plus media on locked, revoked, and expired links.
 */
const INTERNAL_PIN = 'E2E-SECRET-internal-pin-margin-too-tight';
const INTERNAL_REPLY = 'E2E-SECRET-internal-reply-budget-nearly-gone';
const PUBLIC_PIN = 'A question the client should see';

const secrets = (text: string) => {
  expect(text).not.toContain(INTERNAL_PIN);
  expect(text).not.toContain(INTERNAL_REPLY);
  expect(text).not.toContain('E2E-SECRET');
};

test.describe.serial('guests and internal comments', () => {
  let team: TestUser;
  let url: string;
  let pagePath: string;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    team = await signUp(browser, 'Tess E2E Team');
    const { page } = team;
    await createReview(page, 'e2e privacy review', 'e2e client');
    await uploadFirstFile(page, IMAGE);
    await dropPin(page, 0.2, 0.2, PUBLIC_PIN);
    await expect(page.getByTestId('thread').filter({ hasText: PUBLIC_PIN })).toBeVisible();
    await dropPin(page, 0.5, 0.5, INTERNAL_PIN, { internal: true });
    await expect(page.getByTestId('thread').filter({ hasText: INTERNAL_PIN })).toBeVisible();
    // An internal reply on the public thread.
    await page.getByTestId('thread').filter({ hasText: PUBLIC_PIN }).getByRole('button').first().click();
    const thread = page.getByTestId('thread').filter({ hasText: PUBLIC_PIN });
    await thread.getByRole('textbox').fill(INTERNAL_REPLY);
    await thread.getByRole('checkbox').click();
    await thread.getByRole('button', { name: 'Reply', exact: true }).click();
    await expect(thread.getByTestId('reply').filter({ hasText: INTERNAL_REPLY })).toBeVisible();
    url = await shareUrl(page);
    pagePath = new URL(url).pathname;
  });

  test.afterAll(async () => {
    await deleteWorkspace(team);
  });

  test('the team sees internal comments with the internal style', async () => {
    const row = team.page.getByTestId('thread').filter({ hasText: INTERNAL_PIN });
    await expect(row).toHaveAttribute('data-internal', 'true');
    await expect(row.getByText('INTERNAL: TEAM ONLY')).toBeVisible();
  });

  test('raw HTML for a signed-out request contains no internal comment', async ({ request }) => {
    const response = await request.get(pagePath);
    expect(response.status()).toBe(200);
    const html = await response.text();
    secrets(html);
    expect(html).toContain(PUBLIC_PIN);
    expect(html).toContain('noindex');
  });

  test('nothing a guest browser receives contains an internal comment', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const bodies: Promise<string>[] = [];
    page.on('response', (response) => {
      const type = response.headers()['content-type'] ?? '';
      if (type.includes('json') || type.includes('html') || type.includes('text')) {
        bodies.push(response.text().catch(() => ''));
      }
    });
    await ready(page, pagePath);
    await expect(page.getByTestId('thread').filter({ hasText: PUBLIC_PIN })).toBeVisible();
    // Trigger a poll, which refetches the snapshot from the server function.
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(3000);
    const all = (await Promise.all(bodies)).join('\n');
    expect(all).toContain(PUBLIC_PIN);
    secrets(all);
    secrets(await page.content());
    await expect(page.getByText('INTERNAL')).toHaveCount(0);
    await context.close();
  });

  test('images are served through the access check, not raw URLs', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await ready(page, pagePath);
    const src = (await page.getByTestId('stage').locator('img').getAttribute('src'))!;
    expect(src).toMatch(/^\/api\/guest\//);
    const response = await context.request.get(src);
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toContain('no-cache');
    await context.close();
  });

  test('locked, revoked, and expired links serve no media', async ({ browser, request }) => {
    const signedOut = await browser.newContext();
    const guest = await signedOut.newPage();
    await ready(guest, pagePath);
    const pageSrc = (await guest.getByTestId('stage').locator('img').getAttribute('src'))!;
    await signedOut.close();
    const media = async () => (await request.get(pageSrc)).status();
    expect(await media()).toBe(200);
    const { page } = team;

    const closedHtml = async () => {
      const html = await (await request.get(pagePath)).text();
      expect(html).not.toContain('/api/guest/');
      expect(html).not.toContain(PUBLIC_PIN);
      secrets(html);
    };

    // Locked.
    await page.getByTestId('share').click();
    await page.getByTestId('link-password').fill('e2e-password');
    await page.getByTestId('link-password-save').click();
    await expect(page.getByText('Password (on)')).toBeVisible();
    expect(await media()).toBe(403);
    await closedHtml();

    // The right password opens it, for the browser that gave it.
    const opener = await browser.newContext();
    const openerPage = await opener.newPage();
    await ready(openerPage, pagePath);
    await expect(openerPage.getByTestId('link-locked')).toBeVisible();
    await openerPage.getByTestId('unlock-password').fill('nope-nope');
    await openerPage.getByTestId('unlock-submit').click();
    await expect(openerPage.getByTestId('unlock-error')).toBeVisible();
    await openerPage.getByTestId('unlock-password').fill('e2e-password');
    await openerPage.getByTestId('unlock-submit').click();
    await expect(openerPage.getByTestId('stage')).toBeVisible();
    expect((await opener.request.get(pageSrc)).status()).toBe(200);
    // Still locked for everyone else.
    expect(await media()).toBe(403);

    await page.getByTestId('link-password-remove').click();
    await expect(page.getByText('Password (off)')).toBeVisible();
    expect(await media()).toBe(200);

    // Expired: an expiry in the past.
    await page.getByTestId('link-expiry').fill('2020-01-01');
    await expect(page.getByTestId('link-state')).toContainText('expired');
    expect(await media()).toBe(403);
    await closedHtml();
    const expiredHtml = await (await request.get(pagePath)).text();
    expect(expiredHtml).toContain('has expired');
    await page.getByRole('button', { name: 'No expiry' }).click();
    await expect(page.getByTestId('link-state')).toHaveCount(0);
    expect(await media()).toBe(200);

    // Revoked, including for the browser that already unlocked it.
    await page.getByTestId('revoke-link').click();
    await page.getByTestId('revoke-confirm').click();
    await expect(page.getByTestId('link-state')).toContainText('revoked');
    expect(await media()).toBe(403);
    expect((await opener.request.get(pageSrc)).status()).toBe(403);
    await closedHtml();
    const revokedHtml = await (await request.get(pagePath)).text();
    expect(revokedHtml).toContain('isn’t available');
    await page.keyboard.press('Escape');
    await opener.close();
  });
});
