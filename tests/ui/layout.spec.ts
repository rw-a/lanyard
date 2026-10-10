import { expect, test, type Page } from '@playwright/test';
import { field, goTo, loadSample, openApp, setField } from './helpers';

/** Horizontal centre of the step tabs minus the centre of the window (px). */
async function tabsOffCentre(page: Page): Promise<number> {
  const box = (await page.getByTestId('steps').boundingBox())!;
  const vw = page.viewportSize()!.width;
  return box.x + box.width / 2 - vw / 2;
}

async function tabPositions(page: Page): Promise<number[]> {
  return page.locator('[data-testid^="tab-"]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left * 10) / 10));
}

test.describe('Top bar', () => {
  test('the Data / Design / Print tabs stay centred when the template name or size changes', async ({ page }) => {
    await loadSample(page);
    expect(Math.abs(await tabsOffCentre(page))).toBeLessThanOrEqual(1);
    const start = await tabPositions(page);

    // Template name: empty, short, very long
    for (const name of ['', 'X', 'Summer camp badges for the whole of the Lakeside site, version 7 (final, really final)']) {
      await page.locator('.canvas-area').click({ position: { x: 5, y: 5 } }); // show the Template section
      await field(page, 'Name').fill(name);
      await expect(page.getByTestId('topbar-info')).toContainText(name.slice(0, 10));
      expect(await tabPositions(page), `name "${name.slice(0, 20)}"`).toEqual(start);
    }

    // Card sizes with different digit counts
    for (const [w, h] of [
      [5, 5],
      [100, 140],
      [85.6, 54],
      [123.45, 187.65],
    ]) {
      await setField(page, 'Width', w);
      await setField(page, 'Height', h);
      await expect(page.getByTestId('topbar-info')).toContainText(`${w} × ${h} mm`);
      expect(await tabPositions(page), `size ${w}×${h}`).toEqual(start);
    }
  });

  test('a long template name is truncated instead of overlapping the tabs', async ({ page }) => {
    await loadSample(page);
    await page.locator('.canvas-area').click({ position: { x: 5, y: 5 } });
    const long = 'A remarkably long template name that keeps going and going far beyond any sensible width';
    await field(page, 'Name').fill(long);
    const tabs = (await page.getByTestId('steps').boundingBox())!;
    const info = (await page.getByTestId('topbar-info').boundingBox())!;
    expect(info.x).toBeGreaterThanOrEqual(tabs.x + tabs.width); // no overlap
    expect(info.x + info.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    const name = page.locator('.template-name');
    expect(await name.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true); // ellipsised
    await expect(name).toHaveAttribute('title', long); // full name on hover
    await expect(page.getByTestId('topbar-info')).toContainText('100 × 140 mm'); // size is never squeezed out
  });

  test('the tabs are centred on every tab and with or without data', async ({ page }) => {
    await openApp(page);
    expect(Math.abs(await tabsOffCentre(page))).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Load sample roster' }).click();
    for (const tab of ['data', 'design', 'print'] as const) {
      await goTo(page, tab);
      expect(Math.abs(await tabsOffCentre(page)), tab).toBeLessThanOrEqual(1);
    }
  });

  test('the tabs stay centred at narrower window widths', async ({ page }) => {
    await loadSample(page);
    for (const width of [1280, 1024, 900]) {
      await page.setViewportSize({ width, height: 800 });
      expect(Math.abs(await tabsOffCentre(page)), `${width}px`).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('Design panels', () => {
  test('left and right sections collapse independently and keep their controls', async ({ page }) => {
    await loadSample(page);
    const settings = page.locator('.side.left .section').filter({ has: page.getByRole('heading', { name: 'Card settings' }) });
    const files = page.locator('.side.right .section').filter({ has: page.getByRole('heading', { name: 'Template files' }) });
    const settingsToggle = settings.getByRole('button', { name: 'Card settings' });
    const filesToggle = files.getByRole('button', { name: 'Template files' });

    await settingsToggle.click();
    await expect(settingsToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(settings.getByText('Card size')).toBeHidden();
    await expect(files.getByRole('button', { name: 'Export JSON' })).toBeVisible();

    await filesToggle.click();
    await expect(files.getByRole('button', { name: 'Export JSON' })).toBeHidden();
    await settingsToggle.click();
    await expect(settings.getByText('Card size')).toBeVisible();
  });

  test('sidebar section titles stay on one line', async ({ page }) => {
    await loadSample(page);
    await page.setViewportSize({ width: 900, height: 800 });
    for (const title of ['Card settings', 'Template files', 'Pictures stored']) {
      const toggle = page.getByRole('button', { name: title, exact: true });
      const height = await toggle.evaluate((element) => element.getBoundingClientRect().height);
      expect(height, title).toBeLessThan(24);
    }
  });

  test('the editor and fit check divider supports drag and keyboard resizing', async ({ page }) => {
    await loadSample(page);
    const divider = page.getByRole('separator', { name: 'Resize card previews and template editor' });
    const previews = page.locator('.previews');
    const initial = (await previews.boundingBox())!.height;
    const box = (await divider.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 80, { steps: 5 });
    await page.mouse.up();
    const dragged = (await previews.boundingBox())!.height;
    expect(dragged).toBeGreaterThan(initial + 60);
    await divider.focus();
    await page.keyboard.press('ArrowDown');
    expect((await previews.boundingBox())!.height).toBeLessThan(dragged);
    await expect(divider).toHaveAttribute('aria-valuenow', String(Math.round((await previews.boundingBox())!.height)));
  });

  test('the divider is hidden when panels stack', async ({ page }) => {
    await loadSample(page);
    await page.setViewportSize({ width: 700, height: 900 });
    await expect(page.getByRole('separator', { name: 'Resize card previews and template editor' })).toBeHidden();
  });
});
