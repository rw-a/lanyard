import { expect, test } from '@playwright/test';
import {
  VARIANTS,
  addImageElement,
  canvasCard,
  canvasImage,
  field,
  getElement,
  getStoredTemplate,
  getTemplate,
  goTo,
  layer,
  loadSample,
  makePng,
  previewImage,
  ruleRow,
  selectLayer,
  selectOption,
} from './helpers';
import type { ImageElement } from '../../src/lib/types';
import { ASSET_PREFIX, imageUrl } from '../../src/lib/template';
import { formatBytes } from '../../src/lib/images';

const imageEl = async (page: import('@playwright/test').Page) => (await getElement(page, 'Image')) as ImageElement;

test.describe('Images – fixed picture', () => {
  test('an uploaded picture is shown on the canvas and in every preview; Remove clears it', async ({ page }) => {
    await loadSample(page);
    await addImageElement(page);
    await expect(canvasCard(page).getByTestId('image-placeholder')).toHaveText('Image');
    await expect(field(page, 'Picture source')).toHaveValue('fixed');

    const logo = await makePng(page, 'logo.png', '#ff0000');
    await page.getByTestId('image-upload').setInputFiles(logo);
    await expect(canvasImage(page)).toHaveAttribute('src', logo.dataUrl);
    for (const v of VARIANTS) await expect(previewImage(page, v)).toHaveAttribute('src', logo.dataUrl);
    await expect(page.locator('.side.right img.thumb')).toHaveAttribute('src', logo.dataUrl);

    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(canvasImage(page)).toHaveCount(0);
    await expect(canvasCard(page).getByTestId('image-placeholder')).toBeVisible();
    expect((await imageEl(page)).src).toBe('');
  });

  test('big pictures are scaled down before being stored', async ({ page }) => {
    await loadSample(page);
    await addImageElement(page);
    const huge = await makePng(page, 'banner.png', '#00ff00', 3000, 600);
    await page.getByTestId('image-upload').setInputFiles(huge);
    await expect(canvasImage(page)).toBeVisible();
    await expect.poll(() => canvasImage(page).evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBe(1200);
    expect(await canvasImage(page).evaluate((img) => (img as HTMLImageElement).naturalHeight)).toBe(240);
    const t = await getTemplate(page);
    const stored = imageUrl(t.assets, (await imageEl(page)).src);
    expect(stored.startsWith('data:image/png')).toBe(true); // PNG keeps transparency
    expect(stored.length).toBeLessThan(huge.dataUrl.length);
  });

  test('"Fit" and corner radius apply to the rendered image', async ({ page }) => {
    await loadSample(page);
    await addImageElement(page);
    await page.getByTestId('image-upload').setInputFiles(await makePng(page, 'a.png', '#123456'));
    await selectOption(page, field(page, 'Fit'), 'cover');
    await expect(canvasImage(page)).toHaveCSS('object-fit', 'cover');
    await page.locator('.side.right [data-field="Corner radius"] input').fill('5');
    await expect(canvasCard(page).locator('.el-image')).toHaveCSS('border-radius', /18\.89/); // 5 mm
  });
});

test.describe('Images – different picture per value of a field', () => {
  test('assigning pictures one value at a time', async ({ page }) => {
    await loadSample(page);
    await addImageElement(page);
    await selectOption(page, field(page, 'Picture source'), 'rule');
    // A column with a handful of distinct values is guessed; we want Group.
    await expect(field(page, 'Field')).toHaveValue(/Accommodation|Group|Role|Dietary/);
    await selectOption(page, field(page, 'Field'), 'Group');
    await expect(page.locator('[data-testid="image-rule-row"]')).toHaveCount(6);
    await expect(page.locator('[data-field^="Pictures"] .field-label')).toHaveText('Pictures (0 of 6 values)');
    // Nothing assigned yet → the canvas (median row, Otters) explains why it is empty
    await expect(canvasCard(page).getByTestId('image-placeholder')).toHaveText('No image for “Otters”');

    const bear = await makePng(page, 'bear.png', '#8b5a2b');
    await ruleRow(page, 'Bears').getByRole('button', { name: 'Upload' }).click();
    await page.getByTestId('value-upload').setInputFiles(bear);
    await expect(ruleRow(page, 'Bears').locator('img.thumb')).toHaveAttribute('src', bear.dataUrl);
    await expect(page.locator('[data-field^="Pictures"] .field-label')).toHaveText('Pictures (1 of 6 values)');
    await expect(ruleRow(page, 'Bears').getByRole('button', { name: 'Replace' })).toBeVisible();

    // Shortest preview is a Bear → picture; median (Otters) and longest (Falcons) have none yet
    await expect(previewImage(page, 'shortest')).toHaveAttribute('src', bear.dataUrl);
    await expect(previewImage(page, 'median')).toHaveCount(0);
    await expect(previewImage(page, 'longest')).toHaveCount(0);

    // The canvas follows the chosen preview row
    await selectOption(page, page.getByTestId('preview-source').locator('select'), 'shortest');
    await expect(canvasImage(page)).toHaveAttribute('src', bear.dataUrl);
    await selectOption(page, page.getByTestId('preview-source').locator('select'), 'row:0'); // Li Wu, Otters
    await expect(canvasCard(page).getByTestId('image-placeholder')).toHaveText('No image for “Otters”');

    const rule = (await imageEl(page)).imageRule!;
    expect(rule.column).toBe('Group');
    expect(Object.keys(rule.map)).toEqual(['Bears']);

    // Removing the picture again
    await ruleRow(page, 'Bears').getByTitle('Remove this picture').click();
    await expect(ruleRow(page, 'Bears').locator('img.thumb')).toHaveCount(0);
    await expect(previewImage(page, 'shortest')).toHaveCount(0);
  });

  test('a fallback picture covers every value without its own', async ({ page }) => {
    await loadSample(page);
    await addImageElement(page);
    await selectOption(page, field(page, 'Picture source'), 'rule');
    await selectOption(page, field(page, 'Field'), 'Group');
    const bear = await makePng(page, 'bear.png', '#8b5a2b');
    const generic = await makePng(page, 'generic.png', '#999999');
    await ruleRow(page, 'Bears').getByRole('button', { name: 'Upload' }).click();
    await page.getByTestId('value-upload').setInputFiles(bear);
    await page.getByTestId('fallback-upload').setInputFiles(generic);
    await expect(page.getByTestId('image-rule-fallback').locator('img.thumb')).toHaveAttribute('src', generic.dataUrl);

    await expect(previewImage(page, 'shortest')).toHaveAttribute('src', bear.dataUrl); // Bears
    await expect(previewImage(page, 'median')).toHaveAttribute('src', generic.dataUrl); // Otters → fallback
    await expect(previewImage(page, 'longest')).toHaveAttribute('src', generic.dataUrl); // Falcons → fallback
    await expect(canvasImage(page)).toHaveAttribute('src', generic.dataUrl);

    await page.getByTitle('Remove the fallback picture').click();
    await expect(previewImage(page, 'median')).toHaveCount(0);
    expect((await imageEl(page)).imageRule!.fallback).toBe('');
  });

  test('uploading many files at once matches them to values by name', async ({ page }) => {
    await loadSample(page);
    await addImageElement(page);
    await selectOption(page, field(page, 'Picture source'), 'rule');
    await selectOption(page, field(page, 'Field'), 'Group');

    const files = [
      await makePng(page, 'bears.png', '#8b5a2b'),
      await makePng(page, 'Otter.png', '#2563eb'), // singular matches the plural value
      await makePng(page, 'falcons (2).png', '#7c3aed'), // copy suffix ignored
      await makePng(page, 'WOLVES-64x64.png', '#475569'), // size suffix ignored, case-insensitive
      await makePng(page, 'camp-logo.png', '#10b981'), // no such value
    ];
    await page.getByTestId('bulk-upload').setInputFiles(files);

    await expect(page.getByTestId('bulk-report')).toHaveText(
      '4 of 5 files matched · no value named like: camp-logo.png · still without a picture: Eagles, Staff',
    );
    await expect(page.locator('[data-field^="Pictures"] .field-label')).toHaveText('Pictures (4 of 6 values)');
    await expect(ruleRow(page, 'Bears').locator('img.thumb')).toHaveAttribute('src', files[0].dataUrl);
    await expect(ruleRow(page, 'Otters').locator('img.thumb')).toHaveAttribute('src', files[1].dataUrl);
    await expect(ruleRow(page, 'Falcons').locator('img.thumb')).toHaveAttribute('src', files[2].dataUrl);
    await expect(ruleRow(page, 'Wolves').locator('img.thumb')).toHaveAttribute('src', files[3].dataUrl);
    await expect(ruleRow(page, 'Eagles').locator('img.thumb')).toHaveCount(0);

    // All three fit-check variants now show the right animal
    await expect(previewImage(page, 'shortest')).toHaveAttribute('src', files[0].dataUrl); // Bears
    await expect(previewImage(page, 'median')).toHaveAttribute('src', files[1].dataUrl); // Otters
    await expect(previewImage(page, 'longest')).toHaveAttribute('src', files[2].dataUrl); // Falcons

    // A second bulk upload only adds / replaces, it does not drop existing pictures
    const eagle = await makePng(page, 'eagles.png', '#b45309');
    await page.getByTestId('bulk-upload').setInputFiles([eagle]);
    await expect(page.getByTestId('bulk-report')).toHaveText('1 of 1 file matched · still without a picture: Staff');
    await expect(ruleRow(page, 'Bears').locator('img.thumb')).toHaveAttribute('src', files[0].dataUrl);

    await page.getByRole('button', { name: 'Clear all', exact: true }).click();
    await expect(page.locator('[data-field^="Pictures"] .field-label')).toHaveText('Pictures (0 of 6 values)');
    await expect(page.locator('[data-testid="image-rule-row"] img.thumb')).toHaveCount(0);
  });

  test('changing the field re-keys the rule; "same picture" switches the rule off', async ({ page }) => {
    await loadSample(page);
    await addImageElement(page);
    await selectOption(page, field(page, 'Picture source'), 'rule');
    await selectOption(page, field(page, 'Field'), 'Group');
    await page.getByTestId('bulk-upload').setInputFiles([await makePng(page, 'bears.png', '#8b5a2b')]);
    await expect(page.locator('[data-field^="Pictures"] .field-label')).toHaveText('Pictures (1 of 6 values)');

    await selectOption(page, field(page, 'Field'), 'Accommodation');
    await expect(page.locator('[data-testid="image-rule-row"]')).toHaveCount(9);
    await expect(page.locator('[data-field^="Pictures"] .field-label')).toHaveText('Pictures (0 of 9 values)');
    expect((await imageEl(page)).imageRule!.column).toBe('Accommodation');

    await selectOption(page, field(page, 'Picture source'), 'fixed');
    expect((await imageEl(page)).imageRule).toBeNull();
    await expect(page.getByTestId('image-upload')).toBeAttached();
    await expect(canvasCard(page).getByTestId('image-placeholder')).toHaveText('Image');
  });

  test('the rule column counts as a used field on the Data tab', async ({ page }) => {
    await loadSample(page);
    await addImageElement(page);
    await selectOption(page, field(page, 'Picture source'), 'rule');
    await selectOption(page, field(page, 'Field'), 'Dietary');
    await goTo(page, 'data');
    await expect(page.locator('.chip', { hasText: 'Dietary' })).toHaveCount(1);
  });

  test('print sheets give every person their own picture', async ({ page }) => {
    await loadSample(page);
    await addImageElement(page);
    await selectOption(page, field(page, 'Picture source'), 'rule');
    await selectOption(page, field(page, 'Field'), 'Group');
    const bears = await makePng(page, 'bears.png', '#8b5a2b');
    const otters = await makePng(page, 'otters.png', '#2563eb');
    await page.getByTestId('bulk-upload').setInputFiles([bears, otters]);
    await expect(page.locator('[data-field^="Pictures"] .field-label')).toHaveText('Pictures (2 of 6 values)');

    await goTo(page, 'print');
    const cards = page.locator('.sheet-stage .sheet-card .card');
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0).locator('[data-testid="image"]')).toHaveAttribute('src', otters.dataUrl); // Li Wu – Otters
    await expect(cards.nth(1).locator('[data-testid="image"]')).toHaveCount(0); // Amara – Falcons, no picture, no placeholder in print
    await expect(cards.nth(2).locator('[data-testid="image"]')).toHaveAttribute('src', bears.dataUrl); // Sam Hill – Bears
    await expect(cards.nth(3).locator('[data-testid="image"]')).toHaveCount(0); // Maximilian – Eagles
  });

  test('the rule survives a reload', async ({ page }) => {
    await loadSample(page);
    await addImageElement(page);
    await selectOption(page, field(page, 'Picture source'), 'rule');
    await selectOption(page, field(page, 'Field'), 'Group');
    const bears = await makePng(page, 'bears.png', '#8b5a2b');
    await page.getByTestId('bulk-upload').setInputFiles([bears]);
    await expect(ruleRow(page, 'Bears').locator('img.thumb')).toBeVisible();

    await page.reload();
    await selectLayer(page, 'Image');
    await expect(field(page, 'Picture source')).toHaveValue('rule');
    await expect(field(page, 'Field')).toHaveValue('Group');
    await expect(ruleRow(page, 'Bears').locator('img.thumb')).toHaveAttribute('src', bears.dataUrl);
    await expect(previewImage(page, 'shortest')).toHaveAttribute('src', bears.dataUrl);
  });
});

