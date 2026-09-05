(() => {
  // A completed run belongs to this history entry. Session storage also lets
  // the menu restore it when the browser discards the original game page.
  const key = 'thread-result', stateKey = 'threadResult';
  function valid(record) {
    try {
      const url = new URL(record.url), gameUrl = new URL('index.html', location.href);
      return record.version === 1 && typeof record.id === 'string' &&
        url.origin === gameUrl.origin && url.pathname === gameUrl.pathname &&
        url.searchParams.get('mode') === 'daily' &&
        Number(url.searchParams.get('track')) === record.track &&
        Number.isSafeInteger(record.track) && record.track > 0 &&
        ['score', 'distance', 'ringRadius', 'speed', 'elapsed', 'best'].every(
          field => Number.isFinite(record[field]) && record[field] >= 0) &&
        Number.isFinite(record.ringOffset) && typeof record.isBest === 'boolean' &&
        typeof record.ranking === 'string';
    } catch { return false; }
  }
  function stored(id) {
    try {
      const record = JSON.parse(sessionStorage.getItem(key));
      return valid(record) && record.id === id ? record : null;
    } catch { return null; }
  }
  function save(summary, previous) {
    const url = new URL(location.href);
    url.searchParams.delete('result');
    const record = { ...summary, version: 1, url: url.href,
      id: previous?.id || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}` };
    if (!valid(record)) return null;
    try { sessionStorage.setItem(key, JSON.stringify(record)); } catch {}
    try { history.replaceState({ ...history.state, [stateKey]: record }, ''); } catch {}
    return record;
  }
  function restore(track) {
    let entry;
    try { entry = history.state?.[stateKey]; } catch {}
    const requested = new URLSearchParams(location.search).get('result');
    const record = requested ? stored(requested) : valid(entry) ? stored(entry.id) || entry : null;
    return record?.track === track ? record : null;
  }
  function clear() {
    try { sessionStorage.removeItem(key); } catch {}
    try {
      const state = { ...history.state }, url = new URL(location.href);
      delete state[stateKey]; url.searchParams.delete('result');
      history.replaceState(state, '', url.href);
    } catch {}
  }
  function leaderboardUrl(record) {
    const url = new URL('update-2-preview.html', location.href);
    url.searchParams.set('view', 'leaderboard');
    url.searchParams.set('track', record.track);
    url.searchParams.set('from', 'result');
    url.searchParams.set('result', record.id);
    return url.href;
  }
  function back(id) {
    const record = stored(id);
    // Native Back preserves the game and also works with session storage
    // disabled, since the game history entry contains its own snapshot.
    try {
      const referrer = new URL(document.referrer), gameUrl = new URL('index.html', location.href);
      if (referrer.origin === gameUrl.origin && referrer.pathname === gameUrl.pathname &&
          referrer.searchParams.get('mode') === 'daily' && history.length > 1) {
        history.back(); return true;
      }
    } catch {}
    if (!record) return false;
    const url = new URL(record.url);
    url.searchParams.set('result', record.id);
    location.replace(url.href);
    return true;
  }
  globalThis.ThreadResultNavigation = { save, restore, clear, leaderboardUrl, back };
})();
