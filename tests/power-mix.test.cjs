const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { game, element } = require('./game-harness.cjs');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const value = (run, code) => vm.runInContext(code, run.context);
const json = (run, code) => JSON.parse(value(run, `JSON.stringify(${code})`));

test('frequency controls support all six kinds, including off, with repeatable placement', () => {
  function generate(mix) {
    const run = game('?mode=generated&seed=N3ON-4821&powers=' + mix);
    value(run, `game.bonuses=Array.from({length:500},(_,i)=>({kind:i%3===0?'bomb':'cherry',y:400+i*350}));ThreadPowerUps.extend(game.powerUps,game.bonuses);`);
    return json(run, 'game.powerUps.items');
  }
  assert.deepEqual(generate('000000'), []);
  const normal = generate('222222');
  assert.equal(new Set(normal.map(item => item.kind)).size, 6);
  assert.deepEqual(generate('222222'), normal);
  for (let kind = 0; kind < 6; kind++) {
    const rare = '000000'.split(''), often = [...rare]; rare[kind] = '1'; often[kind] = '3';
    const a = generate(rare.join('')), b = generate(often.join(''));
    assert(a.length > 0);
    assert(b.length > a.length * 1.5, `${kind}: ${a.length} rare vs ${b.length} often`);
    assert.equal(new Set(b.map(item => item.kind)).size, 1);
  }
});

test('daily mix is shared, generated links carry their mix, and malformed mixes use defaults', async () => {
  const daily = game('?mode=daily&track=3&powers=000000');
  assert.equal(value(daily, 'runMix'), '222222');
  assert.equal(value(game('?mode=generated&powers=oops'), 'runMix'), '222222');
  let payload;
  const run = game('?mode=generated&seed=N3ON-4821&powers=301203', { share: async data => { payload = data; } });
  run.step();
  const initial = json(run, 'game.powerUps.items');
  await run.get('#share-score').onclick();
  assert.equal(new URL(payload.url).searchParams.get('powers'), '301203');
  const friend = game(new URL(payload.url).search); friend.step();
  assert.deepEqual(json(friend, 'game.powerUps.items'), initial);
  run.get('#again').onclick(); run.step();
  assert.deepEqual(json(run, 'game.powerUps.items'), initial);
  const normal = game('?mode=generated&seed=N3ON-4821'); normal.step();
  assert.deepEqual(json(normal, 'game.nodes'), json(run, 'game.nodes'));
  assert.equal(value(daily, `new URL(ThreadTracks.trackUrl('daily',3,location.href,'333333')).searchParams.has('powers')`), false);
});

test('magnet attracts fruit and orbs without pulling bombs, and double points multiplies rewards', () => {
  const run = game('?mode=generated&powers=000000');
  value(run, `game.nodes=Array(200).fill(0);game.ringOffset=100;
    game.powerUps.star=2;game.powerUps.magnet=2;game.powerUps.double=2;
    game.pickups=[{y:80,collected:false}];
    game.bonuses=[{kind:'cherry',y:80,side:1,offset:75,collected:false},{kind:'bomb',y:120,side:1,offset:100,collected:false}];`);
  for (let i = 0; i < 25; i++) run.step();
  assert.equal(value(run, 'game.pickups[0].collected'), true);
  assert.equal(value(run, 'game.bonuses[0].collected'), true);
  assert.equal(value(run, 'game.bonuses[1].magnetX'), undefined);
  assert.equal(value(run, 'game.bonuses[1].collected'), false);
  assert.equal(value(run, 'game.score'), 700);
  assert.equal(value(run, 'game.ringRadius'), 45);
  value(run, `game.powerUps.magnet=0;game.bonuses=[{kind:'cherry',y:game.distance+60,side:1,offset:30,collected:false}];`);
  run.step();
  assert.equal(value(run, 'game.bonuses[0].magnetX'), undefined);
});

