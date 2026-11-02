import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export const FIXTURES = join(import.meta.dirname, '../fixtures');
export const IMAGE = join(FIXTURES, 'sample-image.png');
export const PDF = join(FIXTURES, 'brand-guidelines.pdf');

const run = Date.now().toString(36);
let counter = 0;

/** Go to a page and wait until React has hydrated it. */
export async function ready(page: Page, path: string) {
  await page.goto(path);
  await page.waitForSelector('html[data-hydrated="true"]');
}

export type TestUser = {
  context: BrowserContext;
  page: Page;
  email: string;
  password: string;
  name: string;
};

/** A real account through the real sign-up endpoint, in its own browser context. */
export async function signUp(browser: Browser, name: string, viewport = { width: 1440, height: 900 }): Promise<TestUser> {
  counter += 1;
  const email = `e2e-${run}-${counter}@example.test`;
  const password = 'correct-horse-battery';
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const response = await context.request.post('/api/auth/sign-up/email', {
    data: { name, email, password },
    headers: { origin: new URL(page.url() === 'about:blank' ? 'http://127.0.0.1:58806' : page.url()).origin }
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return { context, page, email, password, name };
}

export async function createReview(page: Page, name: string, clientName: string) {
  await ready(page, '/dashboard');
  await page.getByTestId('new-review').or(page.getByTestId('new-review-empty')).first().click();
  await page.getByTestId('review-name').fill(name);
  await page.getByTestId('client-name').fill(clientName);
  await page.getByTestId('create-review').click();
  await page.waitForURL(/\/dashboard\/reviews\//);
  return page.url().split('/dashboard/reviews/')[1]!.split('?')[0]!;
}

/** Upload through the empty review's drop zone. */
export async function uploadFirstFile(page: Page, file: string, expectedPages = 1) {
  await page.getByTestId('review-dropzone-input').setInputFiles(file);
  await expect(page.getByTestId('canvas')).toBeVisible({ timeout: 90_000 });
  if (expectedPages > 1) {
    await expect(page.getByTestId('page-indicator')).toHaveText(`1/${expectedPages}`);
  }
}

export async function uploadNewVersion(page: Page, file: string, options: { copyOpen?: boolean } = {}) {
  await page.getByTestId('upload-menu').click();
  await page.getByTestId('upload-new-version').click();
  if (options.copyOpen) await page.getByTestId('copy-open').click();
  await page.getByTestId('upload-dropzone-input').setInputFiles(file);
  await expect(page.getByTestId('upload-dialog')).toBeHidden({ timeout: 90_000 });
}

export async function addFile(page: Page, file: string) {
  await page.getByTestId('upload-menu').click();
  await page.getByTestId('upload-add').click();
  await page.getByTestId('upload-dropzone-input').setInputFiles(file);
  await expect(page.getByTestId('upload-dialog')).toBeHidden({ timeout: 90_000 });
}

/** Click a page-relative spot on the design, so the test knows what it asked for. */
export async function clickOnPage(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('stage').boundingBox())!;
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
}

export async function dropPin(page: Page, x: number, y: number, body: string, options: { internal?: boolean } = {}) {
  await clickOnPage(page, x, y);
  await page.getByTestId('new-pin-composer').getByRole('textbox').fill(body);
  if (options.internal) {
    await page.getByTestId('new-pin-composer').getByRole('checkbox').click();
  }
  await page.getByTestId('new-pin-composer').getByRole('button', { name: 'Comment' }).click();
}

export const shareUrl = async (page: Page) => {
  await page.getByTestId('share').click();
  const url = await page.getByTestId('share-url').inputValue();
  await page.keyboard.press('Escape');
  return url;
};

/** Removes the test's review files from project Storage. */
export async function deleteWorkspace(user: TestUser) {
  const { page } = user;
  await ready(page, '/dashboard/settings');
  await page.getByTestId('delete-workspace').click();
  const name = await page.getByTestId('workspace-name').inputValue();
  await page.getByTestId('confirm-text').fill(name);
  await page.getByTestId('confirm-delete').click();
  await page.waitForURL(/\/dashboard$/);
  await user.context.close();
}

export const fileBytes = (path: string) => readFileSync(path);