test.describe('Images – URL from a field', () => {
  test('uses the cell text as the image address', async ({ page }) => {
    await loadSample(page);
    await addImageElement(page);
    await selectOption(page, field(page, 'Picture source'), 'column');
    await expect(field(page, 'Field with the image URL')).toHaveValue('Name');
    await selectOption(page, page.getByTestId('preview-source').locator('select'), 'row:4'); // Priya Raman
    await expect(canvasImage(page)).toHaveAttribute('src', 'Priya Raman'); // cell text used verbatim
    await selectOption(page, field(page, 'Field with the image URL'), 'Emergency contact');
    await expect(canvasImage(page)).toHaveAttribute('src', 'Ravi Raman 555-0105');
    expect((await imageEl(page)).srcColumn).toBe('Emergency contact');

    // Empty cells fall back to the placeholder in the editor
    await selectOption(page, field(page, 'Field with the image URL'), 'Dietary');
    await selectOption(page, page.getByTestId('preview-source').locator('select'), 'row:0'); // Li Wu has no dietary note
    await expect(canvasCard(page).getByTestId('image-placeholder')).toHaveText('No URL in Dietary');
  });
});

test.describe('Images – deduplicated storage', () => {
  const assetCount = async (page: import('@playwright/test').Page) => Object.keys((await getTemplate(page)).assets).length;

  test('the same picture assigned to several values is stored once', async ({ page }) => {
    await loadSample(page);
    await addImageElement(page);
    await selectOption(page, field(page, 'Picture source'), 'rule');
    await selectOption(page, field(page, 'Field'), 'Group');
    // Two files with different names but identical content, plus one different picture
    const bears = await makePng(page, 'bears.png', '#8b5a2b');
    const otters = await makePng(page, 'otters.png', '#8b5a2b');
    const falcons = await makePng(page, 'falcons.png', '#7c3aed');
    expect(bears.dataUrl).toBe(otters.dataUrl);
    await page.getByTestId('bulk-upload').setInputFiles([bears, otters, falcons]);
    await expect(page.locator('[data-field^="Pictures"] .field-label')).toHaveText('Pictures (3 of 6 values)');

    const rule = (await imageEl(page)).imageRule!;
    expect(rule.map.Bears).toBe(rule.map.Otters);
    expect(rule.map.Bears.startsWith(ASSET_PREFIX)).toBe(true);
    expect(rule.map.Falcons).not.toBe(rule.map.Bears);
    expect(await assetCount(page)).toBe(2);

    // Both previews still show the picture
    await expect(previewImage(page, 'shortest')).toHaveAttribute('src', bears.dataUrl); // Bears
    await expect(previewImage(page, 'median')).toHaveAttribute('src', bears.dataUrl); // Otters
    await expect(previewImage(page, 'longest')).toHaveAttribute('src', falcons.dataUrl);

    // The right panel lists each unique stored picture with its preview and size.
    await page.locator('.canvas-area').click({ position: { x: 5, y: 5 } });
    const stored = page.getByTestId('stored-picture');
    await expect(stored).toHaveCount(2);
    expect(await stored.locator('img').evaluateAll((images) => images.map((image) => (image as HTMLImageElement).src))).toEqual(
      expect.arrayContaining([bears.dataUrl, falcons.dataUrl]),
    );
    expect(await stored.locator('.stored-picture-size').allTextContents()).toEqual(
      expect.arrayContaining([formatBytes(bears.buffer.length), formatBytes(falcons.buffer.length)]),
    );
  });

  test('a picture used by two elements is stored once and freed when the last use goes', async ({ page }) => {
    await loadSample(page);
    const logo = await makePng(page, 'logo.png', '#ff0000');
    await addImageElement(page);
    await page.getByTestId('image-upload').setInputFiles(logo);
    await expect(canvasImage(page)).toHaveAttribute('src', logo.dataUrl);
    await page.keyboard.press('Control+d'); // duplicate the element → two users of the same picture
    await expect(page.locator('[data-testid="layer"]')).toHaveCount(9);
    expect(await assetCount(page)).toBe(1);
    const first = await getElement(page, 'Image');
    const second = await getElement(page, 'Image copy');
    expect((first as ImageElement).src).toBe((second as ImageElement).src);

    // Delete one user: the picture stays
    await page.keyboard.press('Delete'); // the copy is selected
    await expect(layer(page, 'Image copy')).toHaveCount(0);
    await expect.poll(() => assetCount(page)).toBe(1);
    await expect(canvasImage(page)).toHaveAttribute('src', logo.dataUrl);

    // Delete the last user: the picture is pruned at the next save
    await selectLayer(page, 'Image');
    await page.keyboard.press('Delete');
    await expect.poll(() => assetCount(page)).toBe(0);
    const stored = await getStoredTemplate(page);
    expect(Object.keys(stored.assets)).toHaveLength(0);

    // Undo brings the element and its picture back together
    await page.keyboard.press('Control+z');
    await expect(canvasImage(page)).toHaveAttribute('src', logo.dataUrl);
    await expect.poll(() => assetCount(page)).toBe(1);
  });

  test('"Remove" / "Clear all" free the pictures they drop', async ({ page }) => {
    await loadSample(page);
    await addImageElement(page);
    await selectOption(page, field(page, 'Picture source'), 'rule');
    await selectOption(page, field(page, 'Field'), 'Group');
    await page.getByTestId('bulk-upload').setInputFiles([await makePng(page, 'bears.png', '#8b5a2b'), await makePng(page, 'otters.png', '#2563eb')]);
    await expect.poll(() => assetCount(page)).toBe(2);
    await ruleRow(page, 'Bears').getByTitle('Remove this picture').click();
    await expect.poll(() => assetCount(page)).toBe(1);
    await page.getByRole('button', { name: 'Clear all', exact: true }).click();
    await expect.poll(() => assetCount(page)).toBe(0);
  });

  test('exported JSON holds each picture once; a legacy v1 export still imports', async ({ page }) => {
    await loadSample(page);
    const logo = await makePng(page, 'logo.png', '#00aa00');
    await addImageElement(page);
    await page.getByTestId('image-upload').setInputFiles(logo);
    await page.keyboard.press('Control+d');
    await page.keyboard.press('Escape');

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export JSON' }).click()]);
    const text = await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString());
    const payload = logo.dataUrl.split(',')[1];
    expect(text.split(payload).length - 1).toBe(1); // the picture's bytes appear exactly once
    const exported = JSON.parse(text);
    expect(exported.version).toBe(2);
    expect(Object.keys(exported.assets)).toHaveLength(1);

    // Build a version-1 template by hand: pictures inline, the same one twice
    const v1 = { ...exported, version: 1, assets: undefined, name: 'Old style' };
    v1.card.width = 86;
    for (const el of v1.elements) if (el.kind === 'image') el.src = logo.dataUrl;
    await page.locator('input[type=file][accept*="json"]').setInputFiles({
      name: 'old.lanyard.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(v1)),
    });
    await expect(page.getByTestId('topbar-info')).toHaveText('86 × 140 mm');
    await expect(canvasImage(page)).toHaveCount(2);
    await expect(canvasImage(page).first()).toHaveAttribute('src', logo.dataUrl);
    const t = await getTemplate(page);
    expect(t).not.toHaveProperty('name');
    expect(t.version).toBe(2);
    expect(Object.keys(t.assets)).toHaveLength(1);
    for (const el of t.elements) if (el.kind === 'image') expect(el.src.startsWith(ASSET_PREFIX)).toBe(true);
  });

  test('the card background is stored as a picture too', async ({ page }) => {
    await loadSample(page);
    const bg = await makePng(page, 'bg.png', '#eeeeee', 200, 280);
    await page.locator('[data-field="Background Image"] input[type=file]').setInputFiles(bg);
    await expect(canvasCard(page)).toHaveCSS('background-image', `url("${bg.dataUrl}")`);
    const t = await getTemplate(page);
    expect(t.card.bgImage!.startsWith(ASSET_PREFIX)).toBe(true);
    expect(Object.keys(t.assets)).toHaveLength(1);
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(canvasCard(page)).toHaveCSS('background-image', 'none');
    await expect.poll(async () => Object.keys((await getTemplate(page)).assets).length).toBe(0);
  });
});
