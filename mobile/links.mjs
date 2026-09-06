export const SCHEME = 'onethumbarcade-thread:';

export function sharedTrackUrl(value) {
  const original = new URL(value), url = new URL(`${SCHEME}//play`);
  for (const key of ['mode', 'track', 'seed', 'powers', 'shapes', 'bonuses', 'levelScore']) {
    if (original.searchParams.has(key)) url.searchParams.set(key, original.searchParams.get(key));
  }
  return url.href;
}

export function localTrackUrl(value, base, today) {
  try {
    const incoming = new URL(value);
    if (incoming.protocol !== SCHEME || incoming.hostname !== 'play' || incoming.pathname && incoming.pathname !== '/') return null;
    const params = incoming.searchParams, mode = params.get('mode');
    const url = new URL('index.html', base);
    if (mode === 'daily') {
      const track = Number(params.get('track'));
      if (!Number.isSafeInteger(track) || track < 1 || track > today) return null;
      url.searchParams.set('mode', 'daily'); url.searchParams.set('track', track);
    } else if (mode === 'generated') {
      const code = (params.get('seed') || '').toUpperCase();
      if (!/^[A-Z0-9]{4}-[0-9]{4}$/.test(code)) return null;
      url.searchParams.set('mode', 'generated'); url.searchParams.set('seed', code);
      for (const [key, pattern] of [['powers', /^[0-3]{6}$/], ['shapes', /^[0-3]{1,8}$/], ['bonuses', /^[0-3]{3}$/], ['levelScore', /^(?:[12][0-9]|30)000$/]]) {
        const value = params.get(key);
        if (value !== null && !pattern.test(value)) return null;
        // Shared links never borrow the recipient's custom settings.
        url.searchParams.set(key, value ?? { powers: '222222', shapes: '0123', bonuses: '222', levelScore: '20000' }[key]);
      }
    } else return null;
    return url.href;
  } catch { return null; }
}
