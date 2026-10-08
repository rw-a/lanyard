import { expect, test } from '@playwright/test';
import {
  canvasCard,
  canvasTexts,
  dragBy,
  elementId,
  field,
  getElement,
  getTemplate,
  goTo,
  layer,
  loadSample,
  mmToScreen,
  openApp,
  selectLayer,
  setField,
  waitForElement,
} from './helpers';

test.describe('Designer – canvas', () => {
  test('shows the starter template filled with median values', async ({ page }) => {
    await loadSample(page);
    await expect(page.getByTestId('preview-source').locator('select')).toHaveValue('median');
    const texts = await canvasTexts(page);
    expect(texts).toEqual(['SUMMER CAMP 2026', 'Priya Raman', 'ACCOMMODATION', 'Cabin 7', 'Otters']);
    await expect(page.locator('[data-testid="layer"]')).toHaveCount(7);
    await expect(page.locator('.topbar')).toContainText('100 × 140 mm');
  });

  test('without data the canvas shows field placeholders', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Go to Design' }).click();
    expect(await canvasTexts(page)).toEqual(['SUMMER CAMP 2026', '{Name}', 'ACCOMMODATION', '{Accommodation}', '{Group}']);
    await expect(page.locator('.previews')).toContainText('Load a CSV to see your layout');
  });

  test('preview source switches between shortest, median, longest and a specific row', async ({ page }) => {
    await loadSample(page);
    const select = page.getByTestId('preview-source').locator('select');
    await select.selectOption('shortest');
    expect((await canvasTexts(page))[1]).toBe('Kai');
    await select.selectOption('longest');
    expect((await canvasTexts(page))[1]).toBe('Maximilian Alexander von Habsburg-Lothringen');
    await select.selectOption('row:0');
    expect((await canvasTexts(page))[1]).toBe('Li Wu');
    // row options are labelled with the person's name
    await expect(select.locator('option[value="row:1"]')).toHaveText(/Amara Okafor-Blackwood/);
  });

  test('clicking an element selects it; clicking the stage deselects', async ({ page }) => {
    await loadSample(page);
    const id = await elementId(page, 'Name');
    await canvasCard(page).locator(`.el[data-id="${id}"]`).click();
    await expect(page.getByTestId('selection')).toBeVisible();
    await expect(page.getByTestId('selection-label')).toContainText('Name · 88.0 × 30.0 mm');
    await expect(page.locator('.side.right')).toContainText('Text box');
    await page.locator('.canvas-area').click({ position: { x: 5, y: 5 } });
    await expect(page.getByTestId('selection')).toBeHidden();
    await expect(page.locator('.side.left')).toContainText('Card settings');
    await expect(page.locator('.side.left')).toContainText('Card background');
    await expect(page.locator('.side.right')).toContainText('Template files');

    // clicking empty card space (not an element) also deselects
    await canvasCard(page).locator(`.el[data-id="${id}"]`).click();
    await expect(page.getByTestId('selection')).toBeVisible();
    await canvasCard(page).click({ position: { x: 4, y: 180 } }); // white area between Name and Accommodation
    await expect(page.getByTestId('selection')).toBeHidden();
  });

  test('dragging an element moves it by the right distance in mm', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Name');
    const before = await getElement(page, 'Name');
    const dx = await mmToScreen(page, 10);
    const dy = await mmToScreen(page, 6);
    const id = before.id;
    await dragBy(page, canvasCard(page).locator(`.el[data-id="${id}"]`), dx, dy);
    await waitForElement(page, 'Name', (el) => el.x === before.x + 10 && el.y === before.y + 6, 'moved by (10, 6) mm with snapping');
  });

  test('holding Alt disables snapping while dragging', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Name');
    const before = await getElement(page, 'Name');
    const dx = await mmToScreen(page, 2.5);
    const el = canvasCard(page).locator(`.el[data-id="${before.id}"]`);
    const box = (await el.boundingBox())!;
    await page.keyboard.down('Alt');
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 20 + dx, box.y + 20, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await waitForElement(page, 'Name', (e) => Math.abs(e.x - (before.x + 2.5)) < 0.15, 'moved by 2.5 mm without snapping');
  });

  test('resize handles change width/height; Shift keeps the aspect ratio', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Name');
    const before = await getElement(page, 'Name');
    const d = await mmToScreen(page, 10);
    await dragBy(page, page.locator('.handle.se'), -d, -d);
    await waitForElement(page, 'Name', (el) => el.w === before.w - 10 && el.h === before.h - 10 && el.x === before.x);

    // north-west handle moves the origin too
    const mid = await getElement(page, 'Name');
    await dragBy(page, page.locator('.handle.nw'), d, d);
    await waitForElement(page, 'Name', (el) => el.x === mid.x + 10 && el.y === mid.y + 10 && el.w === mid.w - 10 && el.h === mid.h - 10);

    // Shift + corner keeps ratio
    const pre = await getElement(page, 'Name');
    const ratio = pre.w / pre.h;
    const h = page.locator('.handle.se');
    const hb = (await h.boundingBox())!;
    await page.keyboard.down('Shift');
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 + d, hb.y + hb.height / 2 + 2, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    // height follows width / ratio, within the 1 mm snapping step
    await waitForElement(page, 'Name', (el) => el.w > pre.w && Math.abs(el.h - el.w / ratio) <= 0.5, 'aspect ratio kept');
  });

  test('elements cannot be shrunk below 2 mm', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Accommodation label'); // 88 × 8 mm
    const d = await mmToScreen(page, 40);
    await dragBy(page, page.locator('.handle.s'), 0, -d);
    await waitForElement(page, 'Accommodation label', (el) => el.h === 2);
  });

  test('locked elements cannot be dragged and show a dashed selection', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Name');
    const before = await getElement(page, 'Name');
    await layer(page, 'Name').getByTitle(/Lock/).click();
    await expect(page.getByTestId('selection')).toHaveClass(/locked/);
    await expect(page.locator('.handle')).toHaveCount(0);
    const d = await mmToScreen(page, 10);
    // pointer-events are off for locked elements, so this lands on the card and deselects instead of dragging
    const el = canvasCard(page).locator(`.el[data-id="${before.id}"]`);
    await dragBy(page, el, d, d).catch(() => undefined);
    await page.waitForTimeout(300);
    const after = await getElement(page, 'Name');
    expect([after.x, after.y]).toEqual([before.x, before.y]);
  });

  test('hiding a layer removes it from the card and the previews', async ({ page }) => {
    await loadSample(page);
    const id = await elementId(page, 'Camp title');
    await layer(page, 'Camp title').hover();
    await layer(page, 'Camp title').getByTitle('Hide').click();
    await expect(canvasCard(page).locator(`.el[data-id="${id}"]`)).toHaveCount(0);
    await expect(page.getByTestId('preview-median').locator(`.el[data-id="${id}"]`)).toHaveCount(0);
    await expect(layer(page, 'Camp title')).toHaveClass(/hidden/);
    await layer(page, 'Camp title').getByTitle('Show').click();
    await expect(canvasCard(page).locator(`.el[data-id="${id}"]`)).toHaveCount(1);
  });

  test('zoom buttons change the canvas scale and "fit" restores it', async ({ page }) => {
    await loadSample(page);
    const pct = page.locator('.toolbar .btn.tiny').filter({ hasText: /%$/ });
    const initial = parseInt((await pct.textContent())!, 10);
    await page.getByTitle('Zoom in').click();
    await page.getByTitle('Zoom in').click();
    await expect(pct).toHaveText(`${initial + 20}%`);
    const stage = page.getByTestId('canvas-stage');
    const w1 = (await stage.boundingBox())!.width;
    await page.getByTitle('Zoom out').click();
    const w2 = (await stage.boundingBox())!.width;
    expect(w2).toBeLessThan(w1);
    await pct.click(); // fit to view
    await expect(pct).toHaveText(`${initial}%`);
  });
});

