import { expect, test } from '@playwright/test';
import { addImageElement, field, getTemplate, goTo, loadSample, openApp, selectLayer, setField, selectOption, setChecked, setSides } from './helpers';

async function openPrint(page: import('@playwright/test').Page) {
  await loadSample(page);
  await goTo(page, 'print');
  await expect(page.locator('.sheet').first()).toBeVisible();
}

const summary = (page: import('@playwright/test').Page) => page.getByTestId('print-summary');

test.describe('Print tab', () => {
  test('without data it points back to the Data tab', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'print');
    await expect(page.locator('.empty-state')).toContainText('Load a CSV first');
    await expect(page.getByRole('button', { name: /Print \/ Save as PDF/ })).toBeDisabled();
    await page.locator('.empty-state').getByRole('button', { name: 'Go to Data' }).click();
    await expect(page.getByTestId('tab-data')).toHaveAttribute('aria-selected', 'true');
  });

  test('lays 100 × 140 cards out 2 × 2 on A4 and paginates', async ({ page }) => {
    await openPrint(page);
    await expect(summary(page)).toContainText('25 people = 25 badges');
    await expect(summary(page)).toContainText('2 × 2 = 4 per sheet → 7 sheets');
    await expect(page.locator('.toolbar')).toContainText('Sheet 1 of 7');

    const sheet = page.locator('.sheet-stage .sheet');
    await expect(sheet.locator('.sheet-card')).toHaveCount(4);
    await expect(sheet.locator('.sheet-card .card').first()).toContainText('Li Wu');
    await expect(sheet.locator('.sheet-card .card').nth(3)).toContainText('Maximilian');

    // Cards are positioned at the computed offsets (5 mm margin, 0 gap, vertically centred)
    const positions = await sheet.locator('.sheet-card').evaluateAll((els) => els.map((e) => [(e as HTMLElement).style.left, (e as HTMLElement).style.top]));
    expect(positions).toEqual([
      ['5mm', '8.5mm'],
      ['105mm', '8.5mm'],
      ['5mm', '148.5mm'],
      ['105mm', '148.5mm'],
    ]);

    // Last page holds the remaining 1 card
    await page.getByRole('button', { name: 'Next sheet', exact: true }).click({ clickCount: 6 });
    await expect(page.locator('.toolbar')).toContainText('Sheet 7 of 7');
    await expect(sheet.locator('.sheet-card')).toHaveCount(1);
    await expect(sheet.locator('.sheet-card .card')).toContainText('Camp Director');
    await expect(page.getByRole('button', { name: 'Next sheet', exact: true })).toBeDisabled();
  });

  test('crop marks and outlines can be toggled', async ({ page }) => {
    await openPrint(page);
    const marks = page.locator('.sheet-stage .sheet-marks');
    await expect(marks.locator('line')).toHaveCount(16); // 4 x-positions × 2 + 4 y-positions × 2
    await expect(marks.locator('rect')).toHaveCount(0);
    await setChecked(page.getByLabel('Thin grey outline around each card'), true);
    await expect(marks.locator('rect')).toHaveCount(4);
    await setChecked(page.getByLabel('Crop marks in the margins'), false);
    await expect(marks.locator('line')).toHaveCount(0);
    await setChecked(page.getByLabel('Thin grey outline around each card'), false);
    await expect(page.locator('.sheet-stage .sheet-marks')).toHaveCount(0);
  });

  test('paper presets, custom size, landscape and margins change the layout', async ({ page }) => {
    await openPrint(page);
    await selectOption(page, field(page, 'Size'), 'A3');
    await expect(summary(page)).toContainText('2 × 2 = 4 per sheet'); // 287 wide → 2 cols; 410 tall → 2 rows
    await setChecked(page.getByLabel('Landscape'), true);
    await expect(summary(page)).toContainText('4 × 2 = 8 per sheet → 4 sheets'); // 410 × 287
    await setChecked(page.getByLabel('Landscape'), false);

    await selectOption(page, field(page, 'Size'), 'Letter');
    await expect(summary(page)).toContainText('2 × 1 = 2 per sheet'); // 269 mm tall → 1 row of 140
    await setField(page, 'Margin', 0);
    await expect(summary(page)).toContainText('2 × 1 = 2 per sheet'); // 279 still < 280
    await selectOption(page, field(page, 'Size'), 'A4');
    await setField(page, 'Margin', 5);

    await selectOption(page, field(page, 'Size'), 'custom');
    await setField(page, 'Width', 320);
    await setField(page, 'Height', 450);
    await expect(summary(page)).toContainText('3 × 3 = 9 per sheet → 3 sheets');
    const t = await getTemplate(page);
    expect(t.page).toMatchObject({ preset: 'custom', width: 320, height: 450 });
  });

  test('gaps reduce how many fit and are reflected in card positions', async ({ page }) => {
    await openPrint(page);
    await setField(page, 'Horizontal Gap', 10);
    await expect(summary(page)).toContainText('1 × 2 = 2 per sheet → 13 sheets');
    await setField(page, 'Horizontal Gap', 0);
    await setField(page, 'Vertical Gap', 4);
    await expect(summary(page)).toContainText('2 × 2 = 4 per sheet'); // 2 × 140 + 4 = 284 ≤ 287
    const tops = await page.locator('.sheet-stage .sheet-card').evaluateAll((els) => els.map((e) => (e as HTMLElement).style.top));
    expect(tops[0]).toBe(tops[1]);
    expect(parseFloat(tops[2]) - parseFloat(tops[0])).toBeCloseTo(144, 5);
  });

  test('warns when the card does not fit the paper and suggests the better orientation', async ({ page }) => {
    await openPrint(page);
    await setField(page, 'Margin', 45); // 120 mm printable width → still fits 1 card
    await expect(summary(page)).toContainText('1 × 1 = 1 per sheet');
    await setField(page, 'Margin', 60); // 90 mm printable width → nothing fits
    await expect(summary(page)).toContainText('does not fit on this paper');
    await expect(page.getByRole('button', { name: /Print \/ Save as PDF/ })).toBeDisabled();
    await expect(page.locator('.empty-state')).toContainText('adjust the paper settings');

    await setField(page, 'Margin', 5);
    await goTo(page, 'design');
    await setField(page, 'Width', 140);
    await setField(page, 'Height', 95);
    await goTo(page, 'print');
    await expect(summary(page)).toContainText('1 × 3 = 3 per sheet');
    await expect(summary(page)).toContainText('Landscape would fit 4 per sheet');
    await summary(page).getByRole('button', { name: 'Switch' }).click();
    await expect(page.getByLabel('Landscape')).toBeChecked();
    await expect(summary(page)).toContainText('2 × 2 = 4 per sheet');
  });

  test('copies and a row range change what is printed', async ({ page }) => {
    await openPrint(page);
    await setField(page, 'Copies of Each Badge', 2);
    await expect(summary(page)).toContainText('25 people × 2 copies = 50 badges');
    await expect(summary(page)).toContainText('→ 13 sheets');
    const names = await page.locator('.sheet-stage .sheet-card .card').evaluateAll((els) => els.map((e) => e.textContent));
    expect(names[0]).toBe(names[1]); // consecutive duplicates
    expect(names[2]).toBe(names[3]);

    await setField(page, 'Only these rows', '1-3, 25');
    await expect(summary(page)).toContainText('4 people × 2 copies = 8 badges');
    await expect(summary(page)).toContainText('→ 2 sheets');
    await setField(page, 'Copies of Each Badge', 1);
    await setField(page, 'Only these rows', '2');
    await expect(summary(page)).toContainText('1 person = 1 badge');
    await expect(page.locator('.sheet-stage .sheet-card .card')).toContainText('Amara Okafor-Blackwood');

    // Out-of-range and garbage are ignored; empty means everyone
    await setField(page, 'Only these rows', '99, abc');
    await expect(summary(page)).toContainText('0 people');
    await setField(page, 'Only these rows', '');
    await expect(summary(page)).toContainText('25 people = 25 badges');
  });

  test('"Back to design" returns to the Design tab', async ({ page }) => {
    await openPrint(page);
    await page.getByRole('button', { name: 'Back to design', exact: true }).click();
    await expect(page.getByTestId('tab-design')).toHaveAttribute('aria-selected', 'true');
  });

  test('printing mounts every sheet with an exact @page size', async ({ page }) => {
    await openPrint(page);
    await page.evaluate(() => {
      // Stub the dialog; the component still mounts the print portal.
      (window as unknown as { __printed: number }).__printed = 0;
      window.print = () => {
        (window as unknown as { __printed: number }).__printed += 1;
      };
    });
    await page.getByRole('button', { name: /Print \/ Save as PDF/ }).click();
    await expect(page.locator('.print-root .sheet')).toHaveCount(7);
    // (toHaveText ignores <style> elements, so read the CSS text directly)
    await expect.poll(() => page.locator('.print-root style').evaluate((s) => s.textContent)).toMatch(/@page \{ size: 210mm 297mm; margin: 0; \}/);
    await expect(page.locator('.print-root .sheet.last-sheet')).toHaveCount(1);
    await expect(page.locator('.print-root .sheet-card')).toHaveCount(25);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);

    // In print media only the portal is visible
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#root')).toBeHidden();
    await expect(page.locator('.print-root')).toBeVisible();
    await page.emulateMedia({ media: 'screen' });

    // and it is torn down afterwards
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(page.locator('.print-root')).toHaveCount(0);
  });

  test('the generated PDF has one page per sheet at the paper size', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'page.pdf is Chromium-only');
    await openPrint(page);
    await setField(page, 'Only these rows', '1-6'); // 6 cards → 2 sheets
    await page.evaluate(() => {
      window.print = () => undefined;
    });
    await page.getByRole('button', { name: /Print \/ Save as PDF/ }).click();
    await expect(page.locator('.print-root .sheet')).toHaveCount(2);
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const text = pdf.toString('latin1');
    const pages = text.match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pages).toHaveLength(2);
    // A4 in PDF points: 595 × 842 (allow rounding)
    const box = text.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
    expect(box).not.toBeNull();
    expect(parseFloat(box![1])).toBeCloseTo(595, -1);
    expect(parseFloat(box![2])).toBeCloseTo(842, -1);
  });
});

