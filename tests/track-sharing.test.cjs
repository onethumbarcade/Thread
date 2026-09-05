const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const { game, gameScript, element } = require('./game-harness.cjs');
const base = 'https://onethumbarcade.github.io/Thread/update-2-preview.html';

function sharing(navigator = {}) {
  const context = vm.createContext({ navigator, URL, location: { href: base } });
  vm.runInContext(read('assets/track-sharing.js'), context);
  return context.ThreadTracks;
}

const snapshot = context => JSON.parse(vm.runInContext('JSON.stringify({nodes:game.nodes,pickups:game.pickups,bonuses:game.bonuses,shape:game.shapeOffset,shapes:game.shapeSequence})', context));

test('codes accept common paste formats and reject malformed input', () => {
  const tracks = sharing();
  for (const value of ['N3ON-4821', ' n3on-4821 ', 'n3on4821', 'n3on 4821', 'N3ON–4821']) {
    assert.equal(tracks.normalizeCode(value), 'N3ON-4821');
  }
  for (const value of ['', 'ABC-1234', 'ABCDE-1234', 'ABCD-123X', '<script>', 'N3ON-4821 EXTRA']) {
    assert.equal(tracks.normalizeCode(value), null);
  }
  assert.match(tracks.newCode(), /^[A-Z2-9]{4}-[1-9][0-9]{3}$/);
});

test('links identify an exact generated seed or archived daily track', () => {
  const tracks = sharing();
  assert.equal(tracks.trackUrl('generated', 'N3ON-4821'), 'https://onethumbarcade.github.io/Thread/index.html?mode=generated&seed=N3ON-4821');
  assert.equal(tracks.trackUrl('daily', 1, base + '?mode=generated&seed=OLD#fragment'), 'https://onethumbarcade.github.io/Thread/index.html?mode=daily&track=1');
});

test('native sharing, cancellation, and copy/manual fallbacks', async () => {
  const data = { title: 'THREAD', text: 'Track code: N3ON-4821', url: sharing().trackUrl('generated', 'N3ON-4821') };
  let received, copied;
  const clipboard = { writeText: async text => { copied = text; } };
  assert.equal(await sharing({ share: async payload => { received = payload; }, clipboard }).share(data), 'shared');
  assert.equal(received, data);
  assert.equal(copied, undefined);
  assert.equal(await sharing({ share: async () => { throw { name: 'AbortError' }; }, clipboard }).share(data), 'cancelled');
  assert.equal(copied, undefined);
  assert.equal(await sharing({ share: async () => { throw { name: 'NotAllowedError' }; }, clipboard }).share(data), 'copied');
  assert.equal(copied, data.text + '\n\n' + data.url);
  assert.equal(await sharing({ clipboard }).share(data), 'copied');
  assert.equal(await sharing({}).share(data), 'manual');
  assert.equal(await sharing({ clipboard: { writeText: async () => { throw Error('Denied'); } } }).share(data), 'manual');
});

test('code-entry loads the requested track and sharing uses that same code', async () => {
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); };
  get('#track-code-form').hidden = true;
  let copied;
  const context = vm.createContext({
    document: { querySelector: get }, location: { href: base },
    ThreadTracks: sharing({ clipboard: { writeText: async value => { copied = value; } } }),
  });
  vm.runInContext(read('assets/generated-track-menu.js'), context);
  const original = get('#seed').textContent;
  get('#enter-track-code').onclick();
  assert.equal(get('#track-code-form').hidden, false);
  get('#track-code-input').value = 'bad code';
  get('#track-code-form').onsubmit({ preventDefault() {} });
  assert.equal(get('#seed').textContent, original);
  assert.equal(get('#track-code-input')['aria-invalid'], 'true');
  assert(get('#track-code-error').textContent);
  get('#track-code-input').value = 'n3on 4821';
  get('#track-code-form').onsubmit({ preventDefault() {} });
  assert.equal(get('#seed').textContent, 'N3ON-4821');
  assert.equal(get('#track-code-form').hidden, true);
  assert.equal(get('#enter-track-code')['aria-expanded'], 'false');
  await get('#share-track').onclick();
  assert(copied.includes('Track code: N3ON-4821'));
  assert(copied.includes('index.html?mode=generated&seed=N3ON-4821'));
  assert(get('#track-status').textContent.includes('copied'));
  assert.equal(get('#share-track').disabled, false);
  get('#play-generated').onclick();
  assert.equal(context.location.href, sharing().trackUrl('generated', 'N3ON-4821'));
  get('#new-seed').onclick();
  assert.notEqual(get('#seed').textContent, 'N3ON-4821');
});

