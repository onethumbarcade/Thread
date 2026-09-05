const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { game } = require('./game-harness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const source = fs.readFileSync(path.join(__dirname, '../assets/result-navigation.js'), 'utf8');

function ranked() {
  const calls = { starts: [], finishes: [] };
  return { calls, api: {
    startRun(track) { calls.starts.push(track); return { track }; },
    async finishRun(session, result) { calls.finishes.push(result); return { yours: { rank: 3, score: 501 } }; },
  } };
}
async function completed(options = {}) {
  const rank = ranked();
  const g = game('?mode=daily&track=2', {}, 844, { ...options, leaderboard: rank.api });
  vm.runInContext('game.score=501;game.distance=246;game.energy=.01;game.ringOffset=10000', g.context);
  g.step(); await tick();
  return { ...g, rank };
}
test('a discarded game page restores the same summary without starting or submitting another run', async () => {
  const first = await completed();
  const record = first.history.state.threadResult;
  assert.equal(record.ranking, 'DAILY RANK #3 · GLOBAL BEST 501');
  for (const via of ['history', 'link']) {
    const rank = ranked();
    const restored = game('?mode=daily&track=2' + (via === 'link' ? '&result=' + record.id : ''), {}, 844, {
      leaderboard: rank.api, session: new Map(first.session), storage: Object.fromEntries(first.storage),
      ...(via === 'history' ? { history: { ...first.history } } : {}),
    });
    assert.equal(restored.get('#result').classList.contains('hidden'), false);
    assert.equal(restored.get('#start').classList.contains('hidden'), true);
    assert.equal(restored.get('#slider').classList.contains('hidden'), true);
    for (const id of ['#final-score', '#distance', '#result-best', '#result-ranking', '#new-best']) {
      assert.equal(restored.get(id).textContent, first.get(id).textContent, id);
    }
    assert.equal(restored.get('#new-best').classList.contains('show'), true);
    assert.equal(vm.runInContext('game.running', restored.context), false);
    assert.equal(restored.storage.get('thread-daily-attempts-2'), '1');
    restored.step(); restored.step();
    assert.deepEqual(rank.calls, { starts: [], finishes: [] });
    restored.get('#again').click();
    assert.deepEqual(rank.calls.starts, [2]);
    assert.equal(restored.storage.get('thread-daily-attempts-2'), '2');
    assert.equal(restored.history.state.threadResult, undefined);
    assert.equal(restored.session.has('thread-result'), false);
    assert.equal(restored.get('#result').classList.contains('hidden'), true);
  }
});
test('history restores a finished run when session storage is blocked', async () => {
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }, removeItem() { throw Error('blocked'); } };
  const first = await completed({ sessionStorage: blocked });
  const rank = ranked();
  const restored = game('?mode=daily&track=2', {}, 844, {
    sessionStorage: blocked, history: first.history, leaderboard: rank.api,
  });
  assert.equal(restored.get('#final-score').textContent, first.get('#final-score').textContent);
  assert.equal(rank.calls.starts.length, 0);
});
test('fresh launches and invalid or mismatched return links never resurrect an old run', async () => {
  const first = await completed();
  for (const query of ['?mode=daily&track=2', '?mode=daily&track=2&result=missing',
    '?mode=daily&track=1&result=' + first.history.state.threadResult.id]) {
    const rank = ranked();
    const fresh = game(query, {}, 844, { session: new Map(first.session), leaderboard: rank.api });
    assert.equal(vm.runInContext('game.running', fresh.context), true);
    assert.equal(rank.calls.starts.length, 1);
  }
});
function menuNavigation(session, referrer = '', length = 1) {
  let backs = 0, destination;
  const context = vm.createContext({ URL, URLSearchParams,
    location: { href: 'https://onethumbarcade.github.io/Thread/update-2-preview.html', replace(url) { destination = url; } },
    document: { referrer }, history: { length, back() { backs++; } },
    sessionStorage: { getItem: key => session.get(key) || null },
  });
  vm.runInContext(source, context);
  return { api: context.ThreadResultNavigation, get backs() { return backs; }, get destination() { return destination; } };
}
test('leaderboard Back uses the game history entry, with a restorable link as fallback', async () => {
  const first = await completed(), record = first.history.state.threadResult;
  const native = menuNavigation(new Map(), record.url, 3);
  assert.equal(native.api.back(record.id), true);
  assert.equal(native.backs, 1);
  const fallback = menuNavigation(first.session);
  assert.equal(fallback.api.back(record.id), true);
  const url = new URL(fallback.destination);
  assert.equal(url.pathname, '/Thread/index.html');
  assert.equal(url.searchParams.get('track'), '2');
  assert.equal(url.searchParams.get('result'), record.id);
  assert.equal(menuNavigation(new Map()).api.back('missing'), false);
  const corrupt = new Map([['thread-result', '{broken json']]);
  assert.equal(menuNavigation(corrupt).api.back(record.id), false);
});
test('restored summary refreshes ranking without submitting and ignores late replies after retry', async () => {
  const first = await completed();
  let resolve;
  const rank = ranked();
  rank.api.flush = async () => {};
  rank.api.board = () => new Promise(done => { resolve = done; });
  const restored = game('?mode=daily&track=2', {}, 844, {
    history: first.history, session: first.session, leaderboard: rank.api,
  });
  await tick();
  resolve({ yours: { rank: 4, score: 501 } }); await tick();
  assert.match(restored.get('#result-ranking').textContent, /DAILY RANK #4/);
  assert.equal(restored.history.state.threadResult.ranking, restored.get('#result-ranking').textContent);
  for (const listener of restored.listeners.get('pageshow')) listener({ persisted: true });
  await tick(); restored.get('#again').click();
  resolve({ yours: { rank: 5, score: 501 } }); await tick();
  assert.equal(restored.get('#result-ranking').textContent, '');
  assert.equal(restored.history.state.threadResult, undefined);
  assert.equal(rank.calls.finishes.length, 0);
});
