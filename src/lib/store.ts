import { createMemo, createSignal, batch } from 'solid-js';
import { createStore, produce, reconcile, unwrap } from 'solid-js/store';
import type { Dataset, PreviewSource, SideDesign, SideId, Sidedness, Template, TemplateElement } from './types';
import { columnsUsedBy, columnsUsedByDesign, defaultTemplate, internAsset, unusedAssetIds } from './template';
import { cloneSideDesign, createBlankSide, normalizeEditableSide } from './sides';
import { parseTemplate, type ParseResult } from './template-migrations';
import { extremeRows } from './stats';
import { KEYS, type KeyValueStorage, migrateLegacyLocalStorage, openStorage, requestPersistentStorage } from './storage';

// ---------------------------------------------------------------------------
// Persistence backend (IndexedDB, or localStorage when that is unavailable)
// ---------------------------------------------------------------------------
let storage: KeyValueStorage | null = null;
const [storageName, setStorageName] = createSignal<KeyValueStorage['name'] | null>(null);
export { storageName };

/**
 * Set when the state could not be written to storage (quota exhausted, storage
 * blocked…). The UI shows a warning so the user knows to export the template
 * instead of relying on auto-save.
 */
const [persistError, setPersistError] = createSignal<string | null>(null);
export { persistError };

/**
 * Set when the saved template could not be opened at startup. The original is kept
 * under `KEYS.recovery` (and in memory) so it can be downloaded; if even that backup
 * failed, template auto-save stays off so the original is not overwritten.
 */
export interface StartupNotice {
  message: string;
  /** Auto-save of the template is paused to protect the unreadable original. */
  savingPaused: boolean;
}
const [startupNotice, setStartupNotice] = createSignal<StartupNotice | null>(null);
export { startupNotice };
let unreadableTemplate: unknown = undefined;
let templateWritesBlocked = false;

export function dismissStartupNotice() {
  setStartupNotice(null);
}