test('code sharing offers a selectable link when copying is unavailable', async () => {
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); };
  const context = vm.createContext({ document: { querySelector: get }, location: { href: base }, ThreadTracks: sharing() });
  vm.runInContext(read('assets/generated-track-menu.js'), context);
  await get('#share-track').onclick();
  assert.equal(get('#track-share-manual').hidden, false);
  assert.equal(get('#track-share-link').value, sharing().trackUrl('generated', get('#seed').textContent));
  assert.equal(get('#track-share-link').selected, true);
});

test('first load and retries retain the seeded course and daily identity', () => {
  for (const search of ['?mode=generated&seed=N3ON-4821', '?mode=daily&track=2']) {
    const run = game(search);
    const initial = snapshot(run.context);
    const expected = JSON.parse(vm.runInContext('JSON.stringify((g=>({nodes:g.nodes,pickups:g.pickups,bonuses:g.bonuses,shape:g.shapeOffset,shapes:g.shapeSequence}))(fresh(runSeed,dailyTrack?.startingShape||0,dailyTrack?.shapes||null)))', run.context));
    assert.deepEqual(initial, expected);
    run.get('#again').onclick();
    assert.deepEqual(snapshot(run.context), initial);
    if (search.includes('daily')) assert.equal(run.storage.get('thread-daily-attempts-2'), '2');
  }
  assert.notDeepEqual(snapshot(game('?mode=generated&seed=ABCD-1234').context), snapshot(game('?mode=generated&seed=EFGH-5678').context));
});

test('course continuation is independent of screen height and frame cadence', () => {
  const short = game('?mode=generated&seed=N3ON-4821', {}, 600);
  const tall = game('?mode=generated&seed=N3ON-4821', {}, 1200);
  const generation = gameScript.slice(gameScript.indexOf('          extend(g.nodes, g.distance + height * 2'), gameScript.indexOf('          g.speed = 54 +'));
  for (const [run, step] of [[short, 113], [tall, 809]]) {
    vm.runInContext(`{const g=game,dt=0; for(g.distance=0;g.distance<40000;g.distance+=${step}){${generation}}}`, run.context);
  }
  const a = snapshot(short.context), b = snapshot(tall.context);
  for (const key of ['nodes', 'pickups', 'bonuses']) {
    const count = Math.min(a[key].length, b[key].length);
    assert.deepEqual(a[key].slice(0, count), b[key].slice(0, count), key);
  }
});

test('post-game shares contain the exact played track and preserve scores', async () => {
  for (const [search, expected] of [['?mode=generated&seed=N3ON-4821', 'mode=generated&seed=N3ON-4821'], ['?mode=daily&track=2', 'mode=daily&track=2']]) {
    let payload;
    const run = game(search, { share: async data => { payload = data; } });
    vm.runInContext('game.score=51106;game.distance=34070;game.running=false;', run.context);
    const before = [...run.storage];
    await run.get('#share-score').onclick();
    assert(payload.url.endsWith(expected));
    assert(payload.text.includes('51,106'));
    assert(payload.text.includes(search.includes('daily') ? 'Daily Track #2' : 'Track code: N3ON-4821'));
    assert.equal(vm.runInContext('game.score', run.context), 51106);
    assert.deepEqual([...run.storage], before);
    assert.equal(run.get('#share-score').disabled, false);
  }
  const run = game('?mode=generated');
  await run.get('#share-score').onclick();
  const link = run.get('#score-share-link');
  assert.equal(run.get('#score-share-manual').hidden, false);
  assert.equal(link.selected, true);
  assert(sharing().normalizeCode(new URL(link.value).searchParams.get('seed')));
});
