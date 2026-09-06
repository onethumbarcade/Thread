const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { game } = require('./game-harness.cjs');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function fixture(initial = {}, time = '2026-09-06T19:00:00Z') {
  const values = new Map(Object.entries(initial));
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  let clock = Date.parse(time);
  const context = vm.createContext({ localStorage: storage });
  for (const file of ['daily-tracks', 'progress']) vm.runInContext(read(`assets/${file}.js`), context);
  const create = (target = storage) => context.ThreadProgress.create({ storage: target, now: () => clock });
  const api = create();
  return { api, storage, values, create, today: () => context.ThreadDaily.today(clock),
    time(value) { clock = Date.parse(value); }, nextDay(n = 1) { clock += n * 86400000; },
    daily(track, summary = {}) { return api.finishRun(api.startRun('daily', track ?? context.ThreadDaily.today(clock)), { score: 1000, fruits: 0, ...summary }); } };
}
test('only completed current daily runs advance streaks; retries and restored runs cannot count twice', () => {
  const f = fixture();
  const abandoned = f.api.startRun('daily', f.today());
  assert.equal(f.api.snapshot().streak.current, 0);
  const run = f.api.startRun('daily', f.today());
  const first = f.api.finishRun(run, { score: 100, fruits: 3 });
  assert.equal(first.streak.current, 1);
  assert.equal(first.streak.playedToday, true);
  assert.deepEqual(plain(first.events.map(e => e.id)), ['first-thread']);
  assert.equal(f.api.finishRun(run, { score: 100, fruits: 3 }).recorded, false);
  assert.equal(f.create().finishRun(run, { score: 100, fruits: 3 }).fruits, 3);
  assert.equal(f.daily().streak.current, 1);
  assert.equal(f.daily(f.today() - 1).streak.current, 1);
  assert.equal(f.api.snapshot().completedTracks, 2);
  assert(!f.values.get('thread-progress-v1').includes(abandoned.id));
});
test('streaks bridge consecutive days, keep the best after a gap, and celebrate milestones once', () => {
  const f = fixture();
  for (let day = 1; day <= 7; day++) {
    const result = f.daily();
    assert.equal(result.streak.current, day);
    if (day === 3) assert(result.events.some(e => e.type === 'streak'));
    if (day === 7) assert.deepEqual(plain(result.events.map(e => e.id)), ['week-of-thread']);
    assert.equal(f.daily().events.length, 0);
    if (day < 7) f.nextDay();
  }
  f.nextDay();
  assert.equal(f.api.snapshot().streak.current, 7);
  assert.equal(f.api.snapshot().streak.playedToday, false);
  f.nextDay();
  assert.equal(f.api.snapshot().streak.current, 0);
  assert.equal(f.api.snapshot().streak.longest, 7);
  assert(f.api.snapshot().achievements.find(b => b.id === 'week-of-thread').unlocked);
  assert.equal(f.daily().streak.current, 1);
  assert.equal(f.api.snapshot().streak.longest, 7);
});
test('midnight and daylight saving use Pacific calendar dates; a run belongs to its start date', () => {
  const f = fixture({}, '2026-09-07T06:59:00Z');
  const oldDay = f.today(), run = f.api.startRun('daily', oldDay);
  f.time('2026-09-07T07:01:00Z');
  assert.equal(f.today(), oldDay + 1);
  const finished = f.api.finishRun(run, { score: 1000, fruits: 0 });
  assert.equal(finished.streak.current, 1);
  assert.equal(finished.streak.playedToday, false);
  assert.equal(f.daily(oldDay).streak.playedToday, false);
  assert.equal(f.daily().streak.current, 2);
  const fall = fixture({}, '2026-11-01T08:30:00Z');
  fall.daily(); fall.time('2026-11-01T09:30:00Z');
  assert.equal(fall.daily().streak.current, 1);
  fall.time('2026-11-02T08:01:00Z');
  assert.equal(fall.daily().streak.current, 2);
  const spring = fixture({}, '2027-03-13T20:00:00Z');
  spring.daily(); spring.time('2027-03-14T09:30:00Z');
  assert.equal(spring.daily().streak.current, 2);
  spring.time('2027-03-14T10:30:00Z');
  assert.equal(spring.daily().streak.current, 2);
});
test('badges distinguish daily levels, different archived tracks, and fruit in either mode', () => {
  const f = fixture({}, '2026-09-23T19:00:00Z');
  let result = f.api.finishRun(f.api.startRun('generated'), { score: 200000, fruits: 99 });
  assert.equal(result.achievements.filter(b => b.unlocked).length, 0);
  result = f.api.finishRun(f.api.startRun('generated'), { score: 100, fruits: 1 });
  assert.deepEqual(plain(result.events.map(e => e.id)), ['fruit-collector']);
  assert.equal(result.streak.current, 0);
  f.daily(3, { score: 95999 });
  assert.equal(f.api.snapshot().achievements.find(b => b.id === 'level-five').unlocked, false);
  result = f.daily(3, { score: 96000 });
  assert(result.events.some(e => e.id === 'level-five'));
  for (let track = 1; track <= 10; track++) f.daily(track);
  assert(f.api.snapshot().achievements.find(b => b.id === 'archive-explorer').unlocked);
  assert.equal(f.api.snapshot().completedTracks, 10);
  assert.equal(f.api.snapshot().streak.current, 0);
  assert.equal(f.daily(f.today() + 1, { fruits: 100 }).recorded, false);
  assert.equal(f.api.snapshot().fruits, 100);
});
test('saved daily scores unlock known badges without inventing past streaks or fruit totals', () => {
  const f = fixture({ 'thread-daily-1': '1234', 'thread-daily-2': '80000', 'thread-daily-attempts-3': '5' });
  const state = f.api.snapshot();
  assert.deepEqual(plain(state.achievements.filter(b => b.unlocked).map(b => b.id)), ['first-thread', 'level-five']);
  assert.equal(state.completedTracks, 2);
  assert.equal(state.streak.current, 0);
  assert.equal(state.fruits, 0);
  assert.equal(f.daily().events.length, 0);
  assert.equal(f.api.snapshot().completedTracks, 3);
});
test('progress survives relaunch, recovers from malformed data, and reports unavailable storage', () => {
  const f = fixture({ 'thread-progress-v1': '{broken' });
  const done = f.daily(undefined, { fruits: 4 });
  assert.equal(done.saved, true);
  assert.deepEqual(plain(f.create().snapshot()), plain(f.api.snapshot()));
  const blocked = f.create({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } });
  const run = blocked.startRun('daily', f.today());
  const result = blocked.finishRun(run, { score: 100, fruits: 5 });
  assert.equal(result.saved, false);
  assert.equal(result.fruits, 5);
  assert.equal(blocked.finishRun(run, { score: 100, fruits: 5 }).fruits, 5);
  const invalid = fixture({ 'thread-progress-v1': JSON.stringify({ fruits: -5, tracks: [1, 1, null, '2', -2], streakDays: 'bad', recentRuns: {}, unlocked: null }) });
  assert.equal(invalid.api.snapshot().fruits, 0);
  assert.equal(invalid.api.snapshot().completedTracks, 1);
});
test('game counts all fruit once, awards on game over, and retains progress across retry and summary restoration', () => {
  const run = game('?mode=daily&track=3');
  vm.runInContext("game.nodes=Array(200).fill(0);game.ringOffset=0;game.powerUps.double=10;['cherry','strawberry','banana','cake','orb'].forEach(kind=>collectReward(game,kind,0,0));", run.context);
  assert.equal(vm.runInContext('game.fruitsCollected', run.context), 4);
  assert.equal(run.context.ThreadProgress.snapshot().fruits, 0);
  vm.runInContext('game.energy=0;game.ringOffset=10000', run.context);
  run.step();
  assert.equal(run.context.ThreadProgress.snapshot().fruits, 4);
  const saved = run.storage.get('thread-progress-v1');
  run.step(); assert.equal(run.storage.get('thread-progress-v1'), saved);
  const restored = game('?mode=daily&track=3', {}, 844, { storage: Object.fromEntries(run.storage), history: run.history, session: run.session });
  assert.equal(restored.context.ThreadProgress.snapshot().fruits, 4);
  assert.equal(restored.get('#result-milestones').classList.contains('celebrate'), false);
  restored.get('#again').click();
  assert.equal(vm.runInContext('game.fruitsCollected', restored.context), 0);
  assert.equal(restored.context.ThreadProgress.snapshot().fruits, 4);
});
test('milestone sound and animation follow player preferences', () => {
  for (const enabled of [false, true]) {
    const run = game('?mode=generated&seed=N3ON-4821', {}, 844, { storage: { 'thread-settings': JSON.stringify({ sfx: enabled, reduced: !enabled, music: false }) } });
    let notes = 0;
    const original = run.context.tone;
    run.context.tone = (...args) => { notes++; original(...args); };
    vm.runInContext("game.fruitsCollected=100;game.energy=0;game.ringOffset=10000;", run.context);
    run.step();
    assert.equal(run.get('#result-milestones').hidden, false);
    assert.equal(run.get('#result-milestones').classList.contains('celebrate'), enabled);
    assert.equal(notes > 0, enabled);
  }
});