test.describe('Designer – keyboard', () => {
  test('arrow keys nudge by 1 mm, Shift by 5 mm, Alt by 0.1 mm', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Name');
    const before = await getElement(page, 'Name');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await waitForElement(page, 'Name', (el) => el.x === before.x + 1 && el.y === before.y + 1);
    await page.keyboard.press('Shift+ArrowLeft');
    await waitForElement(page, 'Name', (el) => el.x === before.x - 4);
    await page.keyboard.press('Alt+ArrowUp');
    await waitForElement(page, 'Name', (el) => Math.abs(el.y - (before.y + 0.9)) < 1e-6);
  });

  test('Delete removes, Ctrl+D duplicates, Escape deselects', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Group');
    await page.keyboard.press('Control+d');
    await expect(page.locator('[data-testid="layer"]')).toHaveCount(8);
    await expect(layer(page, 'Group copy')).toHaveClass(/active/);
    const copy = await getElement(page, 'Group copy');
    const orig = await getElement(page, 'Group');
    expect(copy.x).toBe(orig.x + 3);
    expect(copy.y).toBe(orig.y + 3);
    await page.keyboard.press('Delete');
    await expect(page.locator('[data-testid="layer"]')).toHaveCount(7);
    await expect(layer(page, 'Group copy')).toHaveCount(0);
    await selectLayer(page, 'Group');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('selection')).toBeHidden();
  });

  test('undo / redo via keyboard and toolbar', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Name');
    const before = await getElement(page, 'Name');
    await page.keyboard.press('ArrowRight');
    await waitForElement(page, 'Name', (el) => el.x === before.x + 1);
    await page.keyboard.press('Control+z');
    await waitForElement(page, 'Name', (el) => el.x === before.x);
    await page.keyboard.press('Control+Shift+z');
    await waitForElement(page, 'Name', (el) => el.x === before.x + 1);
    await page.getByTitle(/^Undo/).click();
    await waitForElement(page, 'Name', (el) => el.x === before.x);
    await expect(page.getByTitle(/^Redo/)).toBeEnabled();
    await page.getByTitle(/^Redo/).click();
    await waitForElement(page, 'Name', (el) => el.x === before.x + 1);
  });

  test('shortcuts do not fire while typing in an input', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Name');
    const nameInput = field(page, 'Layer name');
    await nameInput.click();
    await nameInput.press('End');
    await nameInput.press('Backspace'); // must edit the text, not delete the element
    await expect(page.locator('[data-testid="layer"]')).toHaveCount(7);
    await waitForElement(page, 'Nam', (el) => el.kind === 'text');
  });
});

