const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { game, gameScript } = require('./game-harness.cjs');
const value = (run, expression) => vm.runInContext(expression, run.context);
const json = (run, expression) => JSON.parse(value(run, `JSON.stringify(${expression})`));

test('daily rules agree with the game and include fixed triangles and varied rotations', () => {
  const starts = new Set(), rotations = new Set();
  for (let day = 1; day <= 8; day++) {
    const run = game(`?mode=daily&track=${day}`);
    const rules = json(run, 'ThreadDaily.getTrack(runTrack)');
    assert.equal(value(run, 'game.shapeOffset'), rules.startingShape);
    assert.deepEqual(json(run, 'game.shapeSequence'), rules.shapes);
    assert.deepEqual(json(run, 'ThreadDaily.getTrack(runTrack)'), rules);
    starts.add(rules.startingShape);
    rotations.add(rules.shapes.join(','));
    const shapes = [];
    const renderedShape = run.context.shape;
    run.context.shape = (...args) => { shapes.push(args[3]); renderedShape(...args); };
    for (let level = 1; level <= 10; level++) {
      value(run, `game.score=${(level - 1) * 20000};game.energy=100;game.ringOffset=0;`);
      run.step();
      assert.equal(shapes.at(-1), rules.shapes[(level - 1) % rules.shapes.length]);
    }
    if (day === 3) assert(shapes.every(shape => shape === 3), 'all triangle levels');
  }
  assert.equal(starts.size, 4);
  assert(rotations.size >= 6);
  const generated = game('?mode=generated&seed=N3ON-4821');
  assert.equal(value(generated, 'game.shapeSequence'), null);
});

test('power placement stays seeded across retries, heights, and extension cadence', () => {
  const short = game('?mode=daily&track=3', {}, 600), tall = game('?mode=daily&track=3', {}, 1200);
  const generation = gameScript.slice(gameScript.indexOf('          extend(g.nodes, g.distance + height * 2'), gameScript.indexOf('          const pace ='));
  for (const [run, step] of [[short, 113], [tall, 809]]) {
    value(run, `{const g=game,dt=0; for(g.distance=0;g.distance<40000;g.distance+=${step}){${generation}}}`);
  }
  const a = json(short, 'game.powerUps.items'), b = json(tall, 'game.powerUps.items');
  const count = Math.min(a.length, b.length);
  assert(count > 3);
  assert.deepEqual(a.slice(0, count), b.slice(0, count));
  for (const item of a) {
    assert(item.offset >= 92 && item.offset <= 110);
    if (item.kind === 'blaster') assert(value(short, `game.bonuses.some(b=>b.kind==='bomb'&&Math.abs(b.y-${item.y}-260)<.00001)`));
  }
  short.get('#again').onclick();
  short.step();
  const retry = json(short, 'game.powerUps.items');
  assert.deepEqual(retry, a.slice(0, retry.length));
  assert.equal(value(short, 'game.powerUps.star + game.powerUps.blaster + game.powerUps.shots.length'), 0);
});

test('off-track powers remain reachable at both edges and require a swerve', () => {
  const run = game('?mode=generated');
  const powers = run.context.ThreadPowerUps;
  for (const width of [280, 320, 390, 768]) {
    const center = width / 2, range = Math.min(width * .4, 190);
    for (let offset = -range; offset <= range; offset += 4) {
      for (const side of [-1, 1]) {
        const item = { side, offset: 110 };
        const x = powers.position(item, center + offset, center, range);
        assert(x >= center - range && x <= center + range);
        assert(Math.abs(x - center - offset) >= 92);
      }
    }
  }
  const item = {kind:'star',y:500,collected:false};
  const state = powers.create(() => .5); state.items=[{...item}];
  assert.equal(powers.collect(state, item.y, 3, 195, 72, () => 296).length, 0);
  const swerved = powers.create(() => .5);
  swerved.items=[{...item}];
  assert.equal(powers.collect(swerved, swerved.items[0].y, 3, 278, 24, () => 296).length, 1);
  assert.equal(swerved.star, 7);
});

test('star protects energy and size from bombs/off-track loss, then expires', () => {
  const run = game('?mode=generated&seed=N3ON-4821');
  value(run, `game.nodes=Array(200).fill(0); game.ringOffset=100;game.energy=40;game.ringRadius=34;
    lastHud=-1000;game.powerUps.star=.07;game.bonuses=[{kind:'bomb',y:1,side:1,offset:100,collected:false}];`);
  run.step();
  assert.equal(value(run, 'game.energy'), 40);
  assert.equal(value(run, 'game.ringRadius'), 34);
  assert.equal(value(run, 'game.bonuses[0].collected'), true);
  assert.equal(run.get('#star-timer').hidden, false);
  for (let i = 0; i < 6; i++) run.step();
  assert.equal(value(run, 'game.powerUps.star'), 0);
  assert(value(run, 'game.energy') < 40);
  assert(value(run, 'game.ringRadius') < 34);
  assert.equal(run.get('#star-timer').hidden, true);
});

test('a star collected on a bomb frame protects immediately', () => {
  const run = game('?mode=generated');
  value(run, `game.nodes=Array(200).fill(0);game.energy=40;game.ringOffset=100;
    game.powerUps.items=[{kind:'star',y:1,side:1,offset:100,collected:false}];
    game.bonuses=[{kind:'bomb',y:1,side:1,offset:100,collected:false}];`);
  run.step();
  assert.equal(value(run, 'game.energy'), 40);
  assert.equal(value(run, 'game.powerUps.star'), 7);
});

test('blaster fires at approaching bombs, destroys them, and leaves fruit alone', () => {
  const run = game('?mode=generated');
  value(run, `game.nodes=Array(200).fill(0);game.powerUps.blaster=12;
    game.bonuses=[{kind:'cherry',y:70,side:1,offset:30,collected:false},{kind:'bomb',y:100,side:1,offset:90,collected:false}];`);
  run.step();
  assert.equal(value(run, 'game.powerUps.shots.length'), 1);
  for (let i = 0; i < 16; i++) run.step();
  assert.equal(value(run, 'game.bonuses[1].blasted'), true);
  assert.equal(value(run, 'game.bonuses[0].collected'), false);
  assert.equal(value(run, 'game.energy'), 100);
  value(run, 'game.powerUps.blaster=.001;');
  run.step();
  assert.equal(value(run, 'game.powerUps.blaster'), 0);
  value(run, `game.bonuses=[{kind:'bomb',y:game.distance+60,side:1,offset:90,collected:false}];`);
  run.step();
  assert.equal(value(run, 'game.powerUps.shots.length'), 0);
  assert.equal(value(run, 'game.bonuses[0].collected'), false);
});

test('simultaneous powers refresh independently and retry clears both', () => {
  const run = game('?mode=daily&track=3');
  value(run, `game.powerUps.star=4;game.powerUps.blaster=2;game.powerUps.items=[{kind:'blaster',y:1,collected:false}];
    ThreadPowerUps.collect(game.powerUps,1,3,0,24,()=>0);`);
  assert.equal(value(run, 'game.powerUps.star'), 4);
  assert.equal(value(run, 'game.powerUps.blaster'), 12);
  run.get('#again').onclick();
  assert.equal(value(run, 'game.powerUps.star+game.powerUps.blaster'), 0);
  assert.equal(run.get('#star-timer').hidden, true);
  assert.equal(run.get('#blaster-timer').hidden, true);
});
