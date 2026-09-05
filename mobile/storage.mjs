const STATE_KEY = 'thread-state-v1';

// The game keeps synchronous reads; native preferences persist the same state
// across app launches. Navigation and API calls await pending writes.
export async function createStorage(preferences) {
  const { value } = await preferences.get({ key: STATE_KEY });
  const values = value ? JSON.parse(value) : {};
  if (!values || Array.isArray(values) || typeof values !== 'object' ||
      Object.entries(values).some(([key, item]) => !key.startsWith('thread-') || typeof item !== 'string')) {
    throw new Error('Invalid saved app state');
  }
  const cache = new Map(Object.entries(values));
  let revision = 0, saved = 0, writing;
  async function flush() {
    if (writing) { await writing; return flush(); }
    if (saved === revision) return;
    const current = revision, data = JSON.stringify(Object.fromEntries(cache));
    writing = preferences.set({ key: STATE_KEY, value: data });
    try { await writing; saved = current; } finally { writing = null; }
    return flush();
  }
  function changed() {
    revision++;
    queueMicrotask(() => { flush().catch(() => {}); });
  }
  return {
    getItem: key => cache.get(key) ?? null,
    setItem(key, value) {
      if (!key.startsWith('thread-')) throw new Error('Unsupported app storage key');
      const text = String(value);
      if (cache.get(key) === text) return;
      cache.set(key, text); changed();
    },
    removeItem(key) { if (cache.delete(key)) changed(); },
    flush,
  };
}
