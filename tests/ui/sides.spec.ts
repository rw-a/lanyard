import { expect, test, type Page } from '@playwright/test';
import {
  addImageElement,
  canvasCard,
  canvasImage,
  canvasTexts,
  design,
  editSide,
  elementId,
  field,
  getEditor,
  getElement,
  getStoredTemplate,
  getTemplate,
  goTo,
  layer,
  loadSample,
  makePng,
  preview,
  previewStatus,
  selectLayer,
  selectOption,
  setSides,
  storedGet,
  VARIANTS,
} from './helpers';
import type { ImageElement, Template, TextElement } from '../../src/lib/types';

const canvasSide = (page: Page) => page.getByTestId('canvas-side');
const layers = (page: Page) => page.locator('[data-testid="layer"]');

/** Click on empty canvas so the inspector shows the card settings again. */
async function deselect(page: Page) {
  await page.locator('.canvas-area').click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId('selection')).toHaveCount(0);
}

async function setContent(page: Page, layerName: string, text: string) {
  await selectLayer(page, layerName);
  await page.locator('#content-editor').fill(text);
  await deselect(page);
}

// ---------------------------------------------------------------------------
// Delayed uploads: hold FileReader reads until the test releases them
// ---------------------------------------------------------------------------
async function holdUploads(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __reads: ((() => void) | null)[] };
    w.__reads = [];
    const original = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (blob: Blob) {
      w.__reads.push(() => original.call(this, blob));
    };
  });
}
const heldReads = (page: Page) => page.evaluate(() => (window as unknown as { __reads: unknown[] }).__reads.filter(Boolean).length);
async function releaseRead(page: Page, index: number) {
  await page.evaluate((i) => {
    const w = window as unknown as { __reads: ((() => void) | null)[] };
    const run = w.__reads[i];
    w.__reads[i] = null;
    run?.();
  }, index);
}

