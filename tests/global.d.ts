import type { Dataset, SideId, Template } from '../src/lib/types';
import type { KEYS, KeyValueStorage } from '../src/lib/storage';

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

export {};
