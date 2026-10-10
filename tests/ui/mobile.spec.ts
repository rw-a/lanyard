import { expect, test, type CDPSession } from '@playwright/test';
import { canvasCard, field, getElement, getTemplate, goTo, loadSample, selectOption, setChecked, setSides, waitForElement } from './helpers';

test.use({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });

async function touchDrag(cdp: CDPSession, x: number, y: number, dx: number, dy: number) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + (dx * i) / 8, y: y + (dy * i) / 8, id: 1 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function expectNoOverflow(page: import('@playwright/test').Page, what: string) {
  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth > innerWidth,
    visible: [...document.querySelectorAll('body *')]
      .filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2)
      .filter((el) => getComputedStyle(el).overflowX === 'visible')
      .map((el) => `${el.tagName}.${el.className}`),
  }));
  expect(overflow, what).toEqual({ page: false, visible: [] });
}

test('the side switcher and duplex controls fit small screens and work by touch', async ({ page }) => {
  await loadSample(page);
  await setSides(page, 'different');
  await goTo(page, 'print');
  await selectOption(page, field(page, 'Printing method'), 'duplex');
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 667 });
    await goTo(page, 'design');
    await expect(page.getByTestId('side-switcher')).toBeInViewport();
    await expectNoOverflow(page, `${width}px design`);
    await page.getByTestId('side-switcher').locator('label', { hasText: 'Front' }).tap();
    await expect(page.getByTestId('canvas-side')).toHaveText('Front');
    await page.getByTestId('side-switcher').locator('label', { hasText: 'Back' }).tap();
    await expect(page.getByTestId('canvas-side')).toHaveText('Back');
    await goTo(page, 'print');
    await expectNoOverflow(page, `${width}px print`);
    await page.getByRole('radio', { name: 'Back' }).locator('..').tap();
    await expect(page.getByTestId('sheet-label')).toContainText('— Back');
  }
  expect((await getTemplate(page)).sidedness).toBe('different');
});

test('small screens keep every tab within the viewport', async ({ page }) => {
  await loadSample(page);
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 667 });
    for (const tab of ['data', 'design', 'print'] as const) {
      await page.getByTestId(`tab-${tab}`).click();
      const overflow = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth > innerWidth,
        visible: [...document.querySelectorAll('body *')]
          .filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2)
          .filter((el) => getComputedStyle(el).overflowX === 'visible')
          .map((el) => `${el.tagName}.${el.className}`),
      }));
      expect(overflow, `${width}px ${tab}`).toEqual({ page: false, visible: [] });
      await expect(page.getByTestId(`tab-${tab}`)).toBeInViewport();
    }
  }
});

test('touch moves and resizes a box; Drag to Pan pans the zoomed canvas', async ({ page }) => {
  await loadSample(page);
  const cdp = await page.context().newCDPSession(page);
  const before = await getElement(page, 'Name');
  const box = (await canvasCard(page).locator(`.el[data-id="${before.id}"]`).boundingBox())!;
  await touchDrag(cdp, box.x + box.width / 2, box.y + box.height / 2, 25, 15);
  await waitForElement(page, 'Name', (el) => el.x > before.x && el.y > before.y);
  await expect(page.getByTestId('selection')).toBeVisible();

  const moved = await getElement(page, 'Name');
  const handle = (await page.locator('.handle.s').boundingBox())!;
  await touchDrag(cdp, handle.x + handle.width / 2, handle.y + handle.height / 2, 0, -20);
  await waitForElement(page, 'Name', (el) => el.h < moved.h);

  for (let i = 0; i < 8; i++) await page.getByTitle('Zoom in').click();
  await setChecked(page.getByRole('checkbox', { name: 'Drag to Pan' }), true);
  await expect(page.getByRole('checkbox', { name: 'Drag to Pan' })).toBeChecked();
  const unchanged = await getElement(page, 'Name');
  const area = (await page.locator('.canvas-area').boundingBox())!;
  await touchDrag(cdp, area.x + area.width - 25, area.y + 300, -100, -60);
  await expect.poll(() => page.locator('.canvas-area').evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect.poll(() => page.locator('.canvas-area').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await getElement(page, 'Name')).toEqual(unchanged);
});
