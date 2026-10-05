/**
 * Where the app keeps its state between visits.
 *
 * IndexedDB is the primary backend: its quota is a share of the disk (Chrome up to
 * 60 % of it per origin, Firefox 10 % up to 10 GB, Safari ~1 GB before asking) rather
 * than localStorage's ~5 MB, and it stores structured values natively, so templates
 * with many pictures and large rosters fit comfortably. If IndexedDB cannot be
 * opened (some private-browsing modes, locked-down browsers) we fall back to
 * localStorage so the app still works.
 *
 * Both backends present the same tiny async key-value interface.
 */

export const KEYS = {
  template: 'template',
  dataset: 'dataset',
  /** Marker: the stored template is still the auto-generated starter. */
  pristine: 'template-pristine',
} as const;

/** Keys used by versions that stored everything in localStorage; migrated on first load. */
export const LEGACY_LOCAL_KEYS = {
  template: 'lanyard-maker:template:v1',
  dataset: 'lanyard-maker:dataset:v1',
  pristine: 'lanyard-maker:template:pristine',
} as const;

export interface KeyValueStorage {
  readonly name: 'indexeddb' | 'localstorage';
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

// ---------------------------------------------------------------------------
// IndexedDB
// ---------------------------------------------------------------------------
const DB_NAME = 'lanyard-maker';
const DB_VERSION = 1;
const STORE = 'kv';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open IndexedDB'));
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
}

class IndexedDbStorage implements KeyValueStorage {
  readonly name = 'indexeddb' as const;
  private db: IDBDatabase | null;

  constructor(db: IDBDatabase) {
    this.db = this.adopt(db);
  }

  /** If another tab upgrades the schema we must close; the next call reopens. */
  private adopt(db: IDBDatabase): IDBDatabase {
    db.onversionchange = () => {
      db.close();
      if (this.db === db) this.db = null;
    };
    db.onclose = () => {
      if (this.db === db) this.db = null;
    };
    return db;
  }

  private async tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = this.db ?? this.adopt(await openDatabase());
    this.db = db;
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      let result: T;
      try {
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => (result = req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
      } catch (e) {
        reject(e);
        return;
      }
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error ?? new Error('IndexedDB transaction failed'));
      t.onabort = () => reject(t.error ?? new Error('IndexedDB transaction aborted'));
    });
  }

  get<T>(key: string) {
    return this.tx<T | undefined>('readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
  }
  async set(key: string, value: unknown) {
    await this.tx('readwrite', (s) => s.put(value, key));
  }
  async remove(key: string) {
    await this.tx('readwrite', (s) => s.delete(key));
  }
  async clear() {
    await this.tx('readwrite', (s) => s.clear());
  }
}

// ---------------------------------------------------------------------------
// localStorage fallback (JSON strings under a prefix)
// ---------------------------------------------------------------------------
const LS_PREFIX = 'lanyard-maker:kv:';

class LocalStorageStorage implements KeyValueStorage {
  readonly name = 'localstorage' as const;
  async get<T>(key: string): Promise<T | undefined> {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (raw === null) return undefined;
    return JSON.parse(raw) as T;
  }
  async set(key: string, value: unknown) {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  }
  async remove(key: string) {
    localStorage.removeItem(LS_PREFIX + key);
  }
  async clear() {
    for (const k of Object.keys(localStorage)) if (k.startsWith(LS_PREFIX)) localStorage.removeItem(k);
  }
}

// ---------------------------------------------------------------------------
// Selection, migration, quota helpers
// ---------------------------------------------------------------------------

/** Open IndexedDB, or fall back to localStorage. Never throws. */
export async function openStorage(): Promise<KeyValueStorage> {
  if (typeof indexedDB !== 'undefined') {
    try {
      const db = await openDatabase();
      const s = new IndexedDbStorage(db);
      await s.get('__probe__'); // make sure reads actually work (some private modes open but fail)
      return s;
    } catch {
      /* fall through */
    }
  }
  return new LocalStorageStorage();
}

/**
 * Copy state saved by older versions (plain localStorage keys) into `storage`,
 * then remove the old copies. Returns true when something was migrated.
 */
export async function migrateLegacyLocalStorage(storage: KeyValueStorage): Promise<boolean> {
  let migrated = false;
  try {
    const readJson = (k: string): unknown => {
      const raw = localStorage.getItem(k);
      if (raw === null) return undefined;
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return undefined;
      }
    };
    const template = readJson(LEGACY_LOCAL_KEYS.template);
    const dataset = readJson(LEGACY_LOCAL_KEYS.dataset);
    const pristine = localStorage.getItem(LEGACY_LOCAL_KEYS.pristine) === '1';
    if (template !== undefined && (await storage.get(KEYS.template)) === undefined) {
      await storage.set(KEYS.template, template);
      if (pristine) await storage.set(KEYS.pristine, true);
      migrated = true;
    }
    if (dataset !== undefined && (await storage.get(KEYS.dataset)) === undefined) {
      await storage.set(KEYS.dataset, dataset);
      migrated = true;
    }
    for (const k of Object.values(LEGACY_LOCAL_KEYS)) localStorage.removeItem(k);
  } catch {
    /* localStorage unavailable – nothing to migrate */
  }
  return migrated;
}

export interface StorageEstimate {
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
}

/** How much the origin is using / may use, and whether the browser promised not to evict it. */
export async function estimateStorage(): Promise<StorageEstimate> {
  const out: StorageEstimate = { usage: null, quota: null, persisted: null };
  try {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      out.usage = e.usage ?? null;
      out.quota = e.quota ?? null;
    }
    if (navigator.storage?.persisted) out.persisted = await navigator.storage.persisted();
  } catch {
    /* unsupported */
  }
  return out;
}

/**
 * Ask the browser to treat this origin's storage as persistent (not evicted under
 * disk pressure). Chrome decides silently based on engagement; Firefox may prompt.
 * Call it after the user has put something worth keeping in – e.g. the first picture.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* unsupported */
  }
  return false;
}
