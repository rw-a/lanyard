import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { LEGACY_LOCAL_KEYS, canvasTexts, getElement, goTo, loadSample, openApp, pasteCsv, selectLayer, setField, storedGet, storedSet, waitForElement } from './helpers';
import type { Dataset, Template } from '../../src/lib/types';

/** Templates exactly as earlier versions of the app saved them. */
const fixture = (version: 1 | 2) => JSON.parse(readFileSync(new URL(`../fixtures/template-v${version}.json`, import.meta.url), 'utf8'));

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
    expect(stored.sides.front.elements.map((e) => (e as { content?: string }).content)).toContain('{{Full Name}}');
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

  test('a corrupt stored template falls back to the default and keeps the original for recovery', async ({ page }) => {
    await openApp(page);
    await storedSet(page, 'template', { version: 2, card: 'garbage' });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.reload();
    await expect(page.getByTestId('startup-notice')).toContainText('could not be opened');
    await page.getByRole('button', { name: 'Go to Design' }).click();
    await expect(page.locator('[data-testid="layer"]')).toHaveCount(7);
    const recovery = await storedGet<{ template: unknown; reason: string }>(page, 'template-recovery');
    expect(recovery?.template).toEqual({ version: 2, card: 'garbage' });
    expect(recovery?.reason).toBe('invalid');
    // The original can be downloaded exactly as it was stored
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download the original' }).click()]);
    const text = await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString());
    expect(JSON.parse(text)).toEqual({ version: 2, card: 'garbage' });
    expect(errors).toEqual([]);
  });

  test('a template from a newer app version is never downgraded and saved over', async ({ page }) => {
    await openApp(page);
    const future = { version: 99, card: { width: 1, height: 1 }, somethingNew: true };
    await storedSet(page, 'template', future);
    await page.reload();
    await expect(page.getByTestId('startup-notice')).toContainText('newer version');
    expect((await storedGet<{ template: unknown; reason: string }>(page, 'template-recovery'))).toMatchObject({ template: future, reason: 'future' });
    expect(await storedGet(page, 'template')).toEqual(future); // untouched until the user changes something
  });

  test('when the unreadable original cannot be backed up, template auto-save pauses instead of overwriting it', async ({ page }) => {
    await openApp(page);
    await storedSet(page, 'template', { version: 99 });
    // Make the recovery write (and only that) fail on the next load.
    await page.addInitScript(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
        if (key === 'template-recovery') throw new DOMException('quota', 'QuotaExceededError');
        return put.call(this, value, key);
      };
    });
    await page.reload();
    await expect(page.getByTestId('startup-notice')).toContainText('auto-saving the template is paused');
    await loadSample(page);
    await selectLayer(page, 'Name');
    await page.keyboard.press('ArrowRight');
    await page.evaluate(() => window.lanyardMaker.flushPersist());
    expect(await storedGet(page, 'template')).toEqual({ version: 99 });
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

  for (const version of [1, 2] as const) {
    test(`version ${version} state in localStorage is migrated into IndexedDB as version 3 without its old card name`, async ({ page }) => {
      const legacy = fixture(version);
      const width = legacy.card.width;
      await openApp(page);
      await page.evaluate(
        ({ keys, legacy }) => {
          localStorage.setItem(keys.template, JSON.stringify(legacy));
          localStorage.setItem(keys.pristine, '1');
          const ds = { fileName: 'old.csv', headers: ['Name', 'Accommodation', 'Group'], rows: [{ Name: 'Ada', Accommodation: 'Cabin 1', Group: 'Red' }] };
          localStorage.setItem(keys.dataset, JSON.stringify(ds));
        },
        { keys: LEGACY_LOCAL_KEYS, legacy },
      );
      await page.reload();
      await expect(page.getByTestId('topbar-info')).toHaveText(`${width} × 140 mm`);
      await expect(page.getByTestId('tab-data')).toContainText('1');
      await expect(page.getByTestId('tab-design')).toHaveAttribute('aria-selected', 'true');
      await expect.poll(() => storedGet<Template>(page, 'template')).not.toHaveProperty('name');
      const stored = (await storedGet<Template>(page, 'template'))!;
      expect(stored.card).toEqual({ width, height: 140, borderRadius: legacy.card.borderRadius });
      expect(stored).toMatchObject({ version: 3, sidedness: 'single', sides: { back: null } });
      expect(stored.page).toEqual({ ...legacy.page, printMethod: 'cutouts' }); // copies (2 or 3) kept, not turned into double-sided
      expect(stored.sides.front.bg).toBe(legacy.card.bg);
      expect(stored.sides.front.elements.map((e) => e.id)).toEqual(legacy.elements.map((e: { id: string }) => e.id));
      expect(stored.sides.front.bgImage).toMatch(/^asset:/);
      expect(Object.keys(stored.assets)).toHaveLength(1); // v1's inline pictures were interned once
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
  }

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