// ---------------------------------------------------------------------------
// Double-sided printing
// ---------------------------------------------------------------------------

/** A badge whose back reads differently from its front, so mix-ups and mirroring are detectable. */
async function openDoubleSided(page: import('@playwright/test').Page, method: 'cutouts' | 'duplex') {
  await loadSample(page);
  await setSides(page, 'different');
  await selectLayer(page, 'Camp title');
  await page.locator('#content-editor').fill('BACK ↗ {{Name}}');
  await page.locator('.canvas-area').click({ position: { x: 5, y: 5 } });
  await goTo(page, 'print');
  if (method === 'duplex') await selectOption(page, field(page, 'Printing method'), 'duplex');
  await expect(page.locator('.sheet-stage .sheet')).toBeVisible();
}

const sheetFaces = (page: import('@playwright/test').Page, root = '.sheet-stage') =>
  page.locator(`${root} .sheet-card`).evaluateAll((els) =>
    els.map((e) => {
      const el = e as HTMLElement;
      return { side: el.dataset.side, row: el.dataset.row, copy: el.dataset.copy, instance: el.dataset.instance, left: el.style.left, top: el.style.top, text: el.textContent };
    }),
  );

test.describe('Double-sided printing', () => {
  test('one-sided designs never show double-sided options and ignore a remembered duplex choice', async ({ page }) => {
    await openDoubleSided(page, 'duplex');
    await goTo(page, 'design');
    await setSides(page, 'single');
    await goTo(page, 'print');
    await expect(page.getByTestId('print-method')).toHaveCount(0);
    await expect(summary(page)).toContainText('2 × 2 = 4 per sheet → 7 sheets');
    await expect(summary(page)).not.toContainText('PDF pages');
    await expect(page.getByTestId('print-instructions')).toContainText('Print one-sided.');
    await expect(page.getByRole('button', { name: /Print Test Sheet/ })).toHaveCount(0);
    expect((await getTemplate(page)).page.printMethod).toBe('duplex'); // remembered for later
  });

  test('separate cutouts put each front beside its own back, upright, on the same sheet', async ({ page }) => {
    await openDoubleSided(page, 'cutouts');
    await expect(summary(page)).toContainText('25 people = 25 badges');
    await expect(summary(page)).toContainText('front and back = 50 printed faces');
    await expect(summary(page)).toContainText('2 × 2 = 4 per sheet (2 badges, front beside back) → 13 sheets');
    await expect(page.getByTestId('sheet-label')).toHaveText('Sheet 1 of 13');
    await expect(page.getByTestId('print-instructions')).toContainText('Print one-sided, then cut out each front and the back next to it.');
    const faces = await sheetFaces(page);
    expect(faces.map((f) => [f.side, f.row])).toEqual([
      ['front', '0'],
      ['back', '0'],
      ['front', '1'],
      ['back', '1'],
    ]);
    expect(faces[0].text).toContain('SUMMER CAMP 2026');
    expect(faces[1].text).toContain('BACK ↗ Li Wu');
    expect(faces[3].text).toContain('BACK ↗ Amara Okafor-Blackwood');
    // Nothing is mirrored or rotated
    const transforms = await page.locator('.sheet-stage .sheet-card, .sheet-stage .sheet-card .card').evaluateAll((els) => els.map((e) => getComputedStyle(e).transform));
    expect(new Set(transforms)).toEqual(new Set(['none']));
    // Crop marks and outlines on every cutout sheet
    await expect(page.locator('.sheet-stage .sheet-marks line')).toHaveCount(16);
  });

  test('copies count complete badges, each with its own front and back', async ({ page }) => {
    await openDoubleSided(page, 'cutouts');
    await page.locator('[data-field="Copies of Each Badge"] input').fill('2');
    await setField(page, 'Only these rows', '3');
    await expect(summary(page)).toContainText('1 person × 2 copies = 2 badges');
    await expect(summary(page)).toContainText('4 printed faces');
    await expect(summary(page)).toContainText('→ 1 sheet');
    expect((await sheetFaces(page)).map((f) => `${f.row}.${f.copy}${f.side}`)).toEqual(['2.0front', '2.0back', '2.1front', '2.1back']);
  });

  test('duplex sheets: counts, Front/Back navigation and backs reflected across the page', async ({ page }) => {
    await openDoubleSided(page, 'duplex');
    await expect(summary(page)).toContainText('front and back = 50 printed faces');
    await expect(summary(page)).toContainText('2 × 2 = 4 per sheet → 7 sheets, both sides = 14 PDF pages');
    await expect(page.getByTestId('sheet-label')).toHaveText('Sheet 1 of 7 — Front');
    await expect(page.getByTestId('duplex-binding')).toHaveText('flip on long edge');
    const front = await sheetFaces(page);
    expect(front.map((f) => [f.side, f.row, f.left, f.top])).toEqual([
      ['front', '0', '5mm', '8.5mm'],
      ['front', '1', '105mm', '8.5mm'],
      ['front', '2', '5mm', '148.5mm'],
      ['front', '3', '105mm', '148.5mm'],
    ]);
    await page.getByRole('radio', { name: 'Back' }).locator('..').click();
    await expect(page.getByTestId('sheet-label')).toHaveText('Sheet 1 of 7 — Back');
    await expect(page.getByTestId('back-caption')).toContainText('as seen after turning it over');
    const back = await sheetFaces(page);
    // Each back sits where its own front is once the sheet is turned over left to right
    expect(back.map((f) => [f.side, f.row, f.left, f.top])).toEqual([
      ['back', '0', '105mm', '8.5mm'],
      ['back', '1', '5mm', '8.5mm'],
      ['back', '2', '105mm', '148.5mm'],
      ['back', '3', '5mm', '148.5mm'],
    ]);
    expect(back[0].text).toContain('BACK ↗ Li Wu');
    // Cutting guides on the front only
    await expect(page.locator('.sheet-stage .sheet-marks')).toHaveCount(0);

    // The last, partial sheet keeps its single back at the reflected position, not compacted
    await page.getByRole('button', { name: 'Next sheet', exact: true }).click({ clickCount: 6 });
    await expect(page.getByTestId('sheet-label')).toHaveText('Sheet 7 of 7 — Back');
    expect((await sheetFaces(page)).map((f) => [f.row, f.left, f.top])).toEqual([['24', '105mm', '8.5mm']]);

    // Landscape paper flips on the short edge
    await setChecked(page.getByLabel('Landscape'), true);
    await expect(page.getByTestId('duplex-binding')).toHaveText('flip on short edge');
  });

  test('the print run uses exactly the planned pages, in front/back order, matching the preview', async ({ page }) => {
    await openDoubleSided(page, 'duplex');
    await setField(page, 'Only these rows', '1-5'); // 2 sheets: 4 + 1 badges
    await page.evaluate(() => {
      (window as unknown as { __printed: number }).__printed = 0;
      window.print = () => {
        (window as unknown as { __printed: number }).__printed += 1;
      };
    });
    // Collect the preview of every sheet and face
    const preview: Awaited<ReturnType<typeof sheetFaces>>[] = [];
    for (let sheet = 0; sheet < 2; sheet++) {
      for (const side of ['Front', 'Back']) {
        await page.getByRole('radio', { name: side }).locator('..').click();
        await expect(page.getByTestId('sheet-label')).toHaveText(`Sheet ${sheet + 1} of 2 — ${side}`);
        preview.push(await sheetFaces(page));
      }
      if (sheet === 0) await page.getByRole('button', { name: 'Next sheet', exact: true }).click();
    }
    await page.getByRole('button', { name: /Print \/ Save as PDF/ }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
    const sheets = page.locator('.print-root .sheet');
    await expect(sheets).toHaveCount(4);
    expect(await sheets.evaluateAll((els) => els.map((e) => `${(e as HTMLElement).dataset.sheet}:${(e as HTMLElement).dataset.face}`))).toEqual([
      '0:front',
      '0:back',
      '1:front',
      '1:back',
    ]);
    for (let i = 0; i < 4; i++) {
      expect(await sheetFaces(page, `.print-root .sheet:nth-of-type(${i + 1})`)).toEqual(preview[i]);
    }
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(page.locator('.print-root')).toHaveCount(0);
  });

  test('the print run is a snapshot: edits made while preparing do not change it', async ({ page }) => {
    await openDoubleSided(page, 'cutouts');
    await setField(page, 'Only these rows', '1');
    await page.evaluate(() => {
      window.print = () => undefined;
    });
    await page.getByRole('button', { name: /Print \/ Save as PDF/ }).click();
    await expect(page.locator('.print-root .sheet')).toHaveCount(1);
    await setField(page, 'Only these rows', '1-8');
    await expect(page.locator('.print-root .sheet')).toHaveCount(1);
    await expect(page.locator('.print-root .sheet-card')).toHaveCount(2);
  });

  test('Print Test Sheet prints the selected sheet, front and back, and nothing else', async ({ page }) => {
    await openDoubleSided(page, 'duplex');
    await page.evaluate(() => {
      window.print = () => undefined;
    });
    await page.getByRole('button', { name: 'Next sheet', exact: true }).click();
    await page.getByRole('button', { name: 'Print Test Sheet (2)' }).click();
    const sheets = page.locator('.print-root .sheet');
    await expect(sheets).toHaveCount(2);
    expect(await sheets.evaluateAll((els) => els.map((e) => `${(e as HTMLElement).dataset.sheet}:${(e as HTMLElement).dataset.face}`))).toEqual(['1:front', '1:back']);
    expect(await page.locator('.print-root .sheet-card').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.row))).toEqual(['4', '5', '6', '7', '4', '5', '6', '7']);
    // Rows and copies are left alone
    await expect(summary(page)).toContainText('25 people = 25 badges');
  });

  test('duplex PDF: pages alternate front/back at the paper size, including a blank final back', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'page.pdf is Chromium-only');
    await openDoubleSided(page, 'duplex');
    // A completely blank back must still produce its pages so later pairs stay aligned
    await goTo(page, 'design');
    await page.getByRole('button', { name: 'Clear Back' }).click();
    await page.getByRole('button', { name: 'Really clear the back?' }).click();
    await goTo(page, 'print');
    await setField(page, 'Only these rows', '1-6'); // 2 physical sheets → 4 pages
    await page.evaluate(() => {
      window.print = () => undefined;
    });
    await page.getByRole('button', { name: /Print \/ Save as PDF/ }).click();
    await expect(page.locator('.print-root .sheet')).toHaveCount(4);
    await expect(page.locator('.print-root .sheet[data-face="back"] .sheet-card')).toHaveCount(6);
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const text = pdf.toString('latin1');
    expect(text.match(/\/Type\s*\/Page[^s]/g) ?? []).toHaveLength(4);
    const boxes = [...text.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)];
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) {
      expect(parseFloat(b[1])).toBeCloseTo(595, -1);
      expect(parseFloat(b[2])).toBeCloseTo(842, -1);
    }
  });

  test('a picture that cannot be loaded stops the print run with a way to retry, continue or cancel', async ({ page }) => {
    await loadSample(page);
    await addImageElement(page);
    await selectOption(page, field(page, 'Picture source'), 'column');
    await selectOption(page, field(page, 'Field with the image URL'), 'Name'); // names are not image URLs
    await goTo(page, 'print');
    await setField(page, 'Only these rows', '1');
    await page.evaluate(() => {
      (window as unknown as { __printed: number }).__printed = 0;
      window.print = () => {
        (window as unknown as { __printed: number }).__printed += 1;
      };
    });
    await page.getByRole('button', { name: /Print \/ Save as PDF/ }).click();
    await expect(page.getByTestId('print-status')).toContainText('1 picture could not be loaded');
    expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(0);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByTestId('print-status')).toContainText('could not be loaded');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.locator('.print-root')).toHaveCount(0);
    await page.getByRole('button', { name: /Print \/ Save as PDF/ }).click();
    await page.getByRole('button', { name: 'Print anyway' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
  });
});
