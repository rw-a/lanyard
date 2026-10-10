import { expect, test } from '@playwright/test';
import { LEGACY_LOCAL_KEYS, canvasTexts, getElement, goTo, loadSample, openApp, pasteCsv, selectLayer, setField, storedGet, storedSet, waitForElement } from './helpers';
import type { Dataset, Template } from '../../src/lib/types';

test.describe('Persistence', () => {
  test('template edits and the loaded CSV survive a reload', async ({ page }) => {
    await loadSample(page);
    await selectLayer(page, 'Name');
    await setField(page, 'X', 20);
    await waitForElement(page, 'Name', (el) => el.x === 20);
    await page.locator('#content-editor').fill('{{Name}} ★');

    await page.reload();
    await expect(page.getByTestId('tab-design')).toHaveAttribute('aria-selected', 'true'); // opens on Design when data exists
    await expect(page.getByTestId('tab-data')).toContainText('25');
    expect((await getElement(page, 'Name')).x).toBe(20);
    expect(await canvasTexts(page)).toContain('Priya Raman ★');
  });

  test('a fresh visit with no data opens on the Data tab', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('tab-data')).toHaveAttribute('aria-selected', 'true');
    expect(await storedGet(page, 'dataset')).toBeUndefined();
    expect(await page.evaluate(() => window.lanyardMaker.storage.name())).toBe('indexeddb');
  });

  test('loading a CSV before touching the design rebinds the starter template to its headers', async ({ page }) => {
    await openApp(page);
    await pasteCsv(page, 'Full Name,Tent,Team\nAda Lovelace,Tent 1,Red\nBo,Tent 22,Blue\n');
    await goTo(page, 'design');
    expect(await canvasTexts(page)).toEqual(['SUMMER CAMP 2026', 'Ada Lovelace', 'ACCOMMODATION', 'Tent 22', 'Blue']);
    const stored = (await storedGet<Template>(page, 'template'))!;
    expect(stored.elements.map((e) => (e as { content?: string }).content)).toContain('{{Full Name}}');
  });

  test('once the design has been edited, loading another CSV keeps the design', async ({ page }) => {
    await openApp(page);
    await pasteCsv(page, 'Name,Accommodation,Group\nAda,Cabin 1,Red\n');
    await goTo(page, 'design');
    await selectLayer(page, 'Camp title');
    await page.locator('#content-editor').fill('MY CAMP');
    await goTo(page, 'data');
    await pasteCsv(page, 'Name,Accommodation,Group\nBob,Cabin 2,Blue\n');
    await goTo(page, 'design');
    expect(await canvasTexts(page)).toContain('MY CAMP');
    expect(await canvasTexts(page)).toContain('Bob');
  });

  test('a corrupt stored template falls back to the default instead of crashing', async ({ page }) => {
    await openApp(page);
    await storedSet(page, 'template', { version: 99, garbage: true });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.reload();
    await page.getByRole('button', { name: 'Go to Design' }).click();
    await expect(page.locator('[data-testid="layer"]')).toHaveCount(7);
    expect(errors).toEqual([]);
  });

  test('an unusable dataset in storage is ignored', async ({ page }) => {
    await openApp(page);
    await storedSet(page, 'dataset', 'not a dataset');
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Drop Your CSV Here' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('no console errors during a full data → design → print round trip', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await loadSample(page);
    await selectLayer(page, 'Name');
    await page.keyboard.press('ArrowRight');
    await goTo(page, 'print');
    await expect(page.locator('.sheet').first()).toBeVisible();
    await goTo(page, 'data');
    await goTo(page, 'design');
    expect(errors).toEqual([]);
  });
});

test.describe('Persistence – storage backend', () => {
  test('shows a warning when the browser refuses to save', async ({ page }) => {
    await loadSample(page);
    await expect(page.getByTestId('persist-warning')).toHaveCount(0);
    // Simulate a full IndexedDB: every write throws QuotaExceededError.
    await page.evaluate(() => {
      IDBObjectStore.prototype.put = () => {
        throw new DOMException('quota', 'QuotaExceededError');
      };
    });
    await selectLayer(page, 'Name');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('persist-warning')).toContainText('could not be saved: the browser database is full');
    // The app keeps working and the edit is live even though it is not stored
    await waitForElement(page, 'Name', (el) => el.x === 7);
  });

  test('state saved by older versions in localStorage is migrated into IndexedDB', async ({ page }) => {
    await openApp(page);
    await page.evaluate(
      ({ keys }) => {
        const t = window.lanyardMaker.getTemplate() as unknown as { version: number; name: string };
        t.version = 1;
        t.name = 'From the old days';
        localStorage.setItem(keys.template, JSON.stringify(t));
        localStorage.setItem(keys.pristine, '1');
        const ds = { fileName: 'old.csv', headers: ['Name', 'Accommodation', 'Group'], rows: [{ Name: 'Ada', Accommodation: 'Cabin 1', Group: 'Red' }] };
        localStorage.setItem(keys.dataset, JSON.stringify(ds));
      },
      { keys: LEGACY_LOCAL_KEYS },
    );
    await page.reload();
    await expect(page.locator('.topbar')).toContainText('From the old days');
    await expect(page.getByTestId('tab-data')).toContainText('1');
    await expect(page.getByTestId('tab-design')).toHaveAttribute('aria-selected', 'true');
    expect((await storedGet<Template>(page, 'template'))!.name).toBe('From the old days');
    expect((await storedGet<Template>(page, 'template'))!.version).toBe(2);
    expect((await storedGet<Dataset>(page, 'dataset'))!.rows).toHaveLength(1);
    expect(await storedGet(page, 'template-pristine')).toBe(true);
    // The old copies are gone so they are not migrated twice
    expect(await page.evaluate((keys) => Object.values(keys).map((k) => localStorage.getItem(k)), LEGACY_LOCAL_KEYS)).toEqual([null, null, null]);
    // …and the migrated template still counts as pristine: loading a CSV rebinds it
    await goTo(page, 'data');
    await pasteCsv(page, 'Who,Where\nBo,Tent 2\n');
    await goTo(page, 'design');
    expect(await canvasTexts(page)).toContain('Bo');
  });

  test('a roster far beyond the old 5 MB localStorage limit is saved and reloaded', async ({ page }) => {
    await openApp(page);
    const lines = ['Name,Accommodation,Group,Emergency contact'];
    for (let i = 0; i < 50_000; i++) {
      lines.push(`Person ${String(i).padStart(5, '0')},Cabin ${i % 40},Group ${i % 7},Contact ${i} 555-${String(i % 10_000).padStart(4, '0')}`);
    }
    await page.locator('input[type=file]').first().setInputFiles({ name: 'big.csv', mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n')) });
    await expect(page.getByText(/big\.csv — 50000 People/)).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => (await storedGet<Dataset>(page, 'dataset'))?.rows.length, { timeout: 20_000 }).toBe(50_000);
    const json = await page.evaluate(() => JSON.stringify(window.lanyardMaker.getDataset()).length);
    expect(json).toBeGreaterThan(5 * 1024 * 1024);
    await page.reload();
    await expect(page.getByTestId('tab-data')).toContainText('50000', { timeout: 20_000 });
    await expect(page.getByTestId('persist-warning')).toHaveCount(0);
  });

});
