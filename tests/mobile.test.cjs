const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { game } = require('./game-harness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('native preferences keep identity and settings across launches without browser data', async () => {
  const { createStorage } = await import('../mobile/storage.mjs');
  let value = null;
  const preferences = { async get() { return { value }; }, async set(data) { value = data.value; } };
  const first = await createStorage(preferences);
  assert.equal(first.getItem('thread-player-token'), null);
  first.setItem('thread-player-token', 'installation-1');
  first.setItem('thread-settings', JSON.stringify({ music: false }));
  first.setItem('thread-daily-attempts-2', 4);
  await first.flush();
  const second = await createStorage(preferences);
  assert.equal(second.getItem('thread-player-token'), 'installation-1');
  assert.equal(second.getItem('thread-daily-attempts-2'), '4');
  assert.deepEqual(JSON.parse(second.getItem('thread-settings')), { music: false });
  second.removeItem('thread-daily-attempts-2'); await second.flush();
  assert.equal((await createStorage(preferences)).getItem('thread-daily-attempts-2'), null);
});
test('native persistence serializes overlapping writes and surfaces failed saves', async () => {
  const { createStorage } = await import('../mobile/storage.mjs');
  let value = null, release;
  const preferences = { async get() { return { value }; }, set(data) {
    return new Promise(resolve => { release = () => { value = data.value; resolve(); }; });
  } };
  const storage = await createStorage(preferences);
  storage.setItem('thread-player-token', 'a');
  await tick(); storage.setItem('thread-player-token', 'b');
  release(); await tick(); release(); await storage.flush();
  assert.equal(JSON.parse(value)['thread-player-token'], 'b');
  preferences.set = async () => { throw Error('disk unavailable'); };
  storage.setItem('thread-player-token', 'c'); await tick();
  await assert.rejects(storage.flush(), /disk unavailable/);
  preferences.get = async () => ({ value: '{broken' });
  await assert.rejects(createStorage(preferences));
});
test('app share links carry the complete mix and only open valid tracks', async () => {
  const { sharedTrackUrl, localTrackUrl } = await import('../mobile/links.mjs');
  const source = 'https://localhost/index.html?mode=generated&seed=N3ON-4821&powers=012301&shapes=13&bonuses=210&levelScore=17000&result=private';
  const link = sharedTrackUrl(source);
  assert.match(link, /^onethumbarcade-thread:\/\/play\?/);
  assert(!link.includes('localhost')); assert(!link.includes('result'));
  const restored = new URL(localTrackUrl(link, 'capacitor://localhost/update-2-preview.html', 2));
  assert.equal(restored.protocol, 'capacitor:');
  const legacy = new URL(localTrackUrl('onethumbarcade-thread://play?mode=generated&seed=N3ON-4821', 'https://localhost/', 2));
  assert.equal(legacy.searchParams.get('levelScore'), '20000');
  for (const key of ['mode', 'seed', 'powers', 'shapes', 'bonuses', 'levelScore']) {
    assert.equal(restored.searchParams.get(key), new URL(source).searchParams.get(key));
  }
  assert.equal(localTrackUrl('onethumbarcade-thread://play?mode=daily&track=2', 'https://localhost/', 2), 'https://localhost/index.html?mode=daily&track=2');
  for (const bad of ['https://evil.test/?mode=daily&track=2', 'onethumbarcade-thread://evil?mode=daily&track=2',
    'onethumbarcade-thread://play?mode=daily&track=3', 'onethumbarcade-thread://play?mode=daily&track=-1',
    'onethumbarcade-thread://play?mode=generated&seed=N3ON-4821&levelScore=9000',
    'onethumbarcade-thread://play?mode=generated&seed=N3ON-4821&levelScore=31000',
    'onethumbarcade-thread://play?mode=generated&seed=N3ON-4821&levelScore=16001',
    'onethumbarcade-thread://play?mode=generated&seed=N3ON-4821&powers=bad']) {
    assert.equal(localTrackUrl(bad, 'https://localhost/', 2), null);
  }
});
test('switching away freezes the run until Continue without adding an attempt or restarting music', () => {
  let suspended = 0;
  const g = game('?mode=daily&track=2');
  vm.runInContext('audio.suspend=()=>{globalThis.didSuspend();return Promise.resolve()}',
    Object.assign(g.context, { didSuspend() { suspended++; } }));
  g.step();
  const snapshot = () => vm.runInContext('JSON.stringify([game.score,game.distance,game.energy,game.elapsed,game.powerUps.star])', g.context);
  const before = snapshot();
  for (const listener of g.listeners.get('thread:app-state')) listener({ detail: { isActive: false } });
  assert.equal(g.get('#pause').classList.contains('hidden'), false);
  assert.equal(g.get('#slider').classList.contains('hidden'), true);
  g.step(10); assert.equal(snapshot(), before); assert(suspended > 0);
  for (const listener of g.listeners.get('thread:app-state')) listener({ detail: { isActive: true } });
  g.step(10); assert.equal(snapshot(), before);
  g.get('#resume-game').click(); g.step();
  assert.notEqual(snapshot(), before);
  assert.equal(g.get('#pause').classList.contains('hidden'), true);
  assert.equal(g.storage.get('thread-daily-attempts-2'), '1');
});
test('Android Back pauses a running game and returns a finished run home', () => {
  const g = game('?mode=generated&seed=N3ON-4821');
  g.get('#options-overlay').classList.add('hidden');
  assert.equal(g.context.ThreadAppBack(), true);
  assert.equal(g.get('#pause').classList.contains('hidden'), false);
  g.context.ThreadAppBack();
  assert.equal(g.get('#pause').classList.contains('hidden'), true);
  vm.runInContext('game.running=false', g.context);
  g.context.ThreadAppBack();
  assert.equal(g.context.location.href, 'update-2-preview.html');
});
test('native sharing and navigation use the native adapters', async () => {
  const calls = [], context = vm.createContext({ URL, location: { href: 'capacitor://localhost/' },
    ThreadNative: { isNative: true, navigate: url => calls.push(['navigate', url]),
      shareUrl: () => 'onethumbarcade-thread://play?mode=daily&track=2',
      async share(data) { calls.push(['share', data.url]); return 'shared'; } },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/track-sharing.js'), 'utf8'), context);
  const tracks = context.ThreadTracks, url = tracks.trackUrl('daily', 2);
  tracks.navigate(url);
  assert.equal(await tracks.share({ url: tracks.shareUrl(url) }), 'shared');
  assert.deepEqual(calls, [['navigate', 'capacitor://localhost/index.html?mode=daily&track=2'],
    ['share', 'onethumbarcade-thread://play?mode=daily&track=2']]);
});