test.describe('Designer – layers panel', () => {
  test('lists elements top-most first and reorders with the arrows', async ({ page }) => {
    await loadSample(page);
    const names = () => page.locator('[data-testid="layer"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-name')));
    expect(await names()).toEqual(['Group', 'Group band', 'Accommodation', 'Accommodation label', 'Name', 'Camp title', 'Header band']);
    await layer(page, 'Name').hover();
    await layer(page, 'Name').getByTitle(/Move up/).click();
    expect(await names()).toEqual(['Group', 'Group band', 'Accommodation', 'Name', 'Accommodation label', 'Camp title', 'Header band']);
    const t = await getTemplate(page);
    expect(t.elements.map((e) => e.name).indexOf('Name')).toBeGreaterThan(t.elements.map((e) => e.name).indexOf('Accommodation label'));
  });

  test('adds a CSV field, static text, a shape and an image', async ({ page }) => {
    await loadSample(page);
    await page.locator('.add-grid select').selectOption('Role');
    await expect(layer(page, 'Role')).toHaveClass(/active/);
    expect((await getElement(page, 'Role')).kind).toBe('text');
    expect(await canvasTexts(page)).toContain('Camper'); // median Role

    await page.getByRole('button', { name: 'Add text' }).click();
    await expect(page.getByTestId('selection-label')).toContainText('Text');
    await page.getByRole('button', { name: 'Add shape' }).click();
    await expect(page.locator('.side.right')).toContainText('Shape');
    await page.getByRole('button', { name: 'Add image or logo' }).click();
    await expect(page.locator('.side.right')).toContainText('Image');
    await expect(canvasCard(page).locator('.image-placeholder')).toBeVisible();
    await expect(page.locator('[data-testid="layer"]')).toHaveCount(11);
  });

  test('hovering a layer never moves or resizes any row (no jiggle)', async ({ page }) => {
    await loadSample(page);
    const geometry = () =>
      page.locator('[data-testid="layer"]').evaluateAll((rows) =>
        rows.map((r) => {
          const box = r.getBoundingClientRect();
          const label = r.querySelector('.layer-label')!.getBoundingClientRect();
          return [box.top, box.height, label.left, label.width];
        }),
      );
    const before = await geometry();
    for (const name of ['Group', 'Accommodation label', 'Header band']) {
      await layer(page, name).hover();
      expect(await geometry()).toEqual(before);
    }
    await page.mouse.move(5, 5);
    expect(await geometry()).toEqual(before);
    // and selecting a row (which keeps its actions visible) does not move anything either
    await selectLayer(page, 'Name');
    expect(await geometry()).toEqual(before);
  });

  test('layer actions are borderless icon buttons with accessible names', async ({ page }) => {
    await loadSample(page);
    const row = layer(page, 'Name');
    const actions = row.locator('.layer-actions button');
    await expect(actions).toHaveCount(4);
    for (const b of await actions.all()) {
      await expect(b).toHaveClass(/icon-btn/);
      expect((await b.getAttribute('class'))!.split(/\s+/)).not.toContain('btn'); // not the bordered button style
      await expect(b).toHaveCSS('border-top-width', '0px');
      await expect(b).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(b.locator('svg')).toHaveCount(1);
      expect((await b.textContent())!.trim()).toBe(''); // icon only, no emoji/text glyphs
    }
    await expect(row.getByRole('button', { name: 'Move Name up' })).toBeAttached();
    await expect(row.getByRole('button', { name: 'Move Name down' })).toBeAttached();

    // Hidden until the row is hovered, then visible
    await expect(row.locator('.layer-actions')).toHaveCSS('opacity', '0');
    await row.hover();
    await expect(row.locator('.layer-actions')).toHaveCSS('opacity', '1');
    await expect(row.getByRole('button', { name: 'Move Name up' })).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await row.getByRole('button', { name: 'Move Name up' }).hover();
    await expect(row.getByRole('button', { name: 'Move Name up' })).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

    // Lock / hide are toggle buttons: aria-pressed + a persistent marker when on
    const lock = row.getByRole('button', { name: 'Lock Name' });
    await expect(lock).toHaveAttribute('aria-pressed', 'false');
    await expect(row.locator('.layer-flags svg')).toHaveCount(0);
    await lock.click();
    await expect(row.getByRole('button', { name: 'Unlock Name' })).toHaveAttribute('aria-pressed', 'true');
    await row.getByRole('button', { name: 'Hide Name' }).click();
    await expect(row.getByRole('button', { name: 'Show Name' })).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(5, 5);
    await page.locator('.canvas-area').click({ position: { x: 5, y: 5 } }); // deselect
    await expect(row.locator('.layer-actions')).toHaveCSS('opacity', '0');
    await expect(row.locator('.layer-flags svg')).toHaveCount(2); // lock + hidden markers stay visible
  });

  test('clicking anywhere on a layer row outside the icons selects it', async ({ page }) => {
    await loadSample(page);
    const row = layer(page, 'Accommodation');
    const box = (await row.boundingBox())!;
    const firstIcon = (await row.locator('.icon-btn').first().boundingBox())!;
    // the gap between the name and the first icon, inside the overlay's fade area
    await page.mouse.click(firstIcon.x - 10, box.y + box.height / 2);
    await expect(row).toHaveClass(/active/);
    await page.locator('.canvas-area').click({ position: { x: 5, y: 5 } });
    await row.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await expect(row).toHaveClass(/active/);
  });

  test('keyboard focus on a layer action reveals the actions', async ({ page }) => {
    await loadSample(page);
    const row = layer(page, 'Group');
    await expect(row.locator('.layer-actions')).toHaveCSS('opacity', '0');
    await row.getByRole('button', { name: 'Move Group up' }).focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab'); // focus via keyboard so :focus-visible applies
    await expect(row.locator('.layer-actions')).toHaveCSS('opacity', '1');
    await expect(row.getByRole('button', { name: 'Move Group up' })).toBeFocused();
  });

  test('duplicate and delete buttons', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Header band');
    await page.getByRole('button', { name: 'Duplicate' }).click();
    await expect(layer(page, 'Header band copy')).toHaveCount(1);
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(layer(page, 'Header band copy')).toHaveCount(0);
  });
});

