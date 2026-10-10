import type { AssetStore, CardGeometry, PageSettings, PrintMethod, SideDesign, Sidedness, Template, TemplateElement } from './types';
import { TEMPLATE_VERSION } from './types';
import { defaultTemplate, internAllImages, pruneAssets, uid } from './template';

/**
 * Turning stored or imported JSON into a current (version 3) template.
 *
 * Everything here is pure: the input is `unknown`, nothing is mutated, and a
 * template that cannot be read is reported as an error rather than replaced by
 * the default, so callers can leave live state alone and keep the original for
 * recovery.
 *
 * Version 3 files are not readable by app versions that only know versions 1–2.
 */

export type ParseFailure = {
  ok: false;
  /** `future`: written by a newer version of the app; `invalid`: not a template we can read. */
  reason: 'invalid' | 'future';
  error: string;
};

export type ParseSuccess = {
  ok: true;
  template: Template;
  /** True when the result differs from what was stored (upgraded, repaired or cleaned) and should be written back. */
  changed: boolean;
};

export type ParseResult = ParseSuccess | ParseFailure;

type Obj = Record<string, unknown>;

const SIDEDNESS: Sidedness[] = ['single', 'same', 'different'];
const PRINT_METHODS: PrintMethod[] = ['cutouts', 'duplex'];
const KINDS: TemplateElement['kind'][] = ['text', 'rect', 'image'];

class Invalid extends Error {}

function isObj(x: unknown): x is Obj {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

function fail(msg: string): never {
  throw new Invalid(msg);
}

function finite(o: Obj, key: string, where: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${where}: "${key}" must be a number`);
  return v;
}

function readGeometry(card: unknown): CardGeometry {
  if (!isObj(card)) fail('the card settings are missing');
  const width = finite(card, 'width', 'card');
  const height = finite(card, 'height', 'card');
  if (width <= 0 || height <= 0) fail('card: width and height must be positive');
  const r = card.borderRadius;
  const borderRadius = typeof r === 'number' && Number.isFinite(r) ? r : defaultTemplate().card.borderRadius;
  return { width, height, borderRadius };
}

function readPage(page: unknown): PageSettings {
  if (!isObj(page)) fail('the page settings are missing');
  const d = defaultTemplate().page;
  const merged = { ...d, ...page } as PageSettings & Obj;
  if (!PRINT_METHODS.includes(merged.printMethod)) merged.printMethod = d.printMethod;
  return merged;
}

function readElements(raw: unknown, where: string): TemplateElement[] {
  if (!Array.isArray(raw)) fail(`${where}: "elements" must be a list`);
  return raw.map((el, i) => {
    const at = `${where} layer ${i + 1}`;
    if (!isObj(el)) fail(`${at} is not an object`);
    if (typeof el.id !== 'string' || !el.id) fail(`${at} has no id`);
    if (!KINDS.includes(el.kind as TemplateElement['kind'])) fail(`${at} has an unknown kind`);
    for (const k of ['x', 'y', 'w', 'h']) finite(el, k, at);
    const copy = structuredClone(el) as unknown as TemplateElement;
    if (copy.kind === 'image') {
      copy.imageRule ??= null;
      copy.srcColumn ??= null;
    }
    return copy;
  });
}

function readSide(raw: unknown, where: string): SideDesign {
  if (!isObj(raw)) fail(`the ${where} design is missing`);
  const bg = typeof raw.bg === 'string' ? raw.bg : '#ffffff';
  const bgImage = typeof raw.bgImage === 'string' && raw.bgImage ? raw.bgImage : null;
  return { bg, bgImage, elements: readElements(raw.elements, where) };
}

function readAssets(raw: unknown): AssetStore {
  if (raw === undefined || raw === null) return {};
  if (!isObj(raw)) fail('"assets" must be an object');
  const out: AssetStore = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') out[k] = v;
  return out;
}

/** Version 1/2: one design whose background lived on `card`. */
function fromLegacy(t: Obj): Template {
  const card = t.card;
  if (!isObj(card)) fail('the card settings are missing');
  const front = readSide({ bg: card.bg, bgImage: card.bgImage, elements: t.elements }, 'front');
  return {
    version: TEMPLATE_VERSION,
    card: readGeometry(card),
    sidedness: 'single',
    sides: { front, back: null },
    page: { ...readPage(t.page), printMethod: 'cutouts' },
    assets: readAssets(t.assets),
  };
}

function fromV3(t: Obj): Template {
  if (!SIDEDNESS.includes(t.sidedness as Sidedness)) fail('"sidedness" must be single, same or different');
  const sidedness = t.sidedness as Sidedness;
  if (!isObj(t.sides)) fail('the side designs are missing');
  const front = readSide(t.sides.front, 'front');
  const back = t.sides.back === null || t.sides.back === undefined ? null : readSide(t.sides.back, 'back');
  if (sidedness === 'different' && !back) fail('a template with different sides needs a back design');
  return {
    version: TEMPLATE_VERSION,
    card: readGeometry(t.card),
    sidedness,
    sides: { front, back },
    page: readPage(t.page),
    assets: readAssets(t.assets),
  };
}

/** Give later duplicates fresh ids so every element id is unique across both sides. Returns how many were changed. */
function repairDuplicateIds(t: Template): number {
  const seen = new Set<string>();
  let n = 0;
  for (const d of [t.sides.front, t.sides.back]) {
    if (!d) continue;
    for (const el of d.elements) {
      if (seen.has(el.id)) {
        el.id = uid();
        n++;
      }
      seen.add(el.id);
    }
  }
  return n;
}

/** Read a stored or imported template of any known version and bring it up to date. */
export function parseTemplate(raw: unknown): ParseResult {
  if (!isObj(raw)) return { ok: false, reason: 'invalid', error: 'This is not a template file.' };
  const version = raw.version;
  if (typeof version === 'number' && version > TEMPLATE_VERSION) {
    return {
      ok: false,
      reason: 'future',
      error: `This template was saved by a newer version of Lanyard Maker (format ${version}); this version reads up to format ${TEMPLATE_VERSION}.`,
    };
  }
  if (version !== 1 && version !== 2 && version !== TEMPLATE_VERSION) {
    return { ok: false, reason: 'invalid', error: 'This is not a Lanyard Maker template (unknown format).' };
  }
  try {
    const t = version === TEMPLATE_VERSION ? fromV3(raw) : fromLegacy(raw);
    const before = JSON.stringify(t);
    const repaired = repairDuplicateIds(t);
    // v1 kept pictures inline as data URLs; move them into the asset store (deduplicated),
    // then drop pictures that no stored design – front or a retained back – refers to.
    internAllImages(t);
    pruneAssets(t);
    const cleaned = JSON.stringify(t) !== before;
    // A legacy top-level card name (or anything else unknown) is dropped by rebuilding the object above.
    const extraKeys = Object.keys(raw).some((k) => !['version', 'card', 'sidedness', 'sides', 'page', 'assets'].includes(k));
    const missingPrintMethod = !isObj(raw.page) || raw.page.printMethod !== t.page.printMethod;
    return { ok: true, template: t, changed: version !== TEMPLATE_VERSION || repaired > 0 || cleaned || extraKeys || missingPrintMethod };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, reason: 'invalid', error: `The template could not be read: ${e.message}.` };
    throw e;
  }
}