/** Save the stored template that could not be opened as a file, exactly as it was found. */
export function downloadUnreadableTemplate() {
  if (unreadableTemplate === undefined) return;
  const blob = new Blob([JSON.stringify(unreadableTemplate, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'unreadable-template.lanyard.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function describeWriteError(what: string, e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? '';
  const where = storage?.name === 'indexeddb' ? 'the browser database' : 'browser storage';
  if (/quota/i.test(name)) return `${what} could not be saved: ${where} is full.`;
  return `${what} could not be saved to ${where} (${name || 'unknown error'}).`;
}

async function write(key: string, value: unknown, what: string): Promise<boolean> {
  if (!storage) return false;
  if (key === KEYS.template && templateWritesBlocked) return false;
  try {
    await storage.set(key, value);
    setPersistError(null);
    return true;
  } catch (e) {
    setPersistError(describeWriteError(what, e));
    return false;
  }
}

function isDataset(x: unknown): x is Dataset {
  const d = x as Dataset | null;
  return !!d && typeof d === 'object' && Array.isArray(d.headers) && Array.isArray(d.rows) && typeof d.fileName === 'string';
}

// ---------------------------------------------------------------------------
// Dataset
// ---------------------------------------------------------------------------
const [dataset, setDatasetRaw] = createSignal<Dataset | null>(null);
export { dataset };

/** True until the user edits the template; while pristine, loading a CSV re-generates the starter design from its headers. */
let templatePristine = true;

export function setDataset(ds: Dataset | null) {
  setDatasetRaw(ds);
  if (ds) {
    void write(KEYS.dataset, ds, 'The roster');
    if (templatePristine) {
      batch(() => {
        docGeneration++;
        setTemplateStore(reconcile(defaultTemplate(ds.headers), { key: 'id' }));
        setActiveSideRaw('front');
        setSelectedId(null);
      });
      void write(KEYS.template, structuredClone(unwrap(template)), 'The template');
      void storage?.set(KEYS.pristine, true).catch(() => undefined);
    }
  } else {
    void storage?.remove(KEYS.dataset).catch(() => undefined);
  }
}

export const headers = createMemo(() => dataset()?.headers ?? []);
export const rows = createMemo(() => dataset()?.rows ?? []);

// ---------------------------------------------------------------------------
// Template (fine-grained store)
// ---------------------------------------------------------------------------
const [template, setTemplateStore] = createStore<Template>(defaultTemplate());
export { template };

/** True once persisted state has been loaded (the app renders after this). */
const [ready, setReady] = createSignal(false);
export { ready };

/** Keep an unreadable stored template safe before anything can replace it. */
async function preserveUnreadable(raw: unknown, result: Extract<ParseResult, { ok: false }>) {
  unreadableTemplate = raw;
  let backedUp = false;
  try {
    await storage?.set(KEYS.recovery, { savedAt: new Date().toISOString(), reason: result.reason, error: result.error, template: raw });
    backedUp = !!storage;
  } catch {
    backedUp = false;
  }
  templateWritesBlocked = !backedUp;
  setStartupNotice({
    message: backedUp
      ? `Your saved template could not be opened, so the default design was loaded. ${result.error} The original was kept and can be downloaded.`
      : `Your saved template could not be opened and a backup copy could not be made, so auto-saving the template is paused to avoid overwriting it. ${result.error} Download the original, or use Export JSON to keep new work.`,
    savingPaused: !backedUp,
  });
}

/**
 * Open storage, migrate anything saved by older versions, and load the saved
 * template and roster. Call once before rendering; never rejects.
 */
export async function initStore(): Promise<void> {
  try {
    storage = await openStorage();
    setStorageName(storage.name);
    await migrateLegacyLocalStorage(storage);
    const [storedTemplate, storedDataset, pristine] = await Promise.all([
      storage.get(KEYS.template).catch(() => undefined),
      storage.get(KEYS.dataset).catch(() => undefined),
      storage.get<boolean>(KEYS.pristine).catch(() => undefined),
    ]);
    const parsed = storedTemplate === undefined ? null : parseTemplate(storedTemplate);
    if (parsed && !parsed.ok) await preserveUnreadable(storedTemplate, parsed);
    batch(() => {
      if (parsed?.ok) {
        docGeneration++;
        setTemplateStore(reconcile(parsed.template, { key: 'id' }));
        // Templates saved by older versions are written back in the current format, only after they parsed.
        if (parsed.changed) void write(KEYS.template, structuredClone(parsed.template), 'The template');
      }
      if (isDataset(storedDataset)) setDatasetRaw(storedDataset);
      templatePristine = storedTemplate === undefined || pristine === true;
      setActiveSideRaw('front');
      setTab(dataset() ? 'design' : 'data');
    });
  } catch {
    // Storage is unusable: run in memory only and say so.
    setPersistError('Your browser does not allow this site to store data; changes will be lost when you close the tab.');
  } finally {
    setReady(true);
  }
}

let persistTimer: number | undefined;
function schedulePersist() {
  if (templatePristine) {
    templatePristine = false;
    void storage?.remove(KEYS.pristine).catch(() => undefined);
  }
  if (persistTimer) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(flushPersist, 300);
}

/**
 * Store an uploaded picture once (identical content → same reference) and return
 * the `asset:` reference to put on an element. Not recorded in the undo history on
 * its own; the element change that follows is. An asset nothing ends up using is
 * pruned at the next save.
 */
export function internImage(dataUrl: string): string {
  let ref = dataUrl;
  setTemplateStore(
    produce((t) => {
      ref = internAsset(t.assets, dataUrl);
    }),
  );
  schedulePersist();
  return ref;
}

/** Drop stored pictures that no stored design (front or a retained back) refers to any more. */
function pruneUnusedAssets() {
  const ids = unusedAssetIds(unwrap(template));
  if (ids.length === 0) return;
  setTemplateStore(
    produce((t) => {
      for (const id of ids) delete t.assets[id];
    }),
  );
}

let persistedPictures = false;

/** Write the template to storage right now (normally debounced to keep dragging cheap). */
export function flushPersist(): Promise<boolean> {
  if (!persistTimer) return Promise.resolve(true);
  window.clearTimeout(persistTimer);
  persistTimer = undefined;
  pruneUnusedAssets();
  const snapshot = structuredClone(unwrap(template));
  // The first time pictures are saved, ask the browser to keep this site's data safe from eviction.
  if (!persistedPictures && Object.keys(snapshot.assets).length > 0) {
    persistedPictures = true;
    void requestPersistentStorage();
  }
  return write(KEYS.template, snapshot, 'The template');
}

// Don't lose the last edit if the page is closed or reloaded inside the debounce window.
// (An IndexedDB transaction started here still commits in current browsers.)
window.addEventListener('pagehide', () => void flushPersist());
window.addEventListener('beforeunload', () => void flushPersist());

// ---------------------------------------------------------------------------
// Which side is being edited
// ---------------------------------------------------------------------------
const [activeSideRaw, setActiveSideRaw] = createSignal<SideId>('front');

/** The side the editor shows. Only `different` has an editable back; otherwise this is always the front. */
export const activeSide = createMemo<SideId>(() => normalizeEditableSide(template, activeSideRaw()));

/** Switch the side being edited (navigation only: no undo entry). Clears the selection when the side changes. */
export function setActiveSide(side: SideId) {
  const next = normalizeEditableSide(template, side);
  if (next !== activeSide()) setSelectedId(null);
  setActiveSideRaw(next);
}

/** The stored design the editor is working on. */
export const activeDesign = createMemo<SideDesign>(() => template.sides[activeSide()] ?? template.sides.front);

// ---------------------------------------------------------------------------
// Guarding asynchronous edits (image uploads)
// ---------------------------------------------------------------------------
/** Changes whenever the whole template is replaced (import, reset, starter regenerated, startup load). */
let docGeneration = 0;
/** Changes whenever a side's contents are replaced wholesale (cleared, copied over, restored by undo/redo). */
const sideGeneration: Record<SideId, number> = { front: 0, back: 0 };
const latestRequest = new Map<string, number>();
let requestCounter = 0;

/**
 * Call before starting an asynchronous edit (reading an uploaded file) aimed at
 * one side; `key` names the target (element + property). The returned function
 * says whether the result may still be applied: false once the document was
 * replaced, the side cleared or restored, the target side removed, or a newer
 * request for the same target started. Switching the visible side does not
 * invalidate it – the edit still lands on the side it was started for.
 */
export function beginAsyncEdit(side: SideId, key: string): () => boolean {
  const doc = docGeneration;
  const gen = sideGeneration[side];
  const id = `${side}:${key}`;
  const req = ++requestCounter;
  latestRequest.set(id, req);
  return () => doc === docGeneration && gen === sideGeneration[side] && latestRequest.get(id) === req && !!template.sides[side];
}

export function findElement(side: SideId, id: string): TemplateElement | undefined {
  return template.sides[side]?.elements.find((e) => e.id === id);
}

// ---------------------------------------------------------------------------
// Undo history: whole-template snapshots plus where the change happened
// ---------------------------------------------------------------------------
interface HistoryEntry {
  template: Template;
  /** The side whose content the change affected; revealed again on undo/redo. */
  side: SideId;
  selectedId: string | null;
}

const [undoStack, setUndoStack] = createSignal<HistoryEntry[]>([]);
const [redoStack, setRedoStack] = createSignal<HistoryEntry[]>([]);
const MAX_HISTORY = 80;

function snapshot(): Template {
  return structuredClone(unwrap(template));
}

/** Record the current state so the next change (to `side`, by default the one being edited) can be undone. */
export function commit(side: SideId = activeSide()) {
  setUndoStack((s) => [...s.slice(-(MAX_HISTORY - 1)), { template: snapshot(), side, selectedId: selectedId() }]);
  setRedoStack([]);
}

/** Apply a mutation to the template. `record` = push an undo entry first (default true). */
export function updateTemplate(fn: (t: Template) => void, record = true, side?: SideId) {
  if (record) commit(side);
  setTemplateStore(produce(fn));
  schedulePersist();
}

/** Mutate one stored design. A side that does not exist is left alone (never created by a late callback). */
export function updateSide(side: SideId, fn: (design: SideDesign) => void, record = true) {
  if (!template.sides[side]) return;
  updateTemplate(
    (t) => {
      const d = t.sides[side];
      if (d) fn(d);
    },
    record,
    side,
  );
}

/** Mutate one element of one stored design; ignored when it no longer exists there. */
export function updateElement<T extends TemplateElement>(side: SideId, id: string, fn: (el: T) => void, record = true) {
  if (!findElement(side, id)) return;
  updateSide(
    side,
    (d) => {
      const el = d.elements.find((e) => e.id === id) as T | undefined;
      if (el) fn(el);
    },
    record,
  );
}

/**
 * Replace the whole template with a stored/imported one of any known version.
 * Nothing changes (template, selection, history) when it cannot be read; the
 * failure is returned for the caller to report.
 */
export function replaceTemplate(raw: unknown, record = true): ParseResult {
  const result = parseTemplate(raw);
  if (!result.ok) return result;
  batch(() => {
    if (record) commit();
    docGeneration++;
    setTemplateStore(reconcile(result.template, { key: 'id' }));
    setActiveSideRaw('front');
    setSelectedId(null);
  });
  schedulePersist();
  return result;
}

function sideJson(t: Template, side: SideId): string {
  return JSON.stringify(t.sides[side]);
}

/** Put a history snapshot back and reveal the side it affected. */
function restore(entry: HistoryEntry) {
  const current = unwrap(template);
  for (const side of ['front', 'back'] as const) {
    if (sideJson(current, side) !== sideJson(entry.template, side)) sideGeneration[side]++;
  }
  setTemplateStore(reconcile(entry.template, { key: 'id' }));
  const side = normalizeEditableSide(template, entry.side);
  setActiveSideRaw(side);
  setSelectedId(entry.selectedId && template.sides[side]?.elements.some((e) => e.id === entry.selectedId) ? entry.selectedId : null);
}

export function undo() {
  const stack = undoStack();
  if (stack.length === 0) return;
  const prev = stack[stack.length - 1];
  batch(() => {
    // The inverse entry carries the popped entry's side, not whatever tab is visible now.
    setRedoStack((r) => [...r, { template: snapshot(), side: prev.side, selectedId: selectedId() }]);
    setUndoStack(stack.slice(0, -1));
    restore(prev);
  });
  schedulePersist();
}

export function redo() {
  const stack = redoStack();
  if (stack.length === 0) return;
  const next = stack[stack.length - 1];
  batch(() => {
    setUndoStack((u) => [...u, { template: snapshot(), side: next.side, selectedId: selectedId() }]);
    setRedoStack(stack.slice(0, -1));
    restore(next);
  });
  schedulePersist();
}

export const canUndo = () => undoStack().length > 0;
export const canRedo = () => redoStack().length > 0;

// ---------------------------------------------------------------------------
// Sides: mode changes and whole-side actions (each one undo step)
// ---------------------------------------------------------------------------
/**
 * Change how many faces the badge has. Choosing different sides for the first
 * time starts the back as a copy of the front; a back saved earlier is restored
 * untouched. Leaving `different` keeps the back stored for later.
 */
export function setSidedness(mode: Sidedness) {
  if (mode === template.sidedness) return;
  const needsBack = mode === 'different' && !template.sides.back;
  const newBack = needsBack ? cloneSideDesign(unwrap(template.sides.front)) : null;
  batch(() => {
    updateTemplate((t) => {
      if (newBack) t.sides.back = newBack;
      t.sidedness = mode;
    });
    if (newBack) sideGeneration.back++;
    setSelectedId(null);
    setActiveSideRaw(mode === 'different' ? 'back' : 'front');
  });
}

/** Replace the independent back with a fresh copy of the front. */
export function copyFrontToBack() {
  if (template.sidedness !== 'different') return;
  const copy = cloneSideDesign(unwrap(template.sides.front));
  batch(() => {
    updateTemplate((t) => (t.sides.back = copy), true, 'back');
    sideGeneration.back++;
    setSelectedId(null);
    setActiveSideRaw('back');
  });
}

/** Empty the independent back: white background, no picture, no layers. */
export function clearBack() {
  if (template.sidedness !== 'different') return;
  batch(() => {
    updateTemplate((t) => (t.sides.back = createBlankSide()), true, 'back');
    sideGeneration.back++;
    setSelectedId(null);
    setActiveSideRaw('back');
  });
}

// Small debugging/testing hook: `lanyardMaker.getTemplate()` in the console.
declare global {
  interface Window {
    lanyardMaker: {
      getTemplate: () => Template;
      getDataset: () => Dataset | null;
      getEditor: () => { activeSide: SideId; selectedId: string | null };
      flushPersist: () => Promise<boolean>;
      storage: {
        name: () => KeyValueStorage['name'] | null;
        get: (key: string) => Promise<unknown>;
        set: (key: string, value: unknown) => Promise<void>;
        remove: (key: string) => Promise<void>;
        clear: () => Promise<void>;
      };
      keys: typeof KEYS;
    };
  }
}
window.lanyardMaker = {
  getTemplate: () => structuredClone(unwrap(template)),
  getDataset: () => dataset(),
  getEditor: () => ({ activeSide: activeSide(), selectedId: selectedId() }),
  flushPersist,
  storage: {
    name: () => storage?.name ?? null,
    get: (key) => (storage ? storage.get(key) : Promise.resolve(undefined)),
    set: (key, value) => (storage ? storage.set(key, value) : Promise.resolve()),
    remove: (key) => (storage ? storage.remove(key) : Promise.resolve()),
    clear: () => (storage ? storage.clear() : Promise.resolve()),
  },
  keys: KEYS,
};

// ---------------------------------------------------------------------------
// Selection & preview state
// ---------------------------------------------------------------------------
export const [selectedId, setSelectedId] = createSignal<string | null>(null);
/** The selected layer, looked up in the design being edited only. */
export const selectedElement = createMemo(() => activeDesign().elements.find((e) => e.id === selectedId()) ?? null);

export const [previewSource, setPreviewSource] = createSignal<PreviewSource>({ type: 'median' });
export const [ignoreEmpty, setIgnoreEmpty] = createSignal(true);

/** Columns the printed output reads from, in a stable order (front first, then extra back columns). */
export const usedColumns = createMemo(() => columnsUsedBy(template));

/** Columns the design on the canvas reads from. */
export const activeColumns = createMemo(() => columnsUsedByDesign(activeDesign()));

/** Synthetic shortest/median/longest rows. Each column is independent, so both faces can share them. */
export const extremes = createMemo(() => extremeRows(rows(), usedColumns(), ignoreEmpty()));

/** Placeholder row when there is no data yet: shows column names in braces. */
export const placeholderRow = createMemo(() => {
  const r: Record<string, string> = {};
  for (const c of usedColumns()) r[c] = `{${c}}`;
  return r;
});

export const previewRow = createMemo(() => {
  const src = previewSource();
  const rs = rows();
  if (rs.length === 0) return placeholderRow();
  switch (src.type) {
    case 'row':
      return rs[Math.min(src.index, rs.length - 1)];
    case 'shortest':
      return extremes().shortest;
    case 'median':
      return extremes().median;
    case 'longest':
      return extremes().longest;
  }
});

/** Columns in the data that the template does not use yet (handy for the "insert field" menu). */
export const unusedColumns = createMemo(() => headers().filter((h) => !usedColumns().includes(h)));

/** Columns the template references that do not exist in the loaded data. */
export const missingColumns = createMemo(() => {
  const hs = headers();
  if (hs.length === 0) return [];
  return usedColumns().filter((c) => !hs.includes(c));
});

export type Tab = 'data' | 'design' | 'print';
export const [tab, setTab] = createSignal<Tab>('data');
