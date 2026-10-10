import { expect, test } from '@playwright/test';
import { field, getTemplate, goTo, loadSample, openApp, setField, selectOption, setChecked } from './helpers';

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
    await expect(summary(page)).toContainText('25 people = 25 cards');
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
    await setField(page, 'Gap ↔', 10);
    await expect(summary(page)).toContainText('1 × 2 = 2 per sheet → 13 sheets');
    await setField(page, 'Gap ↔', 0);
    await setField(page, 'Gap ↕', 4);
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
    await setField(page, 'Copies of each card', 2);
    await expect(summary(page)).toContainText('25 people × 2 copies = 50 cards');
    await expect(summary(page)).toContainText('→ 13 sheets');
    const names = await page.locator('.sheet-stage .sheet-card .card').evaluateAll((els) => els.map((e) => e.textContent));
    expect(names[0]).toBe(names[1]); // consecutive duplicates
    expect(names[2]).toBe(names[3]);

    await setField(page, 'Only these rows', '1-3, 25');
    await expect(summary(page)).toContainText('4 people × 2 copies = 8 cards');
    await expect(summary(page)).toContainText('→ 2 sheets');
    await setField(page, 'Copies of each card', 1);
    await setField(page, 'Only these rows', '2');
    await expect(summary(page)).toContainText('1 person = 1 card');
    await expect(page.locator('.sheet-stage .sheet-card .card')).toContainText('Amara Okafor-Blackwood');

    // Out-of-range and garbage are ignored; empty means everyone
    await setField(page, 'Only these rows', '99, abc');
    await expect(summary(page)).toContainText('0 people');
    await setField(page, 'Only these rows', '');
    await expect(summary(page)).toContainText('25 people = 25 cards');
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
