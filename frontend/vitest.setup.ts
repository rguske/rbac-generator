import '@testing-library/jest-dom/vitest';

// Node 22+'s experimental global `localStorage` (which throws/returns undefined
// without a --localstorage-file flag) shadows jsdom's real implementation in
// this vitest environment, since `window === globalThis` here. Real browsers
// always have a working localStorage, so this in-memory polyfill only exists
// to unblock tests — it doesn't reflect a production concern.
const localStorageStore = new Map<string, string>();
const localStoragePolyfill: Storage = {
  getItem: (key) => (localStorageStore.has(key) ? localStorageStore.get(key)! : null),
  setItem: (key, value) => {
    localStorageStore.set(key, String(value));
  },
  removeItem: (key) => {
    localStorageStore.delete(key);
  },
  clear: () => {
    localStorageStore.clear();
  },
  key: (index) => Array.from(localStorageStore.keys())[index] ?? null,
  get length() {
    return localStorageStore.size;
  },
};
Object.defineProperty(globalThis, 'localStorage', {
  value: localStoragePolyfill,
  configurable: true,
  writable: true,
});
