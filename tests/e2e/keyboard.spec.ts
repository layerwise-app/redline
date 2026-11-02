import { expect, test } from '@playwright/test';
import { IMAGE, createReview, ready, shareUrl, signUp, uploadFirstFile } from './helpers';

test.setTimeout(120_000);

const selected = (page: import('@playwright/test').Page) =>
  page.locator('[data-testid=thread][data-selected=true]');

test('Shortcuts C, N, P, R, V and Esc work without a mouse', async ({ page }) => {
  await ready(page, '/try/reviews/review-skerry');
  await expect(page.getByTestId('stage')).toBeVisible();
  const threads = page.getByTestId('thread');

  // N and P walk the pins, and the pin and comment highlight each other.
  await page.keyboard.press('n');
  await expect(selected(page)).toHaveCount(1);
  const first = await selected(page).getAttribute('data-comment');
  await expect(page.locator(`[data-pin="${first}"]`)).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('n');
  const second = await selected(page).getAttribute('data-comment');
  expect(second).not.toBe(first);
  await page.keyboard.press('p');
  await expect(selected(page)).toHaveAttribute('data-comment', first!);

  // R resolves, which moves it out of the Open list.
  const openBefore = await threads.count();
  await page.keyboard.press('r');
  await expect(threads).toHaveCount(openBefore - 1);

  // V opens the version menu, Esc closes it.
  await page.keyboard.press('v');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  // Esc clears the selection.
  await page.keyboard.press('n');
  await expect(selected(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(selected(page)).toHaveCount(0);

  // C, then arrow keys and Enter, drops a pin.
  await page.keyboard.press('c');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const pending = page.getByTestId('pending-pin');
  await expect(pending).toHaveCount(1);
  await expect(page.getByTestId('new-pin-composer').getByRole('textbox')).toBeFocused();
  // The first Esc leaves the field, the second cancels the empty pin.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(pending).toHaveCount(0);
});

test('Dark canvas switches and persists', async ({ page }) => {
  await ready(page, '/try/reviews/review-skerry');
  await page.getByTestId('canvas-theme').click();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-theme', 'dark');
});

test('Cancelling the name prompt keeps a reply draft, and the name then sends it', async ({ browser }) => {
  const team = await signUp(browser, 'Keyboard Owner');
  const { page } = team;
  await ready(page, '/dashboard');
  await createReview(page, 'Draft test', 'Draft Client');
  await uploadFirstFile(page, IMAGE);
  const url = await shareUrl(page);
  await expect(page.getByTestId('share-dialog')).toBeHidden();

  const box = (await page.getByTestId('stage').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByTestId('new-pin-composer').getByRole('textbox').fill('Team opening note');
  await page.getByTestId('new-pin-composer').getByRole('button', { name: 'Comment' }).click();
  await expect(page.getByTestId('thread')).toHaveCount(1);

  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const guest = await guestContext.newPage();
  await ready(guest, new URL(url).pathname);
  const thread = guest.getByTestId('thread').first();
  await thread.getByRole('button').first().click();
  const reply = thread.getByRole('textbox', { name: 'Reply' });
  await reply.fill('A reply worth keeping');
  await thread.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(guest.locator('#guest-name')).toBeVisible();
  await guest.keyboard.press('Escape');
  await expect(guest.locator('#guest-name')).toHaveCount(0);
  await expect(reply).toHaveValue('A reply worth keeping');
  await expect(thread.getByRole('alert')).toContainText('Add your name');

  await thread.getByRole('button', { name: 'Reply', exact: true }).click();
  await guest.locator('#guest-name').fill('Draft Guest');
  await guest.getByRole('button', { name: 'Continue' }).click();
  await expect(thread.getByTestId('reply').filter({ hasText: 'A reply worth keeping' })).toHaveCount(1);
  await expect(reply).toHaveValue('');
  await guestContext.close();

  // Account deletion takes the workspace and its Storage files with it.
  await ready(page, '/dashboard/settings');
  await page.getByTestId('delete-account').click();
  await page.getByTestId('confirm-password').fill(team.password);
  const name = await page.getByTestId('confirm-text').count();
  if (name) await page.getByTestId('confirm-text').fill(await page.getByTestId('workspace-name').inputValue());
  await page.getByTestId('confirm-delete').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/dashboard'));
  await team.context.close();
});
