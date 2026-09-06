const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { game } = require('./game-harness.cjs');

test('pause button freezes the entire run, effects and power timers; Continue retains the run and song', () => {
  const g = game('?mode=daily&track=2');
  const calls = { suspend: 0, resume: 0, restart: 0 };
  g.context.calls = calls;
  vm.runInContext(`
    audio.suspend = () => { calls.suspend++; return Promise.resolve(); };
    audio.resume = () => { calls.resume++; return Promise.resolve(); };
    trackMusic = { start: () => { calls.restart++; return Promise.resolve('playing'); }, stop() {} };
    musicStarted = true;
    game.powerUps.star = 10; game.powerUps.slow = 8; game.powerUps.double = 6;
    game.effects.push({x:100,y:120,life:1,text:'+250',color:'#fff'});
    game.flash = 1; game.bombFlash = .5;
  `, g.context);
  g.step();
  const state = () => vm.runInContext(`JSON.stringify({
    score:game.score,distance:game.distance,elapsed:game.elapsed,energy:game.energy,
    radius:game.ringRadius,offset:game.ringOffset,powers:game.powerUps,effects:game.effects,
    flash:game.flash,bombFlash:game.bombFlash
  })`, g.context);
  const before = state();
  g.get('#pause-game').click();
  assert.equal(g.get('#pause').classList.contains('hidden'), false);
  assert.equal(g.get('#resume-game').focused, true);
  assert.equal(g.get('#pause-game').disabled, true);
  assert.equal(g.get('#slider').classList.contains('hidden'), true);
  const target = { closest: () => null };
  for (const fn of g.listeners.get('pointerdown')) fn({target,clientX:100});
  for (const fn of g.listeners.get('pointermove')) fn({clientX:250});
  for (let i = 0; i < 120; i++) g.step(.5);
  assert.equal(state(), before);
  assert.equal(calls.suspend, 1);
  g.get('#resume-game').click();
  assert.equal(calls.resume > 0, true);
  assert.equal(calls.restart, 0);
  assert.equal(g.get('#pause').classList.contains('hidden'), true);
  assert.equal(g.get('#pause-game').disabled, false);
  g.step();
  assert.notEqual(state(), before);
  assert.equal(g.storage.get('thread-daily-attempts-2'), '1');
});

test('a backgrounded run stays paused until explicitly resumed, and pause Home returns to the title', () => {
  const g = game('?mode=generated&seed=PAUSE2026');
  const app = active => g.listeners.get('visibilitychange').forEach(fn => {
    g.context.document.hidden = !active; fn();
  });
  app(false);
  g.get('#resume-game').click();
  assert.equal(vm.runInContext('gamePaused', g.context), true);
  app(true);
  assert.equal(vm.runInContext('gamePaused', g.context), true);
  g.get('#pause-home').click();
  assert.equal(g.context.location.href, 'update-2-preview.html');
});

test('Escape pauses and resumes; finished games hide the pause button and replay restores it', () => {
  const g = game('?mode=generated&seed=PAUSE2026');
  const escape = () => g.listeners.get('keydown').forEach(fn => fn({key:'Escape',preventDefault(){}}));
  escape();
  assert.equal(vm.runInContext('gamePaused', g.context), true);
  escape();
  assert.equal(vm.runInContext('gamePaused', g.context), false);
  vm.runInContext('game.running=false;showResult(false)', g.context);
  assert.equal(g.get('#pause-game').hidden, true);
  g.get('#pause-game').click();
  assert.equal(vm.runInContext('gamePaused', g.context), false);
  g.get('#again').click();
  assert.equal(g.get('#pause-game').hidden, false);
});
