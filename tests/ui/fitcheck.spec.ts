import { expect, test } from '@playwright/test';
import {
  VARIANTS,
  canvasCard,
  elementId,
  expectAllFit,
  fontSizeOf,
  getTemplate,
  layer,
  loadSample,
  openApp,
  pasteCsv,
  preview,
  previewStatus,
  previewText,
  selectLayer,
  setField,
  waitForElement,
  selectOption,
  setChecked,
} from './helpers';

test.describe('Fit check – shortest / median / longest previews', () => {
  test('each preview is filled with the per-field extreme values', async ({ page }) => {
    await loadSample(page);
    expect(await previewText(page, 'shortest', 'Name')).toBe('Kai');
    expect(await previewText(page, 'median', 'Name')).toBe('Priya Raman');
    expect(await previewText(page, 'longest', 'Name')).toBe('Maximilian Alexander von Habsburg-Lothringen');

    expect(await previewText(page, 'shortest', 'Accommodation')).toBe('Tent 4');
    expect(await previewText(page, 'longest', 'Accommodation')).toBe('Lakeside Lodge – Ground Floor');

    // Fields are chosen independently: the longest card mixes people
    expect(await previewText(page, 'longest', 'Group')).toBe('Falcons');
    expect(await previewText(page, 'shortest', 'Group')).toBe('Bears');
  });

  test('the starter template fits all three variants', async ({ page }) => {
    await loadSample(page);
    await expectAllFit(page);
    for (const v of VARIANTS) await expect(preview(page, v)).not.toHaveClass(/has-overflow/);
  });

  test('shrink-to-fit reduces the font for long values and keeps it for short ones', async ({ page }) => {
    await loadSample(page);
    expect(await fontSizeOf(preview(page, 'shortest'), 'Name')).toBe(30);
    expect(await fontSizeOf(preview(page, 'median'), 'Name')).toBe(30);
    const longest = await fontSizeOf(preview(page, 'longest'), 'Name');
    expect(longest).toBeLessThan(30);
    expect(longest).toBeGreaterThanOrEqual(12);
  });

  test('the "which values" table lists shortest/median/longest per field', async ({ page }) => {
    await loadSample(page);
    await page.getByRole('button', { name: 'Which values are being used?' }).click();
    const row = page.locator('.preview-details tr', { hasText: 'Name' }).first();
    await expect(row).toContainText('Kai');
    await expect(row).toContainText('Priya Raman');
    await expect(row).toContainText('Maximilian');
  });

  test('clicking a preview switches the canvas to that variant', async ({ page }) => {
    await loadSample(page);
    await preview(page, 'longest').locator('.preview-stage').click();
    await expect(page.getByTestId('preview-source').locator('select')).toHaveValue('longest');
    await expect(canvasCard(page)).toContainText('Maximilian Alexander von Habsburg-Lothringen');
  });

  test('previews follow template edits live', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Camp title');
    await page.locator('#content-editor').fill('WINTER CAMP');
    for (const v of VARIANTS) await expect(preview(page, v)).toContainText('WINTER CAMP');
  });

  test('"Ignore empty cells" sits directly below the three preview cards and says what it affects', async ({ page }) => {
    await loadSample(page);
    const sw = page.getByTestId('ignore-empty');
    const input = page.getByRole('switch', { name: 'Ignore empty cells' });
    await expect(input).toBeChecked();

    // Below the cards, left-aligned with them, and not in the heading any more
    const strip = (await page.locator('.previews-strip').boundingBox())!;
    const box = (await sw.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(strip.y + strip.height);
    expect(box.y - (strip.y + strip.height)).toBeLessThan(24);
    expect(Math.abs(box.x - strip.x)).toBeLessThanOrEqual(1);
    expect(box.height).toBeLessThanOrEqual(24); // single line
    await expect(page.locator('.previews-head')).not.toContainText('Ignore empty cells');
    await expect(page.locator('.previews-options')).toContainText('Ignore empty cells');

    // The explanation names what it changes, including the canvas when it previews with these values
    const hint = page.getByTestId('ignore-empty-hint');
    await expect(hint).toContainText('Blank cells are skipped when choosing these values');
    await expect(hint).toContainText('also used by the canvas preview (median)');
    // switch and explanation share one line at desktop width
    const hintBox = (await hint.boundingBox())!;
    expect(hintBox.height).toBeLessThanOrEqual(20);
    expect(Math.abs(hintBox.y + hintBox.height / 2 - (box.y + box.height / 2))).toBeLessThan(4);
    await selectOption(page, page.getByTestId('preview-source').locator('select'), 'row:0');
    await expect(hint).not.toContainText('canvas');
    await sw.click();
    await expect(input).not.toBeChecked();
    await expect(hint).toContainText('Blank cells count as the shortest value');

    // Colours and keyboard
    await page.mouse.move(5, 5); // read colours without the hover tint
    const offColour = await sw.locator('.switch-track').evaluate((el) => getComputedStyle(el).backgroundColor);
    await input.focus();
    await page.keyboard.press('Space');
    await expect(input).toBeChecked();
    await expect(sw.locator('.switch-track')).not.toHaveCSS('background-color', offColour);
  });

  test('"Ignore empty cells" also changes the canvas when it previews with shortest values', async ({ page }) => {
    await openApp(page);
    await pasteCsv(page, 'Name,Accommodation,Group\nAda,,Red\nBob,Tent 4,Blue\nCy,Lodge 12,Green\n');
    await page.getByTestId('tab-design').click();
    await selectOption(page, page.getByTestId('preview-source').locator('select'), 'shortest');
    const id = await elementId(page, 'Accommodation');
    const canvasAccom = canvasCard(page).locator(`.el-text[data-id="${id}"]`);
    await expect(canvasAccom).toHaveText('Tent 4');
    await setChecked(page.getByRole('switch', { name: 'Ignore empty cells' }), false);
    await expect(canvasAccom).toHaveText('');
  });

  test('"Ignore empty cells" changes the shortest preview to an empty value', async ({ page }) => {
    await openApp(page);
    await pasteCsv(page, 'Name,Accommodation,Group\nAda,,Red\nBob,Tent 4,Blue\nCy,Lodge 12,Green\n');
    await page.getByTestId('tab-design').click();
    expect(await previewText(page, 'shortest', 'Accommodation')).toBe('Tent 4');
    await setChecked(page.locator('.previews').getByLabel('Ignore empty cells'), false);
    await expect.poll(() => previewText(page, 'shortest', 'Accommodation')).toBe('');
  });
});

