/* Storage.

   The program never touches localStorage directly. It talks to this interface,
   which has two back ends here — browser storage, and memory for the tests —
   and a third, the server, plugged in by core/server.js. */

const KEY_PREFIX = "fallaskoli.v5";
export const keyFor = (profile = "local") => `${KEY_PREFIX}.${profile}`;

const memoryDriver = () => {
  const m = new Map();
  return {
    name: "memory",
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async set(k, v) { m.set(k, v); },
    async remove(k) { m.delete(k); },
  };
};

const localDriver = () => ({
  name: "local",
  async get(k) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }
    catch { return null; }
  },
  async set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch { return false; }
  },
  async remove(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
});

export function pickDriver() {
  if (typeof localStorage !== "undefined") return localDriver();
  return memoryDriver();
}

/**
 * Debounced writer so a fast run of answers does not hammer storage.
 * `flush()` forces a write; call it before the page can go away.
 */
export function createStore(driver = pickDriver(), { key = keyFor } = {}) {
  /* The key is not always the same. In browser storage it needs a prefix so
     that two programs on one domain do not tread on each other; on a server the
     key IS the user's id and a prefix would only break the path. That is why it
     is a setting rather than a constant. */
  let timer = null, pending = null, pendingKey = null;

  const flush = async () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (pending == null) return;
    const [k, v] = [pendingKey, pending];
    pending = null; pendingKey = null;
    await driver.set(k, v);
  };

  return {
    driver: driver.name,
    async load(profile) { return driver.get(key(profile)); },
    save(profile, state, { immediate = false } = {}) {
      pendingKey = key(profile);
      pending = state;
      if (immediate) return flush();
      if (!timer) timer = setTimeout(flush, 600);
      return Promise.resolve();
    },
    flush,
    async clear(profile) { await driver.remove(key(profile)); },
    /** Whole-state export for moving between devices before there is a server. */
    exportJSON: (state) => JSON.stringify(state, null, 2),
    importJSON(text) {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") throw new Error("Ógild skrá");
      return parsed;
    },
  };
}