test.describe('Designer – inspector', () => {
  test('position and size fields update the element and the selection box', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Name');
    await setField(page, 'X', 10);
    await setField(page, 'Y', 50);
    await setField(page, 'W', 80);
    await setField(page, 'H', 20);
    await waitForElement(page, 'Name', (el) => el.x === 10 && el.y === 50 && el.w === 80 && el.h === 20);
    await expect(page.getByTestId('selection-label')).toContainText('80.0 × 20.0 mm');
  });

  test('centre and full-width buttons', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Name');
    await setField(page, 'W', 50);
    await page.getByRole('button', { name: 'Centre horizontally' }).click();
    await waitForElement(page, 'Name', (el) => el.x === 25);
    await page.getByRole('button', { name: 'Centre vertically' }).click();
    await waitForElement(page, 'Name', (el) => el.y === 55);
    await page.getByRole('button', { name: 'Full width' }).click();
    await waitForElement(page, 'Name', (el) => el.x === 0 && el.w === 100);
  });

  test('content textarea and "Insert field" change the rendered text', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Name');
    const ta = page.locator('#content-editor');
    await expect(ta).toHaveValue('{{Name}}');
    await ta.fill('Hello {{Name}}');
    await expect.poll(async () => (await canvasTexts(page))[1]).toBe('Hello Priya Raman');
    await page.locator('.side.right select', { hasText: 'Insert field…' }).selectOption('Group');
    await expect(ta).toHaveValue('Hello {{Name}}{{Group}}');
    await expect.poll(async () => (await canvasTexts(page))[1]).toBe('Hello Priya RamanOtters');
  });

  test('font controls apply to the canvas', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Accommodation');
    const id = await elementId(page, 'Accommodation');
    const inner = canvasCard(page).locator(`.el[data-id="${id}"] > div`);
    await expect(inner).toHaveCSS('font-weight', '700');
    await page.getByRole('button', { name: 'B', exact: true }).click();
    await expect(inner).toHaveCSS('font-weight', '400');
    await page.getByRole('button', { name: 'I', exact: true }).click();
    await expect(inner).toHaveCSS('font-style', 'italic');
    await page.getByRole('button', { name: 'AA', exact: true }).click();
    await expect(inner).toHaveCSS('text-transform', 'uppercase');
    await page.getByTitle('Left').click();
    await expect(inner).toHaveCSS('text-align', 'left');
    await setField(page, 'Size', 10);
    await expect(inner).toHaveCSS('font-size', /^13\.33/); // 10pt
    await field(page, 'Family').selectOption({ label: 'Georgia' });
    await expect(inner).toHaveCSS('font-family', /Georgia/);
  });

  test('"Shrink to fit" off disables the min size field', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Name');
    await expect(field(page, 'Min size')).toBeEnabled();
    await page.getByLabel('Shrink to fit').uncheck();
    await expect(field(page, 'Min size')).toBeDisabled();
  });

  test('colour by field assigns a distinct fill per value and renders it', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Group band');
    await field(page, 'Colour by field').selectOption('Group');
    const rows = page.locator('.color-rule-row');
    await expect(rows).toHaveCount(7); // 6 groups + "Anything else"
    const rule = (await getElement(page, 'Group band')) as { colorRule: { map: Record<string, string> } };
    const colours = Object.values(rule.colorRule.map);
    expect(new Set(colours).size).toBe(6);

    const id = await elementId(page, 'Group band');
    const band = canvasCard(page).locator(`.el[data-id="${id}"]`);
    const hex = rule.colorRule.map.Otters; // median preview row has Otters
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    await expect(band).toHaveCSS('background-color', `rgb(${r}, ${g}, ${b})`);

    // picking a different value changes the fill
    await page.getByTestId('preview-source').locator('select').selectOption('shortest'); // Bears
    const hex2 = rule.colorRule.map.Bears;
    const [r2, g2, b2] = [1, 3, 5].map((i) => parseInt(hex2.slice(i, i + 2), 16));
    await expect(band).toHaveCSS('background-color', `rgb(${r2}, ${g2}, ${b2})`);

    await field(page, 'Colour by field').selectOption('');
    await expect(rows).toHaveCount(0);
  });

  test('card size presets, custom size, swap orientation and background colour', async ({ page }) => {
    await loadSample(page);
    const settings = page.locator('.side.left section').filter({ has: page.getByRole('heading', { name: 'Card settings' }) });
    await expect(settings).toHaveCount(1);
    await expect(settings.getByRole('heading', { name: 'Card size' })).toBeVisible();
    await expect(settings.getByRole('heading', { name: 'Card background' })).toBeVisible();
    await expect(settings.locator('[data-field="Name"]')).toBeVisible();
    await expect(settings.locator('[data-field="Background image"]')).toBeVisible();
    await expect(page.locator('.side.right').getByRole('heading', { name: 'Card background' })).toHaveCount(0);
    const radiusBox = (await settings.locator('[data-field="Corner radius"]').boundingBox())!;
    const backgroundHeadingBox = (await settings.getByRole('heading', { name: 'Card background' }).boundingBox())!;
    expect(radiusBox.y + radiusBox.height).toBeLessThan(backgroundHeadingBox.y);
    const colourBox = (await settings.locator('[data-field="Colour"] input[type="color"]').boundingBox())!;
    const separator = settings.locator('.card-background-separator');
    await expect(separator).toHaveText('or');
    const separatorBox = (await separator.boundingBox())!;
    const uploadBox = (await settings.getByRole('button', { name: 'Upload…' }).boundingBox())!;
    expect(Math.abs(colourBox.y - uploadBox.y)).toBeLessThan(2);
    expect(separatorBox.x).toBeGreaterThan(colourBox.x + colourBox.width);
    expect(uploadBox.x).toBeGreaterThan(separatorBox.x + separatorBox.width);
    const widthBox = (await settings.locator('[data-field="Width"]').boundingBox())!;
    const heightBox = (await settings.locator('[data-field="Height"]').boundingBox())!;
    const swap = settings.getByRole('button', { name: 'Swap orientation' });
    const swapBox = (await swap.boundingBox())!;
    expect(Math.abs(widthBox.y - heightBox.y)).toBeLessThan(1);
    expect(Math.abs(widthBox.y + widthBox.height - swapBox.y - swapBox.height)).toBeLessThan(2);
    expect(swapBox.x).toBeGreaterThan(heightBox.x);
    await expect(swap).toHaveText('');
    await expect(page.locator('.side.left [data-field="Preset"]')).toBeVisible();
    await expect(page.locator('.side.right [data-field="Preset"]')).toHaveCount(0);
    await field(page, 'Preset').selectOption({ label: 'A7 (74 × 105)' });
    await expect(page.locator('.topbar')).toContainText('74 × 105 mm');
    await setField(page, 'Width', 90);
    await expect(field(page, 'Preset')).toHaveValue('custom');
    await page.getByRole('button', { name: 'Swap orientation' }).click();
    await expect(page.locator('.topbar')).toContainText('105 × 90 mm');
    const t = await getTemplate(page);
    expect([t.card.width, t.card.height]).toEqual([105, 90]);
    await field(page, 'Colour').fill('#ff0000');
    await expect(canvasCard(page)).toHaveCSS('background-color', 'rgb(255, 0, 0)');
    await page.setViewportSize({ width: 1000, height: 900 });
    const narrowHeightBox = (await settings.locator('[data-field="Height"]').boundingBox())!;
    const narrowSwapBox = (await swap.boundingBox())!;
    expect(narrowSwapBox.y).toBeGreaterThan(narrowHeightBox.y + narrowHeightBox.height);
    const narrowColourBox = (await settings.locator('[data-field="Colour"] input[type="color"]').boundingBox())!;
    const narrowSeparatorBox = (await separator.boundingBox())!;
    const narrowUploadBox = (await settings.getByRole('button', { name: 'Upload…' }).boundingBox())!;
    expect(Math.abs(narrowColourBox.y - narrowUploadBox.y)).toBeLessThan(2);
    expect(narrowSeparatorBox.x).toBeGreaterThan(narrowColourBox.x + narrowColourBox.width);
    expect(narrowUploadBox.x).toBeGreaterThan(narrowSeparatorBox.x + narrowSeparatorBox.width);
  });

  test('template name is reflected in the top bar; export downloads JSON', async ({ page }) => {
    await loadSample(page);
    await expect(page.locator('.side.left [data-field="Name"]')).toBeVisible();
    await expect(page.locator('.side.right [data-field="Name"]')).toHaveCount(0);
    await expect(page.locator('.side.right').getByRole('button', { name: 'Export JSON' })).toBeVisible();
    await field(page, 'Name').fill('Winter Camp');
    await expect(page.locator('.topbar')).toContainText('Winter Camp');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export JSON' }).click()]);
    expect(download.suggestedFilename()).toBe('Winter_Camp.lanyard.json');
    const text = await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString());
    const json = JSON.parse(text);
    expect(json.name).toBe('Winter Camp');
    expect(json.elements).toHaveLength(7);
  });

  test('import JSON replaces the template', async ({ page }) => {
    await loadSample(page);
    const t = await getTemplate(page);
    t.name = 'Imported';
    t.elements = t.elements.slice(0, 2);
    await page.locator('input[type=file][accept*="json"]').setInputFiles({
      name: 'x.lanyard.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(t)),
    });
    await expect(page.locator('.topbar')).toContainText('Imported');
    await expect(page.locator('[data-testid="layer"]')).toHaveCount(2);
  });

  test('reset to default asks for confirmation and rebinds to the CSV headers', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Name');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="layer"]')).toHaveCount(6);
    await page.getByRole('button', { name: 'Reset to default' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('[data-testid="layer"]')).toHaveCount(6);
    await page.getByRole('button', { name: 'Reset to default' }).click();
    await page.getByRole('button', { name: 'Really reset?' }).click();
    await expect(page.locator('[data-testid="layer"]')).toHaveCount(7);
    expect(await canvasTexts(page)).toContain('Priya Raman');
  });

  test('warns about fields missing from the CSV', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Group');
    await page.locator('#content-editor').fill('{{Tribe}}');
    await page.locator('.canvas-area').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('.side.right .notice.warn')).toContainText('{{Tribe}}');
  });

  test('is usable on a narrow viewport (panels stack)', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 1000 });
    await loadSample(page);
    await expect(canvasCard(page)).toBeVisible();
    await selectLayer(page, 'Name');
    await expect(page.locator('.side.right')).toBeVisible();
    await goTo(page, 'print');
    await expect(page.locator('.sheet').first()).toBeVisible();
  });
});