test.describe('Fit check – overflow detection', () => {
  test('flags text that does not fit its box even at the minimum size', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Name');
    await setField(page, 'H', 6); // far too short for 30pt, min 12pt
    await expect(previewStatus(page, 'longest')).toHaveText(/Overflows: Name/);
    await expect(previewStatus(page, 'median')).toHaveText(/Overflows: Name/);
    await expect(preview(page, 'longest')).toHaveClass(/has-overflow/);
    await expect(page.getByTestId('selection-label')).toContainText('text overflows its box');
    await expect(layer(page, 'Name').getByTestId('layer-problem')).toBeVisible();
    const id = await elementId(page, 'Name');
    await expect(preview(page, 'longest').locator(`.el[data-id="${id}"]`)).toHaveAttribute('data-overflow', 'true');
    await expect(canvasCard(page).locator(`.el[data-id="${id}"]`)).toHaveAttribute('data-overflow', 'true');
  });

  test('lowering the minimum font size can make it fit again', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Name');
    await setField(page, 'H', 8); // two lines at the 12pt minimum no longer fit
    await expect(previewStatus(page, 'longest')).toHaveText(/Overflows: Name/);
    await setField(page, 'Min Shrinked Size', 5); // one line at ~9pt does
    await expect(previewStatus(page, 'longest')).toHaveText(/Everything fits/);
  });

  test('turning shrink-to-fit off makes long values overflow', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Name');
    await setChecked(page.getByLabel('Shrink to fit'), false);
    await expect(previewStatus(page, 'longest')).toHaveText(/Overflows: Name/);
    await expect(previewStatus(page, 'shortest')).toHaveText(/Everything fits/);
    expect(await fontSizeOf(preview(page, 'longest'), 'Name')).toBe(30);
  });

  test('turning wrapping off makes a long single line overflow', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Accommodation');
    await setChecked(page.getByLabel('Wrap lines'), false);
    await setField(page, 'Min Shrinked Size', 18); // "Lakeside Lodge – Ground Floor" at 18pt bold is wider than 86 mm
    await expect(previewStatus(page, 'longest')).toHaveText(/Overflows: Accommodation/);
    await expect(previewStatus(page, 'shortest')).toHaveText(/Everything fits/);
  });

  test('a problem is cleared again when the box is made big enough', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Name');
    await setField(page, 'H', 6);
    await expect(previewStatus(page, 'longest')).toHaveText(/Overflows/);
    await setField(page, 'H', 30);
    await expectAllFit(page);
    await expect(layer(page, 'Name').getByTestId('layer-problem')).toHaveCount(0);
  });
});

