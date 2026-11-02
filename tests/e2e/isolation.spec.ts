import { expect, test } from '@playwright/test';
import { ready, createReview, deleteWorkspace, dropPin, IMAGE, shareUrl, signUp, uploadFirstFile, type TestUser } from './helpers';
import { BASE_URL } from './base-url';

/**
 * Item 2, over real HTTP with real sessions: a member of another workspace, and
 * nobody at all, against workspace A's pages, files, and invite links.
 */
test.describe.serial('workspace isolation over HTTP', () => {
  let alice: TestUser;
  let bob: TestUser;
  let reviewId: string;
  let pageId: string;
  let versionId: string;
  let token: string;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    alice = await signUp(browser, 'Alice E2E');
    bob = await signUp(browser, 'Bob E2E');
    reviewId = await createReview(alice.page, 'e2e secret review', 'e2e acme');
    await uploadFirstFile(alice.page, IMAGE);
    await dropPin(alice.page, 0.3, 0.3, 'e2e secret note');
    await expect(alice.page.getByTestId('thread')).toHaveCount(1);
    const src = (await alice.page.getByTestId('stage').locator('img').getAttribute('src'))!;
    pageId = src.split('/').pop()!;
    token = new URL(await shareUrl(alice.page)).pathname.split('/').pop()!;
    const download = (await alice.page.getByTestId('download').getAttribute('href'))!;
    versionId = download.split('/').pop()!;
  });

  test.afterAll(async () => {
    await deleteWorkspace(alice);
    await deleteWorkspace(bob);
  });

  test('the owner can reach their own media', async () => {
    expect((await alice.context.request.get(`/api/media/page/${pageId}`)).status()).toBe(200);
    expect((await alice.context.request.get(`/api/media/original/${versionId}`)).status()).toBe(200);
  });

  test('another member gets not found for its review page', async () => {
    await ready(bob.page, `/dashboard/reviews/${reviewId}`);
    await expect(bob.page.getByText('e2e secret review')).toHaveCount(0);
    await expect(bob.page.getByText('e2e secret note')).toHaveCount(0);
    await expect(bob.page.getByTestId('canvas')).toHaveCount(0);
    await ready(bob.page, '/dashboard');
    await expect(bob.page.getByText('e2e secret review')).toHaveCount(0);
  });

  test('another member gets 404 for its files', async () => {
    expect((await bob.context.request.get(`/api/media/page/${pageId}`)).status()).toBe(404);
    expect((await bob.context.request.get(`/api/media/original/${versionId}`)).status()).toBe(404);
  });

  test('someone signed out gets 401 for team media', async ({ request }) => {
    expect((await request.get(`/api/media/page/${pageId}`)).status()).toBe(401);
    expect((await request.get(`/api/media/original/${versionId}`)).status()).toBe(401);
  });

  test('another member can’t write a preview into its version', async () => {
    const response = await bob.context.request.post(`/api/uploads/preview?versionId=${versionId}&page=1`, {
      data: Buffer.from('RIFF0000WEBPVP8X'),
      headers: { origin: BASE_URL, 'content-type': 'image/webp' }
    });
    expect(response.status()).toBe(404);
  });

  test('another site can’t post with someone’s cookies', async () => {
    const response = await alice.context.request.post(`/api/uploads/logo?workspaceId=anything`, {
      data: Buffer.from('x'),
      headers: { origin: 'https://evil.example', 'content-type': 'image/png' }
    });
    expect(response.status()).toBe(403);
  });

  test('its review link gives a guest view only, never team data', async () => {
    const response = await bob.context.request.get(`/r/${token}`);
    const html = await response.text();
    expect(html).toContain('e2e secret note');
    expect(html).not.toContain('/api/media/');
    expect(html).not.toContain(alice.email);
  });

  test('an invite link can be seen by its holder, used once, and not re-used', async ({ browser }) => {
    const { page } = alice;
    await ready(page, '/dashboard/settings');
    await page.getByTestId('invite-link').click();
    const url = await page.getByTestId('invite-url').inputValue();
    const path = new URL(url).pathname;

    await ready(bob.page, path);
    await expect(bob.page.getByTestId('invite-valid')).toBeVisible();
    await bob.page.getByTestId('accept-invite').click();
    await bob.page.waitForURL(/\/dashboard$/);
    await ready(bob.page, '/dashboard/settings');
    await expect(bob.page.getByTestId('delete-workspace')).toHaveCount(0);

    // Bob, now a member of Alice's workspace, can reach its media.
    expect((await bob.context.request.get(`/api/media/page/${pageId}`)).status()).toBe(200);

    // It's spent for the next person.
    const carol = await signUp(browser, 'Carol E2E');
    await ready(carol.page, path);
    await expect(carol.page.getByTestId('invite-unavailable')).toBeVisible();
    await deleteWorkspace(carol);

    // After removal, access goes away at once.
    await ready(page, '/dashboard/settings');
    await page.getByTestId('member').filter({ hasText: 'Bob E2E' }).getByTestId('remove-member').click();
    await expect(page.getByTestId('member').filter({ hasText: 'Bob E2E' })).toHaveCount(0);
    expect((await bob.context.request.get(`/api/media/page/${pageId}`)).status()).toBe(404);
  });
});
