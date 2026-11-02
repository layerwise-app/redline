import { expect, test } from '@playwright/test';
import { IMAGE, createReview, deleteWorkspace, ready, shareUrl, signUp, uploadFirstFile } from './helpers';

test.setTimeout(120_000);

test('Workspace name, logo and accent show on the review page', async ({ browser }) => {
  const team = await signUp(browser, 'Brand Owner');
  const { page } = team;
  await ready(page, '/dashboard');
  await createReview(page, 'Brand test', 'Brand Client');
  await uploadFirstFile(page, IMAGE);
  const url = await shareUrl(page);

  await ready(page, '/dashboard/settings');
  await page.getByTestId('logo-input').setInputFiles(IMAGE);
  await expect(page.getByTestId('workspace-logo').locator('img').or(page.locator('img[data-testid=workspace-logo]'))).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('workspace-name').fill('Brand Studio');
  await page.getByTestId('workspace-accent').fill('#0B6E4F');
  await page.getByTestId('workspace-save').click();
  await expect(page.getByTestId('account-menu')).toContainText('Brand Studio');

  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const guest = await guestContext.newPage();
  await ready(guest, new URL(url).pathname);
  const brand = guest.getByTestId('workspace-brand');
  await expect(brand).toContainText('Brand Studio');
  const logo = brand.locator('img');
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

  const stage = (await guest.getByTestId('stage').boundingBox())!;
  await guest.mouse.click(stage.x + stage.width / 2, stage.y + stage.height / 2);
  await expect(guest.getByTestId('pending-pin')).toHaveCSS('background-color', 'rgb(11, 110, 79)');

  await guestContext.close();
  await deleteWorkspace(team);
});