test.describe('Sides: modes', () => {
  test('one-sided by default; same on both sides shows one Front & Back design', async ({ page }) => {
    await loadSample(page);
    await expect(canvasSide(page)).toHaveCount(0); // one-sided: no side named
    await expect(page.getByTestId('fit-check-title')).toHaveText('Fit Check');
    await expect(page.getByTestId('side-switcher')).toHaveCount(0);
    expect((await getTemplate(page)).sidedness).toBe('single');

    await setSides(page, 'same');
    await expect(canvasSide(page)).toHaveText('Front & Back');
    await expect(page.getByTestId('fit-check-title')).toHaveText('Fit Check — Front & Back');
    await expect(page.getByTestId('side-switcher')).toHaveCount(0);
    // Linked, not copied: there is still only one design
    expect((await getTemplate(page)).sides.back).toBeNull();
    await page.keyboard.press('Control+z');
    await expect(canvasSide(page)).toHaveCount(0); // one-sided: no side named
    expect((await getTemplate(page)).sidedness).toBe('single');
  });

  test('different sides start the back as a copy of the front with new ids, and open it', async ({ page }) => {
    await loadSample(page);
    const front = design(await getTemplate(page));
    await setSides(page, 'different');
    await expect(canvasSide(page)).toHaveText('Back');
    await expect(page.getByTestId('side-switcher')).toBeVisible();
    await expect(page.getByTestId('fit-check-title')).toHaveText('Fit Check — Back');
    const back = design(await getTemplate(page), 'back');
    expect(back.elements.map((e) => e.name)).toEqual(front.elements.map((e) => e.name));
    const frontIds = new Set(front.elements.map((e) => e.id));
    for (const el of back.elements) expect(frontIds.has(el.id)).toBe(false);
    // One undo step removes the mode change and the new back together
    await page.keyboard.press('Control+z');
    await expect(canvasSide(page)).toHaveCount(0); // one-sided: no side named
    expect(await getTemplate(page)).toMatchObject({ sidedness: 'single', sides: { back: null } });
  });

  test('editing the back leaves the front alone, and both survive a reload', async ({ page }) => {
    await loadSample(page);
    await setSides(page, 'different');
    await setContent(page, 'Camp title', 'BACK OF BADGE');
    await selectLayer(page, 'Group band');
    await page.keyboard.press('Delete');
    await expect(layers(page)).toHaveCount(6);
    expect(await canvasTexts(page)).toContain('BACK OF BADGE');

    await editSide(page, 'front');
    await expect(layers(page)).toHaveCount(7);
    expect(await canvasTexts(page)).toContain('SUMMER CAMP 2026');
    expect(await canvasTexts(page)).not.toContain('BACK OF BADGE');
    expect(await getEditor(page)).toEqual({ activeSide: 'front', selectedId: null });

    await editSide(page, 'back');
    expect(await canvasTexts(page)).toContain('BACK OF BADGE');

    const before = await getStoredTemplate(page);
    await expect.poll(async () => (await storedGet<Template>(page, 'template'))?.sides.back?.elements.length).toBe(6);
    await page.reload();
    await expect(canvasSide(page)).toHaveText('Front'); // reload opens the front
    const after = await getTemplate(page);
    expect(after.sides.back!.elements.map((e) => e.name)).not.toContain('Group band');
    expect(after.sidedness).toBe('different');
    expect(after.sides.front).toEqual(before.sides.front);
    await editSide(page, 'back');
    expect(await canvasTexts(page)).toContain('BACK OF BADGE');
  });

  for (const away of ['single', 'same'] as const) {
    test(`different → ${away} → different restores the exact saved back`, async ({ page }) => {
      await loadSample(page);
      await setSides(page, 'different');
      await setContent(page, 'Name', 'Back {{Name}}');
      await field(page, 'Background Colour').fill('#ffeeaa');
      const saved = design(await getTemplate(page), 'back');

      await setSides(page, away);
      if (away === 'same') await expect(canvasSide(page)).toHaveText('Front & Back');
      else await expect(canvasSide(page)).toHaveCount(0); // one-sided: no side named
      expect(await canvasTexts(page)).not.toContain('Back Priya Raman');
      expect((await getTemplate(page)).sides.back).toEqual(saved); // kept, untouched

      await setSides(page, 'different');
      await expect(canvasSide(page)).toHaveText('Back');
      expect(design(await getTemplate(page), 'back')).toEqual(saved);
      await expect(canvasCard(page)).toHaveCSS('background-color', 'rgb(255, 238, 170)');
    });
  }

  test('size is shared; background, text, layer order and locks belong to each side', async ({ page }) => {
    await loadSample(page);
    await setSides(page, 'different');
    await field(page, 'Background Colour').fill('#112233');
    await expect(page.getByTestId('background-heading')).toHaveText('Background — Back');
    await selectLayer(page, 'Name');
    await page.getByRole('button', { name: 'Lock Name', exact: true }).click();
    await layer(page, 'Name').getByRole('button', { name: 'Move Name down' }).click();
    await deselect(page);
    await page.locator('.side.left [data-field="Width"] input').fill('90');

    await editSide(page, 'front');
    await expect(canvasCard(page)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(canvasCard(page)).toHaveCSS('width', /^340\.\d+px$|^340px$/); // 90 mm at 96 dpi
    await expect(page.getByTestId('topbar-info')).toHaveText('90 × 140 mm');
    const t = await getTemplate(page);
    const frontName = t.sides.front.elements.find((e) => e.name === 'Name')!;
    const backName = t.sides.back!.elements.find((e) => e.name === 'Name')!;
    expect(frontName.locked).toBe(false);
    expect(backName.locked).toBe(true);
    expect(t.sides.front.elements.map((e) => e.name)).not.toEqual(t.sides.back!.elements.map((e) => e.name));
    expect(t.sides.front.bg).toBe('#ffffff');
    expect(t.sides.back!.bg).toBe('#112233');

    await expect(page.getByTestId('background-heading')).toHaveText('Background — Front');
    await editSide(page, 'back');
    await expect(canvasCard(page)).toHaveCSS('background-color', 'rgb(17, 34, 51)');
    // Only "different" names the side: one shared design needs no label
    await setSides(page, 'same');
    await expect(page.getByTestId('background-heading')).toHaveText('Background');
    await expect(page.getByTestId('topbar-info')).toHaveText('90 × 140 mm');
  });

  test('a shrunk card is checked on each editable side', async ({ page }) => {
    await loadSample(page);
    await setSides(page, 'different');
    await page.locator('.side.left [data-field="Width"] input').fill('60');
    for (const side of ['back', 'front'] as const) {
      if (side === 'front') await editSide(page, 'front');
      await expect(page.getByTestId('fit-check-title')).toHaveText(`Fit Check — ${side === 'front' ? 'Front' : 'Back'}`);
      await expect(previewStatus(page, 'longest')).toContainText('Cut off by card edge');
    }
  });

  test('Copy Front to Back and Clear Back confirm before replacing a back, and are undoable', async ({ page }) => {
    await loadSample(page);
    await expect(page.getByRole('button', { name: 'Copy Front to Back' })).toHaveCount(0);
    await setSides(page, 'different');
    await selectLayer(page, 'Group band');
    await page.keyboard.press('Delete');
    await expect(layers(page)).toHaveCount(6);

    await page.getByRole('button', { name: 'Copy Front to Back' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(layers(page)).toHaveCount(6);
    await page.getByRole('button', { name: 'Copy Front to Back' }).click();
    await page.getByRole('button', { name: 'Really replace the back?' }).click();
    await expect(layers(page)).toHaveCount(7);
    const copied = design(await getTemplate(page), 'back');
    const frontIds = new Set(design(await getTemplate(page)).elements.map((e) => e.id));
    expect(copied.elements.some((e) => frontIds.has(e.id))).toBe(false);

    await page.getByRole('button', { name: 'Clear Back' }).click();
    await page.getByRole('button', { name: 'Really clear the back?' }).click();
    await expect(layers(page)).toHaveCount(0);
    expect(design(await getTemplate(page), 'back')).toEqual({ bg: '#ffffff', bgImage: null, elements: [] });

    // An empty back is replaced without asking
    await page.getByRole('button', { name: 'Copy Front to Back' }).click();
    await expect(layers(page)).toHaveCount(7);

    await page.keyboard.press('Control+z');
    await expect(layers(page)).toHaveCount(0);
    await page.keyboard.press('Control+z');
    await expect(layers(page)).toHaveCount(7);
    await page.keyboard.press('Control+z');
    await expect(layers(page)).toHaveCount(6);
    await expect(canvasSide(page)).toHaveText('Back');
    // Only shown while editing the back
    await editSide(page, 'front');
    await expect(page.getByRole('button', { name: 'Clear Back' })).toHaveCount(0);
  });
});

test.describe('Sides: undo and redo', () => {
  test('undo and redo reveal the side whose content changed', async ({ page }) => {
    await loadSample(page);
    await setSides(page, 'different');
    await editSide(page, 'front');
    const x = (await getElement(page, 'Name')).x;
    await selectLayer(page, 'Name');
    await page.keyboard.press('ArrowRight'); // front edit
    await deselect(page);
    await editSide(page, 'back');

    await page.keyboard.press('Control+z');
    await expect(canvasSide(page)).toHaveText('Front');
    expect((await getElement(page, 'Name')).x).toBe(x);
    await editSide(page, 'back');
    await page.keyboard.press('Control+Shift+z');
    await expect(canvasSide(page)).toHaveText('Front'); // the redone change is also on the front
    expect((await getElement(page, 'Name')).x).toBe(x + 1);

    // Now a back edit, viewed from the front
    await editSide(page, 'back');
    await selectLayer(page, 'Group');
    await page.keyboard.press('ArrowDown');
    await editSide(page, 'front');
    const backY = (await getElement(page, 'Group', 'back')).y;
    await page.keyboard.press('Control+z');
    await expect(canvasSide(page)).toHaveText('Back');
    expect((await getElement(page, 'Group', 'back')).y).toBe(backY - 1);
    // Undoing past the mode change lands on a one-sided front
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await expect(canvasSide(page)).toHaveCount(0); // one-sided: no side named
    expect((await getTemplate(page)).sidedness).toBe('single');
    await page.keyboard.press('Control+Shift+z');
    await expect(canvasSide(page)).toHaveText('Front');
    expect((await getTemplate(page)).sidedness).toBe('different');
  });

  test('a shared size change is one undo step for both sides', async ({ page }) => {
    await loadSample(page);
    await setSides(page, 'different');
    await page.getByRole('button', { name: 'Swap orientation' }).click();
    await expect(page.getByTestId('topbar-info')).toHaveText('140 × 100 mm');
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('topbar-info')).toHaveText('100 × 140 mm');
    expect((await getTemplate(page)).sidedness).toBe('different');
  });
});

test.describe('Sides: interactions that span a switch', () => {
  test('switching sides mid-drag ends the drag on its own side', async ({ page }) => {
    await loadSample(page);
    await setSides(page, 'different');
    const backName = await getElement(page, 'Name', 'back');
    const frontName = await getElement(page, 'Name', 'front');
    const box = (await canvasCard(page).locator(`.el[data-id="${backName.id}"]`).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 4 });
    await expect.poll(async () => (await getElement(page, 'Name', 'back')).x).toBeGreaterThan(backName.x);
    const movedX = (await getElement(page, 'Name', 'back')).x;
    // Switch with the button still held
    await page.getByTestId('side-switcher').locator('label', { hasText: 'Front' }).evaluate((el) => (el as HTMLElement).click());
    await expect(canvasSide(page)).toHaveText('Front');
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40, { steps: 4 });
    await page.mouse.up();
    expect(await getElement(page, 'Name', 'front')).toEqual(frontName);
    expect((await getElement(page, 'Name', 'back')).x).toBe(movedX);
  });

  test('a slow upload lands on the side it was started from', async ({ page }) => {
    await loadSample(page);
    await setSides(page, 'different');
    await addImageElement(page);
    const imageId = await elementId(page, 'Image', 'back');
    await holdUploads(page);
    const logo = await makePng(page, 'logo.png', '#ff0000');
    await page.getByTestId('image-upload').setInputFiles(logo);
    await expect.poll(() => heldReads(page)).toBe(1);
    await editSide(page, 'front');
    await releaseRead(page, 0);
    await expect.poll(async () => ((await getElement(page, 'Image', 'back')) as ImageElement).src).toMatch(/^asset:/);
    const t = await getTemplate(page);
    expect(t.sides.front.elements.some((e) => e.kind === 'image')).toBe(false);
    expect(t.sides.back!.elements.find((e) => e.id === imageId)).toBeTruthy();
    await expect(canvasImage(page)).toHaveCount(0); // the front shows nothing new
    await editSide(page, 'back');
    await expect(canvasImage(page)).toHaveAttribute('src', logo.dataUrl);
  });

  test('a background upload still pending when the back is cleared is discarded', async ({ page }) => {
    await loadSample(page);
    await setSides(page, 'different');
    await holdUploads(page);
    await page.locator('[data-field="Background Image"] input[type=file]').setInputFiles(await makePng(page, 'bg.png', '#00ff00'));
    await expect.poll(() => heldReads(page)).toBe(1);
    await page.getByRole('button', { name: 'Clear Back' }).click();
    await page.getByRole('button', { name: 'Really clear the back?' }).click();
    await releaseRead(page, 0);
    await page.waitForTimeout(200);
    const t = await getTemplate(page);
    expect(t.sides.back).toEqual({ bg: '#ffffff', bgImage: null, elements: [] });
    expect(Object.keys(t.assets)).toHaveLength(0);
  });

  test('an upload still pending when undo restores the side is discarded', async ({ page }) => {
    await loadSample(page);
    await setSides(page, 'different');
    await addImageElement(page);
    await holdUploads(page);
    await page.getByTestId('image-upload').setInputFiles(await makePng(page, 'late.png', '#0000ff'));
    await expect.poll(() => heldReads(page)).toBe(1);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+z'); // removes the image layer again
    await expect(layer(page, 'Image')).toHaveCount(0);
    await releaseRead(page, 0);
    await page.waitForTimeout(200);
    const t = await getTemplate(page);
    expect(t.sides.back!.elements.some((e) => e.kind === 'image')).toBe(false);
    expect(Object.keys(t.assets)).toHaveLength(0);
  });

  test('of two uploads to the same picture finishing in reverse order, the latest choice wins', async ({ page }) => {
    await loadSample(page);
    await addImageElement(page);
    await holdUploads(page);
    const first = await makePng(page, 'first.png', '#111111');
    const second = await makePng(page, 'second.png', '#eeeeee');
    await page.getByTestId('image-upload').setInputFiles(first);
    await expect.poll(() => heldReads(page)).toBe(1);
    await page.getByTestId('image-upload').setInputFiles(second);
    await expect.poll(() => heldReads(page)).toBe(2);
    await releaseRead(page, 1); // the second choice finishes first…
    await expect(canvasImage(page)).toHaveAttribute('src', second.dataUrl);
    await releaseRead(page, 0); // …and the stale first one must not replace it
    await page.waitForTimeout(200);
    await expect(canvasImage(page)).toHaveAttribute('src', second.dataUrl);
    await page.evaluate(() => window.lanyardMaker.flushPersist());
    expect(Object.values((await getTemplate(page)).assets)).toEqual([second.dataUrl]);
  });

  test('an upload finishing after a template import is discarded', async ({ page }) => {
    await loadSample(page);
    await addImageElement(page);
    const exported = await getTemplate(page);
    await holdUploads(page);
    await page.getByTestId('image-upload').setInputFiles(await makePng(page, 'late.png', '#abcdef'));
    await expect.poll(() => heldReads(page)).toBe(1);
    await page.keyboard.press('Escape');
    await page.locator('input[type=file][accept*="json"]').setInputFiles({ name: 'x.lanyard.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
    await expect(layer(page, 'Image')).toHaveCount(1);
    await releaseRead(page, 0);
    await page.waitForTimeout(200);
    expect(((await getElement(page, 'Image')) as ImageElement).src).toBe('');
  });
});

test.describe('Sides: fields and fit check', () => {
  test('back-only fields are filled in, counted as used, and only checked on the back', async ({ page }) => {
    await loadSample(page);
    await setSides(page, 'different');
    await setContent(page, 'Accommodation', '{{Dietary}}');
    await expect.poll(() => canvasTexts(page)).toContain('Vegetarian'); // the median Dietary value

    // The back's "Which values are being used?" table lists Dietary; the front's does not
    await page.getByRole('button', { name: 'Which values are being used?' }).click();
    await expect(page.locator('.preview-details')).toContainText('Dietary');
    await editSide(page, 'front');
    await page.getByRole('button', { name: 'Which values are being used?' }).click();
    await expect(page.locator('.preview-details')).not.toContainText('Dietary');

    // The Data tab counts it as used while the back is in use, not once it is only saved
    await goTo(page, 'data');
    await expect(page.locator('.used').filter({ hasText: 'Dietary' }).first()).toBeVisible();
    await goTo(page, 'design');
    await setSides(page, 'single');
    await goTo(page, 'data');
    await expect(page.locator('.used').filter({ hasText: 'Dietary' })).toHaveCount(0);
  });

  test('a missing field on an inactive back raises no warning', async ({ page }) => {
    await loadSample(page);
    await setSides(page, 'different');
    await setContent(page, 'Group', '{{Tribe}}');
    await expect(page.locator('.side.right .notice.warn')).toContainText('{{Tribe}}');
    await setSides(page, 'same');
    await expect(page.locator('.side.right .notice.warn')).toHaveCount(0);
  });

  test('fit problems belong to the side they were found on', async ({ page }) => {
    await loadSample(page);
    await setSides(page, 'different');
    await selectLayer(page, 'Name');
    await page.locator('[data-field="Min Shrinked Size"] input').fill('28');
    await deselect(page);
    await expect(previewStatus(page, 'longest')).toContainText('Overflows: Name');
    await editSide(page, 'front');
    for (const v of VARIANTS) await expect(previewStatus(page, v)).toHaveText(/Everything fits/);
    await editSide(page, 'back');
    await expect(previewStatus(page, 'longest')).toContainText('Overflows: Name');
    // Hiding the layer clears its warning
    await page.getByRole('button', { name: 'Hide Name', exact: true }).click();
    await expect(previewStatus(page, 'longest')).toHaveText(/Everything fits/);
  });

  test('"Preview with" row labels stay the same on a back without a Name layer', async ({ page }) => {
    await loadSample(page);
    await setSides(page, 'different');
    await page.getByRole('button', { name: 'Clear Back' }).click();
    await page.getByRole('button', { name: 'Really clear the back?' }).click();
    await page.getByTestId('preview-source').getByRole('combobox').click();
    await expect(page.getByRole('option', { name: 'Row 1 — Li Wu', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('Fit Check previews render the side being edited', async ({ page }) => {
    await loadSample(page);
    await setSides(page, 'different');
    await setContent(page, 'Camp title', 'BACK ONLY');
    for (const v of VARIANTS) await expect(preview(page, v)).toContainText('BACK ONLY');
    await editSide(page, 'front');
    for (const v of VARIANTS) await expect(preview(page, v)).not.toContainText('BACK ONLY');
  });
});

test.describe('Sides: files', () => {
  test('export/import keeps both designs, the mode, print method, copies and every picture', async ({ page }) => {
    await loadSample(page);
    await setSides(page, 'different');
    await addImageElement(page);
    const pic = await makePng(page, 'back.png', '#336699');
    await page.getByTestId('image-upload').setInputFiles(pic);
    await expect(canvasImage(page)).toHaveAttribute('src', pic.dataUrl);
    await deselect(page);
    await setSides(page, 'single'); // the picture now lives only on a saved, unused back
    await page.evaluate(() => window.lanyardMaker.flushPersist()); // saving prunes unused pictures…
    expect(Object.values((await getStoredTemplate(page)).assets)).toEqual([pic.dataUrl]); // …but not this one
    await goTo(page, 'print');
    await page.locator('[data-field="Copies of Each Badge"] input').fill('2');
    await goTo(page, 'design');
    await setSides(page, 'different');
    await goTo(page, 'print');
    await selectOption(page, field(page, 'Printing method'), 'duplex');
    await goTo(page, 'design');
    await setSides(page, 'single');

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export JSON' }).click()]);
    const json = JSON.parse(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString()));
    expect(json).toMatchObject({ version: 3, sidedness: 'single', page: { copies: 2, printMethod: 'duplex' } });
    expect(Object.values(json.assets)).toEqual([pic.dataUrl]); // a back-only picture is not pruned from the export
    expect(json.sides.back.elements.some((e: ImageElement) => e.kind === 'image')).toBe(true);

    await page.getByRole('button', { name: 'Reset to default' }).click();
    await page.getByRole('button', { name: 'Really reset?' }).click();
    expect((await getTemplate(page)).sides.back).toBeNull();
    await page.locator('input[type=file][accept*="json"]').setInputFiles({ name: 'x.lanyard.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(json)) });
    await expect.poll(async () => (await getTemplate(page)).sides.back).not.toBeNull();
    expect(await getTemplate(page)).toEqual(json);
    await setSides(page, 'different');
    await expect(canvasImage(page)).toHaveAttribute('src', pic.dataUrl);
    // …and after a save and reload
    await page.evaluate(() => window.lanyardMaker.flushPersist());
    await page.reload();
    await expect(canvasSide(page)).toHaveText('Front');
    const reloaded = await getTemplate(page);
    expect(reloaded.sides).toEqual(json.sides);
    expect(reloaded.assets).toEqual(json.assets);
  });

  test('an unreadable import changes nothing: design, selection and undo history stay', async ({ page }) => {
    await loadSample(page);
    await setSides(page, 'different');
    await selectLayer(page, 'Name');
    const before = await getTemplate(page);
    const editor = await getEditor(page);
    await page.keyboard.press('Escape');
    const messages: string[] = [];
    page.on('dialog', (d) => {
      messages.push(d.message());
      void d.dismiss();
    });
    const bad = [{ version: 3, sidedness: 'different', card: { width: 100, height: 140 }, sides: { front: { elements: [] }, back: null }, page: {} }, { version: 7 }];
    for (const [i, file] of bad.entries()) {
      await page.locator('input[type=file][accept*="json"]').setInputFiles({ name: `bad${i}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
      await expect.poll(() => messages.length).toBe(i + 1);
    }
    expect(messages[0]).toMatch(/Could not import template: .*back design/);
    expect(messages[1]).toMatch(/newer version/);
    expect(await getTemplate(page)).toEqual(before);
    expect((await getEditor(page)).activeSide).toBe(editor.activeSide);
    // History is intact: one undo removes the mode change
    await page.keyboard.press('Control+z');
    expect((await getTemplate(page)).sidedness).toBe('single');
  });
});

test.describe('Sides: keyboard', () => {
  test('the Sides menu and the Front/Back switcher work from the keyboard', async ({ page }) => {
    await loadSample(page);
    const trigger = page.locator('[data-field="Sides"]').getByRole('combobox');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox')).toBeVisible();
    const highlighted = page.locator('[role="option"][data-highlighted]');
    for (const label of ['Double-Sided — Same on Both Sides', 'Double-Sided — Different on Each Side']) {
      await page.keyboard.press('ArrowDown');
      await expect(highlighted).toHaveText(label);
    }
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await getTemplate(page)).sidedness).toBe('different');
    await expect(canvasSide(page)).toHaveText('Back');

    const back = page.getByTestId('side-switcher').getByRole('radio', { name: 'Back' });
    await back.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(canvasSide(page)).toHaveText('Front');
    await expect(page.getByTestId('side-switcher').getByRole('radio', { name: 'Front' })).toBeChecked();
    // Arrow keys on the switcher do not nudge a layer
    expect((await getEditor(page)).selectedId).toBeNull();
  });
});

test.describe('Sides: text on both faces', () => {
  test('editing the front in same mode changes the printed back too', async ({ page }) => {
    await loadSample(page);
    await setSides(page, 'same');
    await setContent(page, 'Camp title', 'ONE DESIGN');
    await goTo(page, 'print');
    const cards = page.locator('.sheet-stage .sheet-card');
    await expect(cards).toHaveCount(4);
    await expect(cards.filter({ has: page.locator('[data-side="back"]') })).toHaveCount(2);
    for (const c of await cards.all()) await expect(c).toContainText('ONE DESIGN');
    expect((await getTemplate(page)).sides.back).toBeNull();
    const name = (await getTemplate(page)).sides.front.elements.find((e) => e.name === 'Camp title') as TextElement;
    expect(name.content).toBe('ONE DESIGN');
  });
});
