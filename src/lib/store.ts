import { createMemo, createSignal, batch } from 'solid-js';
import { createStore, produce, reconcile, unwrap } from 'solid-js/store';
import type { Dataset, PreviewSource, Template, TemplateElement } from './types';
import { columnsUsedBy, defaultTemplate, internAllImages, internAsset, pruneAssets, unusedAssetIds } from './template';
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

function describeWriteError(what: string, e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? '';
  const where = storage?.name === 'indexeddb' ? 'the browser database' : 'browser storage';
  if (/quota/i.test(name)) return `${what} could not be saved: ${where} is full.`;
  return `${what} could not be saved to ${where} (${name || 'unknown error'}).`;
}

async function write(key: string, value: unknown, what: string): Promise<boolean> {
  if (!storage) return false;
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
      setTemplateStore(reconcile(defaultTemplate(ds.headers), { key: 'id' }));
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
// Template (fine-grained store) + undo history
// ---------------------------------------------------------------------------
/** Accept a stored/imported template of any known version and bring it up to date. */
function sanitize(raw: unknown): Template {
  const t = raw as (Omit<Partial<Template>, 'version'> & { version?: number }) | null;
  if (!t || (t.version !== 1 && t.version !== 2) || !t.card || !t.page || !Array.isArray(t.elements)) return defaultTemplate();
  // Fill in any fields added since the template was saved.
  const d = defaultTemplate();
  const merged: Template = {
    ...d,
    ...t,
    version: 2,
    card: { ...d.card, ...t.card },
    page: { ...d.page, ...t.page },
    elements: t.elements.map((el) =>
      el.kind === 'image' ? { ...el, imageRule: el.imageRule ?? null, srcColumn: el.srcColumn ?? null } : el,
    ),
    assets: { ...(t.assets ?? {}) },
  };
  // v1 kept pictures inline as data URLs; move them into the asset store (deduplicated).
  internAllImages(merged);
  pruneAssets(merged);
  return merged;
}

const [template, setTemplateStore] = createStore<Template>(defaultTemplate());
export { template };

/** True once persisted state has been loaded (the app renders after this). */
const [ready, setReady] = createSignal(false);
export { ready };

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
    batch(() => {
      if (storedTemplate !== undefined) {
        const upgraded = sanitize(storedTemplate);
        setTemplateStore(reconcile(upgraded, { key: 'id' }));
        // Templates saved by older versions are written back in the current format.
        if ((storedTemplate as { version?: number }).version !== upgraded.version) void write(KEYS.template, upgraded, 'The template');
      }
      if (isDataset(storedDataset)) setDatasetRaw(storedDataset);
      templatePristine = storedTemplate === undefined || pristine === true;
      setTab(dataset() ? 'design' : 'data');
    });
  } catch {
    // Storage is unusable: run in memory only and say so.
    setPersistError('Your browser does not allow this site to store data; changes will be lost when you close the tab.');
  } finally {
    setReady(true);
  }
}

const [undoStack, setUndoStack] = createSignal<Template[]>([]);
const [redoStack, setRedoStack] = createSignal<Template[]>([]);
const MAX_HISTORY = 80;

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

/** Drop stored pictures that no element refers to any more. */
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

// Small debugging/testing hook: `lanyardMaker.getTemplate()` in the console.
declare global {
  interface Window {
    lanyardMaker: {
      getTemplate: () => Template;
      getDataset: () => Dataset | null;
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

function snapshot(): Template {
  return structuredClone(unwrap(template));
}

/** Record the current state so the next change can be undone. */
export function commit() {
  setUndoStack((s) => [...s.slice(-(MAX_HISTORY - 1)), snapshot()]);
  setRedoStack([]);
}

/** Apply a mutation to the template. `record` = push an undo entry first (default true). */
export function updateTemplate(fn: (t: Template) => void, record = true) {
  if (record) commit();
  setTemplateStore(produce(fn));
  schedulePersist();
}

export function replaceTemplate(t: Template, record = true) {
  if (record) commit();
  setTemplateStore(reconcile(sanitize(t), { key: 'id' }));
  schedulePersist();
}

export function undo() {
  const stack = undoStack();
  if (stack.length === 0) return;
  const prev = stack[stack.length - 1];
  batch(() => {
    setRedoStack((r) => [...r, snapshot()]);
    setUndoStack(stack.slice(0, -1));
    setTemplateStore(reconcile(prev, { key: 'id' }));
  });
  schedulePersist();
}

export function redo() {
  const stack = redoStack();
  if (stack.length === 0) return;
  const next = stack[stack.length - 1];
  batch(() => {
    setUndoStack((u) => [...u, snapshot()]);
    setRedoStack(stack.slice(0, -1));
    setTemplateStore(reconcile(next, { key: 'id' }));
  });
  schedulePersist();
}

export const canUndo = () => undoStack().length > 0;
export const canRedo = () => redoStack().length > 0;

export function updateElement<T extends TemplateElement>(id: string, fn: (el: T) => void, record = true) {
  updateTemplate((t) => {
    const el = t.elements.find((e) => e.id === id) as T | undefined;
    if (el) fn(el);
  }, record);
}

// ---------------------------------------------------------------------------
// Selection & preview state
// ---------------------------------------------------------------------------
export const [selectedId, setSelectedId] = createSignal<string | null>(null);
export const selectedElement = createMemo(() => template.elements.find((e) => e.id === selectedId()) ?? null);

export const [previewSource, setPreviewSource] = createSignal<PreviewSource>({ type: 'median' });
export const [ignoreEmpty, setIgnoreEmpty] = createSignal(true);

/** Columns referenced by the template, in a stable order (template order, then any leftover headers). */
export const usedColumns = createMemo(() => columnsUsedBy(template));

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
