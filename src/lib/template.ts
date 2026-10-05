import type {
  AssetStore,
  ColorRule,
  ImageElement,
  ImageRule,
  PagePreset,
  RectElement,
  Row,
  Template,
  TemplateElement,
  TextElement,
} from './types';

export const PX_PER_MM = 96 / 25.4;

export const PAGE_PRESETS: Record<Exclude<PagePreset, 'custom'>, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
};

export const CARD_PRESETS: { label: string; width: number; height: number }[] = [
  { label: 'A6 holder insert (100 × 140)', width: 100, height: 140 },
  { label: 'A6 exact (105 × 148)', width: 105, height: 148 },
  { label: 'A7 (74 × 105)', width: 74, height: 105 },
  { label: 'Credit card (85.6 × 54)', width: 85.6, height: 54 },
  { label: 'Badge 4×3" (102 × 76)', width: 101.6, height: 76.2 },
  { label: 'Badge 3×4" (76 × 102)', width: 76.2, height: 101.6 },
  { label: 'Name tag (90 × 60)', width: 90, height: 60 },
];

export const FONT_FAMILIES: { label: string; value: string }[] = [
  { label: 'Sans (system)', value: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
  { label: 'Arial / Helvetica', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { label: 'Impact', value: 'Impact, "Arial Black", sans-serif' },
  { label: 'Comic Sans MS', value: '"Comic Sans MS", "Comic Sans", cursive' },
];

let counter = 0;
export function uid(prefix = 'el'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function round(n: number, step = 0.5): number {
  return Math.round(n / step) * step;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

const base = (name: string, x: number, y: number, w: number, h: number) => ({
  id: uid(),
  name,
  x,
  y,
  w,
  h,
  rotation: 0,
  opacity: 1,
  locked: false,
  hidden: false,
});

export function newTextElement(partial: Partial<TextElement> = {}): TextElement {
  return {
    ...base('Text', 5, 5, 60, 12),
    kind: 'text',
    content: 'Text',
    fontFamily: FONT_FAMILIES[0].value,
    fontSize: 14,
    minFontSize: 7,
    shrinkToFit: true,
    bold: false,
    italic: false,
    uppercase: false,
    wrap: true,
    lineHeight: 1.15,
    letterSpacing: 0,
    align: 'left',
    vAlign: 'top',
    color: '#111111',
    bg: 'transparent',
    colorRule: null,
    padding: 1,
    borderRadius: 0,
    borderWidth: 0,
    borderColor: '#111111',
    ...partial,
  };
}

export function newRectElement(partial: Partial<RectElement> = {}): RectElement {
  return {
    ...base('Shape', 0, 0, 40, 20),
    kind: 'rect',
    bg: '#1f6feb',
    colorRule: null,
    borderRadius: 0,
    borderWidth: 0,
    borderColor: '#111111',
    ...partial,
  };
}

export function newImageElement(partial: Partial<ImageElement> = {}): ImageElement {
  return {
    ...base('Image', 5, 5, 30, 30),
    kind: 'image',
    src: '',
    srcColumn: null,
    imageRule: null,
    fit: 'contain',
    borderRadius: 0,
    ...partial,
  };
}

/**
 * A sensible starter design: a 100 × 140 mm card (slips into a standard A6 lanyard
 * holder, four to an A4 sheet). Column names are guessed from the CSV headers.
 */
export function defaultTemplate(headers: string[] = []): Template {
  const W = 100;
  const H = 140;
  const find = (...cands: string[]) =>
    headers.find((h) => cands.some((c) => h.toLowerCase().replace(/[^a-z]/g, '') === c)) ?? null;
  const nameCol = find('name', 'fullname') ?? headers[0] ?? 'Name';
  const firstCol = find('firstname', 'first', 'givenname');
  const lastCol = find('lastname', 'last', 'surname', 'familyname');
  const nameContent = firstCol && lastCol ? `{{${firstCol}}} {{${lastCol}}}` : `{{${nameCol}}}`;
  const accomCol = find('accommodation', 'accomodation', 'cabin', 'room', 'tent', 'lodge', 'dorm', 'bunk') ?? headers[1] ?? 'Accommodation';
  const groupCol = find('group', 'team', 'tribe', 'house', 'unit', 'role') ?? headers[2] ?? 'Group';

  return {
    version: 2,
    name: 'Camp badge',
    assets: {},
    card: { width: W, height: H, bg: '#ffffff', bgImage: null, borderRadius: 3 },
    page: {
      preset: 'A4',
      width: 210,
      height: 297,
      landscape: false,
      margin: 5,
      gapX: 0,
      gapY: 0,
      cutMarks: true,
      outline: false,
      copies: 1,
    },
    elements: [
      newRectElement({ name: 'Header band', x: 0, y: 0, w: W, h: 34, bg: '#1f6feb', borderRadius: 0 }),
      newTextElement({
        name: 'Camp title',
        x: 6,
        y: 6,
        w: W - 12,
        h: 22,
        content: 'SUMMER CAMP 2026',
        fontSize: 20,
        minFontSize: 10,
        bold: true,
        align: 'center',
        vAlign: 'middle',
        color: '#ffffff',
        letterSpacing: 0.04,
      }),
      newTextElement({
        name: 'Name',
        x: 6,
        y: 44,
        w: W - 12,
        h: 30,
        content: nameContent,
        fontSize: 30,
        minFontSize: 12,
        bold: true,
        align: 'center',
        vAlign: 'middle',
        color: '#111111',
      }),
      newTextElement({
        name: 'Accommodation label',
        x: 6,
        y: 84,
        w: W - 12,
        h: 8,
        content: 'ACCOMMODATION',
        fontSize: 9,
        minFontSize: 6,
        align: 'center',
        vAlign: 'bottom',
        color: '#6b7280',
        letterSpacing: 0.12,
        shrinkToFit: false,
      }),
      newTextElement({
        name: 'Accommodation',
        x: 6,
        y: 92,
        w: W - 12,
        h: 18,
        content: `{{${accomCol}}}`,
        fontSize: 18,
        minFontSize: 9,
        bold: true,
        align: 'center',
        vAlign: 'top',
        color: '#111111',
      }),
      newRectElement({ name: 'Group band', x: 0, y: H - 20, w: W, h: 20, bg: '#f59e0b', borderRadius: 0 }),
      newTextElement({
        name: 'Group',
        x: 6,
        y: H - 18,
        w: W - 12,
        h: 16,
        content: `{{${groupCol}}}`,
        fontSize: 14,
        minFontSize: 8,
        bold: true,
        align: 'center',
        vAlign: 'middle',
        color: '#111111',
        uppercase: true,
      }),
    ],
  };
}

const PLACEHOLDER_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

/** Column names referenced by `{{ … }}` placeholders in a string. */
export function placeholdersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/** Every column the template reads from (placeholders, colour rules, image columns). */
export function columnsUsedBy(template: Template): string[] {
  const set = new Set<string>();
  for (const el of template.elements) {
    if (el.kind === 'text') {
      placeholdersIn(el.content).forEach((c) => set.add(c));
      if (el.colorRule) set.add(el.colorRule.column);
    } else if (el.kind === 'rect') {
      if (el.colorRule) set.add(el.colorRule.column);
    } else if (el.kind === 'image') {
      if (el.imageRule) set.add(el.imageRule.column);
      else if (el.srcColumn) set.add(el.srcColumn);
    }
  }
  return [...set];
}

export function substitute(text: string, row: Row): string {
  return text.replace(PLACEHOLDER_RE, (_m, key: string) => row[key] ?? '');
}

export function resolveFill(bg: string, rule: ColorRule | null, row: Row): string {
  if (!rule) return bg;
  const v = (row[rule.column] ?? '').trim();
  return rule.map[v] ?? rule.fallback;
}

export function elementLabel(el: TemplateElement): string {
  if (el.name) return el.name;
  if (el.kind === 'text') return el.content.slice(0, 24) || 'Text';
  if (el.kind === 'rect') return 'Shape';
  return 'Image';
}

/** Current page dimensions in mm, taking orientation into account. */
export function pageDims(template: Template): { width: number; height: number } {
  const { width, height, landscape } = template.page;
  return landscape ? { width: height, height: width } : { width, height };
}

export interface SheetLayout {
  cols: number;
  rows: number;
  perPage: number;
  /** Offset so that the grid of cards is centred within the printable area. */
  offsetX: number;
  offsetY: number;
  pageWidth: number;
  pageHeight: number;
}

export function computeSheetLayout(template: Template): SheetLayout {
  const { width: pageWidth, height: pageHeight } = pageDims(template);
  const { margin, gapX, gapY } = template.page;
  const cw = template.card.width;
  const ch = template.card.height;
  const availW = pageWidth - margin * 2;
  const availH = pageHeight - margin * 2;
  const cols = Math.max(0, Math.floor((availW + gapX) / (cw + gapX)));
  const rows = Math.max(0, Math.floor((availH + gapY) / (ch + gapY)));
  const usedW = cols * cw + Math.max(0, cols - 1) * gapX;
  const usedH = rows * ch + Math.max(0, rows - 1) * gapY;
  return {
    cols,
    rows,
    perPage: cols * rows,
    offsetX: margin + (availW - usedW) / 2,
    offsetY: margin + (availH - usedH) / 2,
    pageWidth,
    pageHeight,
  };
}

/** Deterministic, pleasant palette for auto-assigning colours to distinct values. */
export const PALETTE = [
  '#1f6feb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#84cc16', '#06b6d4', '#a855f7', '#e11d48', '#0ea5e9', '#eab308', '#22c55e', '#6366f1',
];

export function distinctValues(rows: Row[], column: string, limit = 60): string[] {
  const seen = new Map<string, number>();
  for (const r of rows) {
    const v = (r[column] ?? '').trim();
    seen.set(v, (seen.get(v) ?? 0) + 1);
  }
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([v]) => v);
}

export function buildColorRule(rows: Row[], column: string, existing?: ColorRule | null): ColorRule {
  const values = distinctValues(rows, column);
  const map: Record<string, string> = {};
  values.forEach((v, i) => {
    map[v] = existing?.column === column && existing.map[v] ? existing.map[v] : PALETTE[i % PALETTE.length];
  });
  return { column, map, fallback: existing?.fallback ?? '#9ca3af' };
}

/** True when the element's box (ignoring rotation) pokes outside the card. */
export function outsideCard(el: Pick<TemplateElement, 'x' | 'y' | 'w' | 'h'>, card: { width: number; height: number }, tol = 0.01): boolean {
  return el.x < -tol || el.y < -tol || el.x + el.w > card.width + tol || el.y + el.h > card.height + tol;
}

/** Human-readable description of a fit problem, or null when everything fits. */
export function describeFit(status: { overflow: boolean; clipped: boolean } | undefined): string | null {
  if (!status) return null;
  if (status.overflow && status.clipped) return 'text overflows its box and is cut off by the card edge';
  if (status.overflow) return 'text overflows its box';
  if (status.clipped) return 'text is cut off by the card edge';
  return null;
}

/**
 * Which picture an image element shows for a row.
 * Priority: image-by-field rule → URL from a column → the fixed upload.
 * Returns '' when nothing applies (the element renders empty).
 */
export function resolveImageSrc(el: Pick<ImageElement, 'src' | 'srcColumn' | 'imageRule'>, row: Row): string {
  if (el.imageRule) {
    const v = (row[el.imageRule.column] ?? '').trim();
    if (el.imageRule.map[v]) return el.imageRule.map[v];
    return el.imageRule.fallback || '';
  }
  if (el.srcColumn) {
    const v = (row[el.srcColumn] ?? '').trim();
    if (v) return v;
  }
  return el.src;
}

/** Start (or re-key) an image rule for `column`, keeping pictures already assigned to the same values. */
export function buildImageRule(rows: Row[], column: string, existing?: ImageRule | null): ImageRule {
  const map: Record<string, string> = {};
  for (const v of distinctValues(rows, column)) {
    const prev = existing?.column === column ? existing.map[v] : undefined;
    if (prev) map[v] = prev;
  }
  return { column, map, fallback: existing?.fallback ?? '' };
}

/** "Lakeside Lodge – Upper Floor" → "lakesidelodgeupperfloor"; used to match file names to values. */
export function normalizeKey(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Strip the extension and any trailing size/copy suffix from a file name: "bears (2).png" → "bears". */
export function fileStem(fileName: string): string {
  return fileName
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\s*\(\d+\)$/, '')
    .replace(/[-_ ]?\d+x\d+$/i, '');
}

export interface FileMatch {
  fileName: string;
  /** The distinct value this file was matched to, or null if none matched. */
  value: string | null;
}

/**
 * Match uploaded file names to a column's distinct values by normalised name,
 * e.g. "Bears.png" → "Bears", "lake-side_lodge.jpg" → "Lakeside Lodge".
 * A file also matches when its stem is a singular/plural variant ("bear" ↔ "Bears").
 */
export function matchFilesToValues(fileNames: string[], values: string[]): FileMatch[] {
  const byKey = new Map<string, string>();
  for (const v of values) {
    const k = normalizeKey(v);
    if (k) byKey.set(k, v);
  }
  const lookup = (k: string): string | null => {
    if (byKey.has(k)) return byKey.get(k)!;
    if (byKey.has(k + 's')) return byKey.get(k + 's')!;
    if (k.endsWith('s') && byKey.has(k.slice(0, -1))) return byKey.get(k.slice(0, -1))!;
    return null;
  };
  return fileNames.map((fileName) => ({ fileName, value: lookup(normalizeKey(fileStem(fileName))) }));
}

// ---------------------------------------------------------------------------
// Asset store – pictures are kept once, by content
// ---------------------------------------------------------------------------

export const ASSET_PREFIX = 'asset:';

/** cyrb53: fast, well-distributed 53-bit string hash; returned as 14 hex chars. */
export function hashString(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return ((h2 >>> 0) & 0x1fffff).toString(16).padStart(6, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

export function isAssetRef(ref: string | null | undefined): ref is string {
  return !!ref && ref.startsWith(ASSET_PREFIX);
}

/**
 * Store a picture (data URL) in `assets` unless an identical one is already
 * there, and return the reference to put on an element. Non-data URLs (http…)
 * are returned unchanged – they are not ours to store.
 * Mutates `assets`.
 */
export function internAsset(assets: AssetStore, url: string): string {
  if (!url || !url.startsWith('data:')) return url;
  const base = hashString(url);
  let id = base;
  // Hash collision with different content is astronomically unlikely, but cheap to rule out.
  for (let n = 1; assets[id] !== undefined && assets[id] !== url; n++) id = `${base}-${n}`;
  assets[id] = url;
  return ASSET_PREFIX + id;
}

/** Turn a reference (or a plain/legacy URL) into something an <img> can show. */
export function imageUrl(assets: AssetStore | undefined, ref: string | null | undefined): string {
  if (!ref) return '';
  if (isAssetRef(ref)) return assets?.[ref.slice(ASSET_PREFIX.length)] ?? '';
  return ref;
}

/** Every picture reference the template uses (elements, rules, fallbacks, background). */
export function imageRefsIn(t: Template): string[] {
  const refs: string[] = [];
  if (t.card.bgImage) refs.push(t.card.bgImage);
  for (const el of t.elements) {
    if (el.kind !== 'image') continue;
    if (el.src) refs.push(el.src);
    if (el.imageRule) {
      refs.push(...Object.values(el.imageRule.map));
      if (el.imageRule.fallback) refs.push(el.imageRule.fallback);
    }
  }
  return refs;
}

/** Ids of stored pictures nothing refers to any more. */
export function unusedAssetIds(t: Template): string[] {
  const used = new Set(imageRefsIn(t).filter(isAssetRef).map((r) => r.slice(ASSET_PREFIX.length)));
  return Object.keys(t.assets).filter((id) => !used.has(id));
}

/** Remove unreferenced pictures. Mutates `t`; returns how many were removed. */
export function pruneAssets(t: Template): number {
  const ids = unusedAssetIds(t);
  for (const id of ids) delete t.assets[id];
  return ids.length;
}

/** Approximate bytes taken by the stored pictures. */
export function assetBytes(assets: AssetStore): number {
  let n = 0;
  for (const url of Object.values(assets)) n += url.length;
  return n;
}

/**
 * Move every inline data URL (version 1 templates, or anything pasted in by hand)
 * into the asset store, deduplicating along the way. Mutates and returns `t`.
 */
export function internAllImages(t: Template): Template {
  t.assets ??= {};
  if (t.card.bgImage && !isAssetRef(t.card.bgImage)) t.card.bgImage = internAsset(t.assets, t.card.bgImage);
  for (const el of t.elements) {
    if (el.kind !== 'image') continue;
    if (el.src && !isAssetRef(el.src)) el.src = internAsset(t.assets, el.src);
    if (el.imageRule) {
      for (const [k, v] of Object.entries(el.imageRule.map)) {
        if (v && !isAssetRef(v)) el.imageRule.map[k] = internAsset(t.assets, v);
      }
      if (el.imageRule.fallback && !isAssetRef(el.imageRule.fallback)) {
        el.imageRule.fallback = internAsset(t.assets, el.imageRule.fallback);
      }
    }
  }
  t.version = 2;
  return t;
}
