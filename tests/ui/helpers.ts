import { expect, type Locator, type Page } from '@playwright/test';
import type { Template, TemplateElement } from '../../src/lib/types';

export { KEYS, LEGACY_LOCAL_KEYS } from '../../src/lib/storage';

/** The three "fit check" variants rendered under the canvas. */
export const VARIANTS = ['shortest', 'median', 'longest'] as const;
export type Variant = (typeof VARIANTS)[number];

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('tab-data')).toBeVisible();
}

export async function goTo(page: Page, tab: 'data' | 'design' | 'print') {
  await page.getByTestId(`tab-${tab}`).click();
  await expect(page.getByTestId(`tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
}

/** Load the built-in sample roster (25 people) and land on the Design tab. */
export async function loadSample(page: Page) {
  await openApp(page);
  await page.getByRole('button', { name: 'Load sample roster' }).click();
  await expect(page.getByTestId('tab-data')).toContainText('25');
  await goTo(page, 'design');
  await expect(canvasCard(page)).toBeVisible();
}

/** Paste CSV text through the "Paste text" box. */
export async function pasteCsv(page: Page, csv: string) {
  await page.getByRole('button', { name: 'Paste text' }).click();
  await page.locator('.paste-box textarea').fill(csv);
  await page.getByRole('button', { name: 'Use this data' }).click();
}

// ---------------------------------------------------------------------------
// Designer
// ---------------------------------------------------------------------------

export function canvasCard(page: Page): Locator {
  return page.locator('.editor-card');
}

export function layer(page: Page, name: string): Locator {
  return page.locator(`[data-testid="layer"][data-name="${name}"]`);
}

export async function selectLayer(page: Page, name: string) {
  await layer(page, name).click();
  await expect(layer(page, name)).toHaveClass(/active/);
  await expect(page.getByTestId('selection')).toBeVisible();
}

/** The form control inside the inspector field with this label. */
export function field(page: Page, label: string): Locator {
  return page.locator(`[data-field="${label}"]`).locator('input, select, textarea').first();
}

/** Choose through the visible Park UI menu rather than its hidden form select. */
export async function selectOption(page: Page, select: Locator, value: string | { label: string }) {
  const label = typeof value === 'string'
    ? await select.locator('option').evaluateAll((options, selected) => (options.find((o) => (o as HTMLOptionElement).value === selected) as HTMLOptionElement)?.textContent ?? '', value)
    : value.label;
  const root = select.locator('..');
  await root.getByRole('combobox').click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

export async function setChecked(control: Locator, checked: boolean) {
  if (await control.isChecked() !== checked) await control.locator('..').click();
  await expect(control).toBeChecked({ checked });
}

/** Type a number into an inspector field (fires input events like a user would). */
export async function setField(page: Page, label: string, value: string | number) {
  const input = field(page, label);
  await input.fill(String(value));
}

/** Text of each text element currently rendered on the canvas card, in template order. */
export function canvasTexts(page: Page): Promise<string[]> {
  return canvasCard(page)
    .locator('.el-text')
    .evaluateAll((els) => els.map((e) => e.textContent ?? ''));
}

/** Current font size (pt) applied to a text element on a given card locator. */
export async function fontSizeOf(card: Locator, elementName: string): Promise<number> {
  const id = await elementId(card.page(), elementName);
  const px = await card.locator(`.el-text[data-id="${id}"] > div`).evaluate((d) => (d as HTMLElement).style.fontSize);
  return parseFloat(px);
}

// ---------------------------------------------------------------------------
// Fit check previews
// ---------------------------------------------------------------------------

export function preview(page: Page, variant: Variant): Locator {
  return page.getByTestId(`preview-${variant}`);
}

export function previewStatus(page: Page, variant: Variant): Locator {
  return preview(page, variant).getByTestId('preview-status');
}

export async function expectAllFit(page: Page) {
  for (const v of VARIANTS) await expect(previewStatus(page, v)).toHaveText(/Everything fits/);
}

/** Text of the text element named `name` inside one of the three preview cards. */
export async function previewText(page: Page, variant: Variant, elementName: string): Promise<string> {
  const id = await elementId(page, elementName);
  return (await preview(page, variant).locator(`.el-text[data-id="${id}"]`).textContent()) ?? '';
}

// ---------------------------------------------------------------------------
// Template state
// ---------------------------------------------------------------------------

/** The live template as the app sees it right now (not the debounced stored copy). */
export function getTemplate(page: Page): Promise<Template> {
  return page.evaluate(() => window.lanyardMaker.getTemplate());
}

/** Read a value straight from the app's persistent storage (IndexedDB, or its fallback). */
export function storedGet<T = unknown>(page: Page, key: 'template' | 'dataset' | 'template-pristine'): Promise<T | undefined> {
  return page.evaluate((k) => window.lanyardMaker.storage.get(k), key) as Promise<T | undefined>;
}

/** Write a value straight into the app's persistent storage (takes effect on the next load). */
export function storedSet(page: Page, key: 'template' | 'dataset' | 'template-pristine', value: unknown): Promise<void> {
  return page.evaluate(({ k, v }) => window.lanyardMaker.storage.set(k, v), { k: key, v: value });
}

/** The template as persisted (debounced ~300 ms after an edit). */
export async function getStoredTemplate(page: Page): Promise<Template> {
  await expect.poll(() => storedGet(page, 'template')).not.toBeUndefined();
  return (await storedGet<Template>(page, 'template'))!;
}

export async function getElement(page: Page, name: string): Promise<TemplateElement> {
  const t = await getTemplate(page);
  const el = t.elements.find((e) => e.name === name);
  if (!el) throw new Error(`No element named "${name}" in template (have: ${t.elements.map((e) => e.name).join(', ')})`);
  return el;
}

export async function elementId(page: Page, name: string): Promise<string> {
  return (await getElement(page, name)).id;
}

/** Poll until the live element satisfies `pred`. */
export async function waitForElement(page: Page, name: string, pred: (el: TemplateElement) => boolean, message?: string) {
  let last: TemplateElement | undefined;
  await expect
    .poll(
      async () => {
        const t = await getTemplate(page);
        last = t.elements.find((e) => e.name === name);
        return last ? pred(last) : false;
      },
      { message: message ? `${message} (last seen: ${JSON.stringify(last && { x: last.x, y: last.y, w: last.w, h: last.h })})` : undefined },
    )
    .toBe(true);
}

// ---------------------------------------------------------------------------
// Mouse helpers (coordinates in CSS px of the page)
// ---------------------------------------------------------------------------

export async function dragBy(page: Page, from: Locator, dx: number, dy: number) {
  const box = await from.boundingBox();
  if (!box) throw new Error('Element has no bounding box');
  const sx = box.x + box.width / 2;
  const sy = box.y + box.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + dx / 2, sy + dy / 2, { steps: 4 });
  await page.mouse.move(sx + dx, sy + dy, { steps: 4 });
  await page.mouse.up();
}

/** Canvas zoom factor (screen px per unscaled px) read from the stage transform. */
export async function canvasZoom(page: Page): Promise<number> {
  const label = await page.locator('.toolbar .btn.tiny').filter({ hasText: /%$/ }).textContent();
  return parseInt(label ?? '100', 10) / 100;
}

export const PX_PER_MM = 96 / 25.4;

/** Convert a distance in mm to on-screen px for the current canvas zoom. */
export async function mmToScreen(page: Page, mm: number): Promise<number> {
  return mm * PX_PER_MM * (await canvasZoom(page));
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export interface TestPng {
  name: string;
  mimeType: 'image/png';
  buffer: Buffer;
  /** What the app stores for this file (small PNGs are kept verbatim). */
  dataUrl: string;
}

/** Make a solid-colour PNG in the browser (no binary fixtures needed). */
export async function makePng(page: Page, name: string, color: string, w = 64, h = 64): Promise<TestPng> {
  const dataUrl = await page.evaluate(
    ({ color, w, h }) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      return c.toDataURL('image/png');
    },
    { color, w, h },
  );
  return { name, mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64'), dataUrl };
}

export const canvasImage = (page: Page) => canvasCard(page).locator('[data-testid="image"]');
export const previewImage = (page: Page, variant: Variant) => preview(page, variant).locator('[data-testid="image"]');

export async function addImageElement(page: Page) {
  await page.getByRole('button', { name: 'Add image or logo' }).click();
  await expect(layer(page, 'Image')).toHaveClass(/active/);
}

/** Row in the picture-by-field editor for one value. */
export const ruleRow = (page: Page, value: string) => page.locator(`[data-testid="image-rule-row"][data-value="${value}"]`);
