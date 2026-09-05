const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { game } = require('./game-harness.cjs');
const run = game('?mode=generated&powers=000000');
const powers = run.context.ThreadPowerUps;
const random = seed => vm.runInContext(`seededRandom(${seed})`, run.context);
const seconds = y => 105 * Math.log1p(y / 5670);
const distance = time => 5670 * Math.expm1(time / 105);

function generate(mix, seed, duration = 600) {
  const state = powers.create(random(seed), mix);
  powers.extend(state, [{ y: distance(duration) + 260, kind: 'cherry' }]);
  return state.items;
}

test('all 4,096 mixes respect Off, produce enabled powers, and remain spaced', () => {
  const bounds = [null, [24, 32, 40, 60], [16, 22, 25, 40], [12, 16, 12, 18]];
  for (let code = 0; code < 4096; code++) {
    const mix = code.toString(4).padStart(6, '0'), items = generate(mix, 1234);
    const highest = Math.max(...mix.split('').map(Number));
    if (highest === 0) { assert.equal(items.length, 0); continue; }
    const [firstMin, firstMax, gapMin, gapMax] = bounds[highest];
    assert(items.length >= 10, mix);
    assert(seconds(items[0].y) >= firstMin && seconds(items[0].y) <= firstMax, mix);
    let previous;
    for (const item of items) {
      assert(+mix[powers.kinds.indexOf(item.kind)] > 0, `${mix} spawned a disabled ${item.kind}`);
      assert(Number.isFinite(item.y) && Number.isFinite(item.offset));
      assert(item.offset >= 92 && item.offset <= 110);
      const time = seconds(item.y);
      if (previous != null) assert(time - previous >= gapMin - 1e-8 && time - previous <= gapMax + 1e-8, mix);
      previous = time;
    }
    assert(600 - previous <= gapMax + 1e-8, `${mix} stopped generating`);
  }
});

test('Rare < Normal < Often for every power alone and alongside the other five', () => {
  for (let kind = 0; kind < 6; kind++) {
    for (const base of ['000000', '222222']) {
      const totals = [0, 0, 0, 0];
      for (let rate = 0; rate <= 3; rate++) {
        const mix = base.split(''); mix[kind] = String(rate);
        for (let seed = 0; seed < 100; seed++) {
          totals[rate] += generate(mix.join(''), seed).filter(item => item.kind === powers.kinds[kind]).length;
        }
      }
      assert.equal(totals[0], 0);
      assert(totals[1] > 0 && totals[2] > totals[1] * 1.3 && totals[3] > totals[2] * 1.3, `${powers.kinds[kind]} in ${base}: ${totals}`);
    }
  }
});

test('every timed-power overlap activates, expires, and updates countdowns without moving the player', () => {
  const kinds = Object.keys(powers.durations);
  for (let mask = 1; mask < 32; mask++) {
    const active = kinds.filter((kind, i) => mask & (1 << i));
    const play = game('?mode=generated&powers=000000');
    const evaluate = code => vm.runInContext(code, play.context);
    const positions = [], realShape = play.context.shape;
    play.context.shape = (...args) => { positions.push(args.slice(0, 2)); realShape(...args); };
    const ctx = play.get('#canvas').getContext('2d');
    let resets = 0;
    ctx.setTransform = () => { resets++; };
    evaluate(`game.nodes=Array(200).fill(0);game.ringOffset=100;game.energy=100;
      game.bonuses=[{kind:'cherry',y:1000000,side:1,offset:70}];
      game.powerUps.items=${JSON.stringify(active.map(kind => ({ kind, y: 1, side: 1, offset: 100 })))};
      lastHud=-1000;`);
    play.step(.02);
    for (const kind of active) {
      assert.equal(evaluate(`game.powerUps.${kind}`), powers.durations[kind]);
      assert.equal(play.get('#' + kind + '-timer').hidden, false);
    }
    for (const kind of kinds.filter(kind => !active.includes(kind))) assert.equal(play.get('#' + kind + '-timer').hidden, true);
    // Expire them one at a time to exercise changing combinations in the HUD.
    for (const kind of active) {
      evaluate(`game.powerUps.${kind}=.001;lastHud=-1000;`);
      const before = evaluate('game.distance');
      play.step(.02);
      assert.equal(evaluate(`game.powerUps.${kind}`), 0);
      assert.equal(play.get('#' + kind + '-timer').hidden, true);
      const delta = evaluate('game.distance') - before;
      assert(delta > 0 && delta <= (54 + before / 105) * .02 + 1e-8);
      assert.equal(evaluate('game.ringOffset'), 100);
      assert.equal(evaluate('game.running'), true);
      assert(Number.isFinite(evaluate('game.energy + game.score + game.ringRadius')));
    }
    assert.equal(resets, 0, 'activating/expiring powers must not resize or reset the canvas');
    assert(positions.every(point => point[0] === positions[0][0] && point[1] === positions[0][1]));
  }
});

test('blaster shots and magnet pulls finish smoothly after their timers expire', () => {
  const state = powers.create(random(42), '000000');
  state.blaster = .01;
  const bomb = { kind: 'bomb', y: 100 };
  const args = { dt: .001, bonuses: [bomb], distance: 0, ringX: 195, ringY: 500, range: 380, getX: () => 195 };
  powers.shoot(state, args);
  assert.equal(state.shots.length, 1);
  powers.tick(state, .02);
  assert.equal(state.blaster, 0);
  for (let step = 0; step < 15; step++) powers.shoot(state, { ...args, dt: .02 });
  assert.equal(bomb.blasted, true);
  assert.equal(state.shots.length, 0);
  state.magnet = .01;
  const fruit = { kind: 'cherry', y: 80 }, pull = { dt: .016, distance: 0, ringX: 195, ringY: 500, getX: () => 295 };
  powers.attract(state, [fruit], pull);
  const before = fruit.magnetX;
  powers.tick(state, .02);
  powers.attract(state, [fruit], pull);
  assert(fruit.magnetX < before && fruit.magnetX > 195, 'expiry must not snap the fruit back onto its course position');
  for (let step = 0; step < 25; step++) powers.attract(state, [fruit], pull);
  assert.equal(fruit.collected, true);
});
