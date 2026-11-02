import { expect, test, type Page } from '@playwright/test';
import {
  addFile,
  clickOnPage,
  createReview,
  deleteWorkspace,
  dropPin,
  IMAGE,
  PDF,
  ready,
  signUp,
  uploadFirstFile,
} from './helpers';

/**
 * Item 6: the whole client flow against the running app. Local preview captures
 * every email in Email → Local and sends nothing real.
 */
const CLIENT = 'flow-client@example.test';
const GUEST_EMAIL = 'flow-guest@example.test';
const shots = process.env.E2E_SHOTS ? '.tmp/shots' : null;

async function shot(page: Page, name: string) {
  if (!shots) return;
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${shots}/${name}.png` });
}

test('the full flow from upload to approval', async ({ browser }) => {
  test.setTimeout(420_000);
  const team = await signUp(browser, 'Tess Flowtest');
  const { page } = team;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // New accounts start empty, with a clear drop zone.
  await ready(page, '/dashboard');
  await expect(page.getByTestId('dropzone')).toBeVisible();
  await shot(page, 'real-dashboard-empty-d');

  // 1. A multi-page PDF and an image.
  const reviewId = await createReview(page, 'Flow test review', 'Flow Client Ltd');
  await expect(page.getByTestId('review-dropzone')).toBeVisible();
  await uploadFirstFile(page, PDF, 6);
  await addFile(page, IMAGE);
  await expect(page.getByTestId('asset-menu')).toContainText('sample-image');
  await page.getByTestId('asset-menu').click();
  await page.getByRole('menuitem', { name: 'brand-guidelines' }).click();
  await expect(page.getByTestId('page-indicator')).toHaveText('1/6');
  const pageImage = page.getByTestId('stage').locator('img');
  await expect.poll(() => pageImage.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(1000);
  // Pages render page by page: the next one is a different image.
  const firstSrc = await pageImage.getAttribute('src');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByTestId('page-indicator')).toHaveText('2/6');
  await expect(pageImage).not.toHaveAttribute('src', firstSrc!);
  await expect.poll(() => pageImage.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await shot(page, 'real-pdf-page-d');
  await page.getByRole('button', { name: 'Previous page' }).click();

  // 2. Email the link: save the address first, then send to the saved address.
  await page.getByTestId('share').click();
  const url = await page.getByTestId('share-url').inputValue();
  await page.getByTestId('recipient-input').fill(CLIENT);
  await page.getByTestId('recipient-save').click();
  const recipient = page.getByTestId('recipient').filter({ hasText: CLIENT });
  await expect(recipient).toContainText('Not sent yet');
  await recipient.getByTestId('recipient-send').click();
  await expect(recipient).toContainText('Sent');
  await expect(page.getByTestId('emails-left')).toContainText('49 of 50');
  await shot(page, 'real-share-d');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('share-dialog')).toBeHidden();

  // 3. Comment as a guest with an email.
  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const guest = await guestContext.newPage();
  await ready(guest, new URL(url).pathname);
  await expect(guest.getByTestId('review-screen')).toHaveAttribute('data-viewer', 'guest');
  await expect(guest.getByTestId('workspace-brand')).toContainText('Tess');
  await clickOnPage(guest, 0.4, 0.4);
  const composer = guest.getByTestId('new-pin-composer');
  await composer.getByRole('textbox').fill('Can the logo sit a little higher on this page?');
  await composer.getByRole('button', { name: 'Comment' }).click();
  await expect(guest.getByRole('dialog')).toBeVisible();
  await guest.locator('#guest-name').fill('Gia Client');
  await expect(guest.getByLabel('Email me when the team replies')).toBeVisible();
  await guest.getByLabel('Email me when the team replies').fill(GUEST_EMAIL);
  await guest.getByRole('button', { name: 'Continue' }).click();
  const guestThread = guest.getByTestId('thread').filter({ hasText: 'logo sit a little higher' });
  await expect(guestThread).toBeVisible();
  await expect(guestThread).toContainText('Gia Client');
  await shot(guest, 'real-guest-d');

  // The name stays in a signed, httpOnly cookie.
  const cookies = await guestContext.cookies();
  const identity = cookies.find((cookie) => cookie.name.startsWith('rl_guest_'));
  expect(identity?.httpOnly).toBe(true);
  await ready(guest, new URL(url).pathname);
  await expect(guest.getByText('As Gia Client')).toBeVisible();

  // A draft survives a reload until it's sent or cancelled.
  await clickOnPage(guest, 0.7, 0.7);
  await guest.getByTestId('new-pin-composer').getByRole('textbox').fill('Half-finished thought');
  await guest.waitForTimeout(200);
  await ready(guest, new URL(url).pathname);
  await expect(guest.getByTestId('new-pin-composer').getByRole('textbox')).toHaveValue('Half-finished thought');
  await expect(guest.getByTestId('pending-pin')).toBeVisible();
  await guest.getByTestId('new-pin-composer').getByRole('button', { name: 'Cancel' }).click();
  await expect(guest.getByTestId('pending-pin')).toHaveCount(0);

  // A guest edits their own comment.
  await guestThread.getByRole('button').first().click();
  await guestThread.getByRole('button', { name: 'Edit' }).click();
  await guestThread.getByRole('textbox', { name: 'Edit comment' }).fill('Can the logo sit a little higher on this page? See www.example.com/ref');
  await guestThread.getByRole('button', { name: 'Save' }).click();
  await expect(guestThread.getByRole('link')).toHaveAttribute('rel', 'nofollow noopener');

  // A guest's comment appears for the team through polling and in the Inbox.
  await ready(page, '/dashboard/inbox');
  const inboxItem = page.getByTestId('inbox-item').first();
  await expect(inboxItem).toHaveAttribute('data-unread', 'true');
  await expect(inboxItem).toContainText('Gia Client');
  await shot(page, 'real-inbox-d');
  await page.getByTestId('inbox-link').first().click();
  await page.waitForURL(/\/dashboard\/reviews\//);

  // 4. Reply as the team.
  const teamThread = page.getByTestId('thread').filter({ hasText: 'logo sit a little higher' });
  await expect(teamThread).toHaveAttribute('data-selected', 'true');
  await teamThread.getByRole('textbox', { name: 'Reply' }).fill('Yes, moved it up 24 px in the next version.');
  await teamThread.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(teamThread.getByTestId('reply').filter({ hasText: 'moved it up' })).toBeVisible();

  // 5. Reply internally: this emails no guest and stays out of their view.
  await teamThread.getByRole('textbox', { name: 'Reply' }).fill('INTERNAL-NOTE client asked for this twice already');
  await teamThread.getByRole('checkbox').click();
  await teamThread.getByRole('button', { name: 'Reply', exact: true }).click();
  const internalReply = teamThread.getByTestId('reply').filter({ hasText: 'INTERNAL-NOTE' });
  await expect(internalReply).toHaveAttribute('data-internal', 'true');
  await dropPin(page, 0.2, 0.2, 'INTERNAL-PIN margin check before we send this', { internal: true });
  await expect(page.getByTestId('thread').filter({ hasText: 'INTERNAL-PIN' })).toHaveAttribute('data-internal', 'true');
  await shot(page, 'real-team-canvas-d');

  // 6. Request changes, as the guest, who sees the reply but not the internal note.
  await guest.reload();
  await expect(guest.getByText('moved it up 24 px')).toHaveCount(0); // Collapsed until opened.
  await guest.getByTestId('thread').filter({ hasText: 'logo sit a little higher' }).getByRole('button').first().click();
  await expect(guest.getByText('moved it up 24 px')).toBeVisible();
  await expect(guest.getByText('INTERNAL')).toHaveCount(0);
  expect(await guest.content()).not.toContain('INTERNAL-NOTE');
  await guest.getByTestId('request-changes').click();
  await expect(guest.getByTestId('asset-status')).toContainText('Changes requested');
  await guest.getByTestId('send-feedback').click();
  await expect(guest.getByText(/The team has your/)).toBeVisible();

  // 7. Upload V2 and copy open comments forward.
  await page.reload();
  await page.waitForSelector('html[data-hydrated="true"]');
  await expect(page.getByTestId('asset-status')).toContainText('Changes requested');
  await page.getByTestId('upload-menu').click();
  await page.getByTestId('upload-new-version').click();
  await page.getByTestId('copy-open').click();
  await page.getByTestId('upload-dropzone-input').setInputFiles(PDF);
  await expect(page.getByTestId('upload-dialog')).toBeHidden({ timeout: 120_000 });
  await expect(page.getByTestId('version-menu')).toContainText('V2');
  await expect(page.getByTestId('asset-status')).toContainText('In review');
  await expect(page.getByText('From V1').first()).toBeVisible();
  await page.getByTestId('decision-history').locator('summary').click();
  await expect(page.getByTestId('decision-history')).toContainText('Changes requested by Gia Client');

  // No email went out for the upload itself. 8. Click Notify clients.
  await expect(page.getByTestId('notify-clients')).toBeVisible();
  await page.getByTestId('notify-clients').click();
  await expect(page.getByText(/Notified 1 client/)).toBeVisible();
  await expect(page.getByTestId('notify-clients')).toHaveCount(0);

  // Compare the two versions.
  await page.keyboard.press('v');
  await page.getByTestId('open-compare').click();
  await expect(page.getByTestId('compare')).toBeVisible();
  await expect(page.getByTestId('compare-top')).toHaveCSS('clip-path', /inset/);
  await page.getByTestId('compare-slider').fill('30');
  await shot(page, 'real-compare-slider-d');
  await page.getByRole('radio', { name: 'Side by side' }).click();
  await expect(page.getByTestId('compare-pane-1')).toBeVisible();
  await shot(page, 'real-compare-side-d');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('compare')).toHaveCount(0);

  // 9. Approve, as the guest, on the current version.
  await guest.reload();
  await guest.waitForSelector('html[data-hydrated="true"]');
  await expect(guest.getByTestId('version-menu')).toContainText('V2');
  await expect(guest.getByTestId('asset-status')).toContainText('In review');
  await guest.getByTestId('approve').click();
  await expect(guest.getByTestId('asset-status')).toContainText('Approved');

  // The review isn't Approved until the image is too.
  await ready(page, '/dashboard');
  await shot(page, 'real-dashboard-d');
  const row = page.getByTestId('review-row').filter({ hasText: 'Flow test review' });
  await expect(row).toContainText('In review');
  await guest.getByTestId('asset-menu').click();
  await guest.getByRole('menuitem', { name: 'sample-image' }).click();
  await guest.getByTestId('approve').click();
  await expect(guest.getByTestId('asset-status')).toContainText('Approved');
  await ready(page, '/dashboard');
  await expect(row).toContainText('Approved');

  // Settings shows real usage.
  await ready(page, '/dashboard/settings');
  await expect(page.getByTestId('storage')).toContainText('of 2 GB used');
  await shot(page, 'real-settings-d');

  // Phone views of the same pages.
  const state = await team.context.storageState();
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: state });
  const phonePage = await phone.newPage();
  await ready(phonePage, '/dashboard');
  await shot(phonePage, 'real-dashboard-m');
  await ready(phonePage, `/dashboard/reviews/${reviewId}`);
  await expect(phonePage.getByTestId('sheet-open')).toBeVisible();
  await shot(phonePage, 'real-team-canvas-m');
  await phonePage.getByTestId('sheet-open').tap();
  await expect(phonePage.getByTestId('bottom-sheet')).toBeVisible();
  await shot(phonePage, 'real-sheet-m');
  await phonePage.getByTestId('sheet-close').tap();
  await phonePage.getByTestId('version-menu').tap();
  await phonePage.getByTestId('open-compare').tap();
  await expect(phonePage.getByTestId('compare')).toBeVisible();
  // Both versions really load and decode on a phone.
  await phonePage.evaluate(() =>
    Promise.all([...document.querySelectorAll<HTMLImageElement>('[data-testid=compare] img')].map((image) => image.decode()))
  );
  await shot(phonePage, 'real-compare-m');
  await phonePage.getByRole('button', { name: 'Close compare' }).tap();
  await ready(phonePage, '/dashboard/inbox');
  await shot(phonePage, 'real-inbox-m');
  await ready(phonePage, '/dashboard/settings');
  await expect(phonePage.getByTestId('workspace-save')).toBeVisible();
  await shot(phonePage, 'real-settings-m');
  await phone.close();

  const guestPhone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const guestPage = await guestPhone.newPage();
  await ready(guestPage, new URL(url).pathname);
  await expect(guestPage.getByTestId('sheet-open')).toBeVisible();
  await shot(guestPage, 'real-guest-m');
  await guestPhone.close();

  expect(errors).toEqual([]);
  await guestContext.close();
  await deleteWorkspace(team);
});