test.describe('Fit check – text cut off by the card edge (regression)', () => {
  // Bug: a text box moved partly or fully outside the card was clipped by the card
  // when printed, yet every preview reported "Everything fits" because only the
  // text's own box was measured.

  test('a text box pushed past the right edge is reported as cut off in every preview', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Name');
    await setField(page, 'X', 60); // 60 + 88 = 148 mm on a 100 mm card
    for (const v of VARIANTS) {
      await expect(previewStatus(page, v)).toHaveText(/Cut off by card edge: Name/);
      await expect(preview(page, v)).toHaveClass(/has-overflow/);
      await expect(previewStatus(page, v)).not.toHaveText(/Everything fits/);
    }
    await expect(page.getByTestId('selection-label')).toContainText('cut off by the card edge');
    await expect(page.getByTestId('selection')).toHaveClass(/overflow/);
    await expect(layer(page, 'Name').getByTestId('layer-problem')).toHaveAttribute('title', /cut off by the card edge/);
    const id = await elementId(page, 'Name');
    await expect(canvasCard(page).locator(`.el[data-id="${id}"]`)).toHaveAttribute('data-clipped', 'true');
    await expect(canvasCard(page).locator(`.el[data-id="${id}"]`)).not.toHaveAttribute('data-overflow', 'true');
  });

  test('a box flush with the card edge still fits', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Name');
    await setField(page, 'X', 12); // 12 + 88 = exactly 100
    await expectAllFit(page);
    await expect(page.getByTestId('selection-label')).not.toContainText('card edge');
    await setField(page, 'X', 0);
    await expectAllFit(page);
  });

  test('a slightly overhanging box only flags the variants whose text reaches the edge', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Name');
    await setField(page, 'X', 40); // box hangs 28 mm over; centred short names stay inside
    await expect(previewStatus(page, 'shortest')).toHaveText(/Everything fits/); // "Kai"
    await expect(previewStatus(page, 'median')).toHaveText(/Cut off by card edge: Name/);
    await expect(previewStatus(page, 'longest')).toHaveText(/Cut off by card edge: Name/);
  });

  test('a box that extends past the edge without clipping text gets an amber hint instead', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Name');
    await page.getByTitle('Left').click();
    await setField(page, 'X', 2);
    await setField(page, 'W', 120); // right edge at 122 mm, but left-aligned text starts at 3 mm
    await expect(previewStatus(page, 'shortest')).toHaveText(/Everything fits/);
    await expect(previewStatus(page, 'median')).toHaveText(/Everything fits/);
    await expect(page.getByTestId('selection')).toHaveClass(/outside/);
    await expect(page.getByTestId('selection-label')).toContainText('extends past the card edge');
  });

  test('negative positions are caught on the top and left edges', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Camp title'); // 20pt bold, vertically centred in a 22 mm box
    await setField(page, 'Y', -12); // box spans -12..10 → the centred text sits around -1 mm
    await expect(previewStatus(page, 'median')).toHaveText(/Cut off by card edge: Camp title/);
    await setField(page, 'Y', 6);
    await setField(page, 'X', -30);
    await expect(previewStatus(page, 'median')).toHaveText(/Cut off by card edge: Camp title/);
    await setField(page, 'X', 6);
    await expectAllFit(page);
  });

  test('the bottom edge is caught too', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Group'); // 14pt uppercase, box 88 × 16 at y = 122
    await setField(page, 'Y', 132); // box 132..148 on a 140 mm card, text centred around 140
    for (const v of VARIANTS) await expect(previewStatus(page, v)).toHaveText(/Cut off by card edge: Group/);
  });

  test('dragging an element off the card flags it, dragging back clears it', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Accommodation');
    const id = await elementId(page, 'Accommodation');
    const el = canvasCard(page).locator(`.el[data-id="${id}"]`);
    const box = (await el.boundingBox())!;
    // Drag far to the right, past the card's edge
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 220, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await waitForElement(page, 'Accommodation', (e) => e.x > 50);
    await expect(previewStatus(page, 'longest')).toHaveText(/Cut off by card edge: Accommodation/);
    await page.keyboard.press('Control+z');
    await waitForElement(page, 'Accommodation', (e) => e.x === 6);
    await expectAllFit(page);
  });

  test('shrinking the card around existing elements reports what no longer fits', async ({ page }) => {
    await loadSample(page);
    await setField(page, 'Width', 70); // the 88 mm wide Name box now overhangs by 24 mm
    await expect(previewStatus(page, 'longest')).toHaveText(/Cut off by card edge/);
    const t = await getTemplate(page);
    expect(t.card.width).toBe(70);
    await setField(page, 'Width', 100);
    await expectAllFit(page);
  });

  test('overflow and clipping are reported together when both apply', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Name');
    await setField(page, 'H', 6);
    await setField(page, 'X', 60);
    await expect(previewStatus(page, 'longest')).toHaveText(/Overflows: Name/);
    await expect(page.getByTestId('selection-label')).toContainText('overflows its box and is cut off by the card edge');
  });
});
