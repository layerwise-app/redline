import { expect, test, type Page } from '@playwright/test';

/**
 * Item 4: pins land on the same spot at different zooms and screen widths. Runs in
 * Try mode on a real mockup, measuring actual DOM positions in a real browser.
 */
const REVIEW = '/try/reviews/review-skerry';

/** Where the pin's tip is on the page image, as a 0-1 fraction of the image. */
async function tipOnImage(page: Page, pin: ReturnType<Page['locator']>) {
  const pinBox = (await pin.boundingBox())!;
  const image = (await page.getByTestId('stage').locator('img').boundingBox())!;
  return {
    // The tip is the bottom-left corner of the pin.
    x: (pinBox.x - image.x) / image.width,
    y: (pinBox.y + pinBox.height - image.y) / image.height
  };
}

const expectSameSpot = (
  actual: { x: number; y: number },
  expected: { x: number; y: number },
  image: { width: number; height: number }
) => {
  // Within a pixel of the design as displayed, however it's scaled.
  const tolerance = (px: number, size: number) => Math.max(1.5 / size, px);
  expect(Math.abs(actual.x - expected.x)).toBeLessThan(tolerance(0.002, image.width));
  expect(Math.abs(actual.y - expected.y)).toBeLessThan(tolerance(0.002, image.height));
};

const imageSize = async (page: Page) =>
  (await page.getByTestId('stage').locator('img').boundingBox())!;

test.describe('pins stay on the same spot', () => {
  test('at every zoom, and through pan', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(REVIEW);
    await expect(page.getByTestId('stage')).toBeVisible();
    const stage = (await page.getByTestId('stage').boundingBox())!;
    const target = { x: 0.3, y: 0.12 };
    await page.mouse.click(stage.x + stage.width * target.x, stage.y + stage.height * target.y);
    const pending = page.getByTestId('pending-pin');
    await expect(pending).toBeVisible();
    expectSameSpot(await tipOnImage(page, pending), target, await imageSize(page));

    // 100%, Fit, wheel in and out, and buttons.
    await page.getByTestId('zoom-100').click();
    expect(await page.getByTestId('zoom-level').textContent()).toBe('100%');
    expectSameSpot(await tipOnImage(page, pending), target, await imageSize(page));

    await page.getByTestId('zoom-fit').click();
    expectSameSpot(await tipOnImage(page, pending), target, await imageSize(page));

    const canvas = (await page.getByTestId('canvas').boundingBox())!;
    await page.mouse.move(canvas.x + 200, canvas.y + 200);
    await page.mouse.wheel(0, -500);
    await page.waitForTimeout(50);
    expectSameSpot(await tipOnImage(page, pending), target, await imageSize(page));
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(50);
    expectSameSpot(await tipOnImage(page, pending), target, await imageSize(page));

    // Space-drag pans the view and the pin together. Esc leaves the comment box
    // first, keeping the draft, since Space types a space while it has focus.
    await page.getByTestId('new-pin-composer').getByRole('textbox').fill('Pan with me');
    await page.keyboard.press('Escape');
    await expect(pending).toBeVisible();
    const before = (await pending.boundingBox())!;
    await page.keyboard.down('Space');
    await page.mouse.move(canvas.x + 400, canvas.y + 300);
    await page.mouse.down();
    await page.mouse.move(canvas.x + 300, canvas.y + 240, { steps: 3 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    const after = (await pending.boundingBox())!;
    expect(Math.round(after.x - before.x)).toBe(-100);
    expect(Math.round(after.y - before.y)).toBe(-60);
    expectSameSpot(await tipOnImage(page, pending), target, await imageSize(page));

    // Panning didn't drop a second pin or move this one.
    await expect(page.getByTestId('pending-pin')).toHaveCount(1);
  });

  test('across screen widths, for a saved pin', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(REVIEW);
    await expect(page.getByTestId('stage')).toBeVisible();
    const target = { x: 0.62, y: 0.08 };
    const stage = (await page.getByTestId('stage').boundingBox())!;
    await page.mouse.click(stage.x + stage.width * target.x, stage.y + stage.height * target.y);
    await page.getByTestId('new-pin-composer').getByRole('textbox').fill('Measured across widths');
    await page.getByTestId('new-pin-composer').getByRole('button', { name: 'Comment' }).click();

    const row = page.getByTestId('thread').filter({ hasText: 'Measured across widths' });
    await expect(row).toBeVisible();
    const id = await row.getAttribute('data-comment');
    const pin = page.locator(`[data-pin="${id}"]`);
    await expect(pin).toBeVisible();
    const stored = { x: Number(await pin.getAttribute('data-page-x')), y: Number(await pin.getAttribute('data-page-y')) };
    expect(stored.x).toBeCloseTo(target.x, 2);
    expect(stored.y).toBeCloseTo(target.y, 2);

    for (const [width, height] of [
      [1440, 900],
      [1024, 768],
      [768, 1024],
      [390, 844]
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.reload();
      await expect(page.getByTestId('stage')).toBeVisible();
      await expect(pin).toBeVisible();
      expectSameSpot(await tipOnImage(page, pin), stored, await imageSize(page));
    }
    await context.close();
  });

  test('tap on a phone drops a pin in the same page coordinates', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true
    });
    const page = await context.newPage();
    await page.goto(REVIEW);
    const stage = page.getByTestId('stage');
    await expect(stage).toBeVisible();
    const box = (await stage.boundingBox())!;
    const target = { x: 0.5, y: 0.2 };
    await page.touchscreen.tap(box.x + box.width * target.x, box.y + box.height * target.y);
    const pending = page.getByTestId('pending-pin');
    await expect(pending).toBeVisible();
    await expect(page.getByTestId('bottom-sheet')).toBeVisible();
    expectSameSpot(await tipOnImage(page, pending), target, await imageSize(page));
    await context.close();
  });
});