test('all five timed powers overlap, tick in real time during slow motion, and reset on retry', () => {
  const run = game('?mode=generated&powers=000000');
  value(run, `game.nodes=Array(200).fill(0);lastHud=-1000;
    game.powerUps.star=2;game.powerUps.blaster=3;game.powerUps.magnet=4;game.powerUps.slow=5;game.powerUps.double=6;`);
  run.step(.02);
  assert(Math.abs(value(run, 'game.distance') - 54 * .6 * .02) < .00001);
  for (const [kind, time] of [['star',2],['blaster',3],['magnet',4],['slow',5],['double',6]]) {
    assert(Math.abs(value(run, `game.powerUps.${kind}`) - (time - .02)) < .00001);
    assert.equal(run.get('#' + kind + '-timer').hidden, false);
  }
  value(run, 'game.powerUps.slow=.001;'); run.step(.02);
  assert(value(run, 'game.speed') >= 54);
  run.get('#again').onclick();
  for (const kind of ['star','blaster','magnet','slow','double']) {
    assert.equal(value(run, `game.powerUps.${kind}`), 0);
    assert.equal(run.get('#' + kind + '-timer').hidden, true);
  }
});

test('double points boosts threading only while active', () => {
  const normal = game('?mode=generated&powers=000000'), doubled = game('?mode=generated&powers=000000');
  for (const run of [normal, doubled]) value(run, 'game.nodes=Array(200).fill(0);');
  value(doubled, 'game.powerUps.double=.03;');
  normal.step(.02); doubled.step(.02);
  assert.equal(value(doubled, 'game.score'), value(normal, 'game.score') * 2);
  const a = value(normal, 'game.score'), b = value(doubled, 'game.score');
  normal.step(.02); doubled.step(.02);
  assert(Math.abs((value(doubled, 'game.score') - b) - (value(normal, 'game.score') - a)) < .000001);
});

test('energy cells restore full health from any level and have no countdown', () => {
  for (const [before, after] of [[1,100],[40,100],[90,100],[100,100]]) {
    const run = game('?mode=generated&powers=000000');
    value(run, `game.nodes=Array(200).fill(0);game.ringOffset=100;game.energy=${before};game.powerUps.star=1;
      game.powerUps.items=[{kind:'energy',y:1,side:1,offset:100,collected:false}];`);
    run.step();
    assert.equal(value(run, 'game.energy'), after);
    assert.equal(value(run, 'game.powerUps.energy'), undefined);
  }
});

test('mix menu saves accessible slider values, resets defaults, and plays the chosen mix', () => {
  const run = game('?mode=generated&seed=N3ON-4821');
  const inputs = run.context.ThreadPowerUps.kinds.map(kind => {
    const input = run.get('mix-' + kind); input.dataset.powerRate = kind; return input;
  });
  run.context.document.querySelectorAll = selector => selector === '[data-power-rate]' ? inputs : [];
  vm.runInContext(read('assets/power-up-menu.js'), run.context);
  inputs[2].value='3'; inputs[2].oninput();
  assert.equal(run.storage.get('thread-power-mix'), '223222');
  assert.equal(inputs[2]['aria-valuetext'], 'Often');
  run.get('#play-power-mix').onclick();
  assert.equal(new URL(run.context.location.href).searchParams.get('powers'), '223222');
  assert.equal(new URL(run.context.location.href).searchParams.get('seed'), 'N3ON-4821');
  run.get('#reset-power-mix').onclick();
  assert.equal(run.storage.get('thread-power-mix'), '222222');
  assert(inputs.every(input => input.value === '2'));
  run.context.localStorage.setItem = () => { throw Error('Storage denied'); };
  inputs[0].value='0'; inputs[0].oninput();
  assert(run.get('#power-mix-status').textContent.includes('could not save'));
  run.get('#play-power-mix').onclick();
  assert.equal(new URL(run.context.location.href).searchParams.get('powers'), '022222');
});
