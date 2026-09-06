const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { game, gameScript } = require('./game-harness.cjs');
const rulesSource = fs.readFileSync(require('node:path').join(__dirname, '../assets/daily-tracks.js'), 'utf8');
function engine() {
  const context = vm.createContext({});
  vm.runInContext(rulesSource, context);
  return context.ThreadDaily;
}
const daily = engine();
const value = (run, expression) => vm.runInContext(expression, run.context);
const json = (run, expression) => JSON.parse(value(run, `JSON.stringify(${expression})`));
const generation = gameScript.slice(gameScript.indexOf('          extend(g.nodes, g.distance + height * 2'), gameScript.indexOf('          const pace ='));
function extend(run, increment = 113) {
  value(run, `{const g=game,dt=0;for(g.distance=0;g.distance<30000;g.distance+=${increment}){${generation}}}`);
}

test('published tracks retain their original course, items, shape order, size, speed, and music', () => {
  const original = {
    1: '767bed6da4f489ce01141cc88de9562487c8f12298481c20960f311973b5eb65',
    2: 'd414e0ce75fbf408debefc17abf109e14d24d51ef2277c549160808b40b16980',
  };
  for (const track of [1, 2]) {
    const run = game(`?mode=daily&track=${track}`, {}, 600); extend(run);
    const data = value(run, 'JSON.stringify({nodes:game.nodes,pickups:game.pickups,bonuses:game.bonuses,powers:game.powerUps.items,shapes:game.shapeSequence,size:game.ringRadius,speed:game.speed})');
    assert.equal(createHash('sha256').update(data).digest('hex'), original[track]);
    assert.equal(daily.getTrack(track).version, 1);
    assert.equal(daily.getTrack(track).musicIndex, track - 1);
  }
});

test('daily combinations are deterministic and include every shape, sequence length, pair, and frequency setting', () => {
  const other = engine(), single = new Set(), pairs = new Set(), lengths = new Set(), setups = new Set();
  const frequencies = Array.from({length:9}, () => new Set());
  const traits = Object.fromEntries(['startSize','startSpeed','accelerationDistance','levelScore','curveStrength','curveMemory','palette'].map(key => [key,new Set()]));
  let noPowers = false, noBonuses = false, repeated = false;
  for (let id = 3; id < 2003; id++) {
    const track = daily.getTrack(id), clone = JSON.parse(JSON.stringify(track));
    assert.deepEqual(JSON.parse(JSON.stringify(other.getTrack(String(id)))), clone);
    assert.equal(track.version, 2);
    assert.match(track.options.shapes, /^[0-3]{1,8}$/);
    assert.match(track.options.bonuses, /^[0-3]{3}$/);
    assert.match(track.options.powers, /^[0-3]{6}$/);
    assert.deepEqual([...track.palette].sort(), [0,1,2,3,4]);
    assert.ok(track.startSize >= 30 && track.startSize <= 40);
    assert.ok(track.startSpeed >= 48 && track.startSpeed <= 54);
    assert.ok(track.accelerationDistance >= 105 && track.accelerationDistance <= 125);
    lengths.add(track.shapes.length);
    if (track.shapes.length === 1) single.add(track.options.shapes);
    if (track.shapes.length === 2) pairs.add(track.options.shapes);
    if (track.shapes.length > 2 && /([0-3])\1/.test(track.options.shapes)) repeated = true;
    [...track.options.bonuses + track.options.powers].forEach((rate,i) => frequencies[i].add(rate));
    noPowers ||= track.options.powers === '000000'; noBonuses ||= track.options.bonuses === '000';
    for (const key of Object.keys(traits)) traits[key].add(JSON.stringify(track[key]));
    setups.add(JSON.stringify(track.options));
    // A caller cannot mutate a future replay's settings.
    track.options.powers = 'invalid'; track.shapes.push(9);
    assert.deepEqual(JSON.parse(JSON.stringify(daily.getTrack(id))), clone);
  }
  assert.equal(single.size, 4); assert.equal(pairs.size, 16); assert.equal(lengths.size, 8);
  assert.ok(pairs.has('13'), 'Circle → Triangle is possible');
  assert.ok(repeated && noPowers && noBonuses);
  assert.ok(setups.size > 1980);
  for (const rates of frequencies) assert.deepEqual([...rates].sort(), ['0','1','2','3']);
  for (const [key, values] of Object.entries(traits)) assert.ok(values.size >= 5, key);
});

test('static shapes, alternating pairs, and repeated shapes render correctly through level changes', () => {
  for (const id of [35, 5, 11, 20, 98, 3]) {
    const rules = daily.getTrack(id), run = game(`?mode=daily&track=${id}`);
    assert.equal(value(run, 'game.ringRadius'), rules.startSize);
    assert.equal(value(run, 'game.speed'), rules.startSpeed);
    const rendered = [], original = run.context.shape;
    run.context.shape = (...args) => { rendered.push(args[3]); original(...args); };
    for (let level = 1; level <= 16; level++) {
      value(run, `game.nodes=Array(200).fill(0);game.score=${(level-1)*rules.levelScore};game.energy=100;game.ringOffset=0;`);
      run.step();
      assert.equal(rendered.at(-1), rules.shapes[(level-1)%rules.shapes.length]);
      assert.equal(value(run,'game.stage'),level);
    }
    if (rules.shapes.length === 1) assert.match(rules.description, /every level/);
  }
});

test('daily gameplay uses its own item mix and stays identical across devices, retries, and continuation batches', () => {
  for (const id of [3, 53, 98, 670]) {
    const rules = daily.getTrack(id);
    const a = game(`?mode=daily&track=${id}`, {}, 600);
    const b = game(`?mode=daily&track=${id}&powers=000000&bonuses=000&shapes=0`, {}, 1200, {
      width:768, storage:{'thread-track-options':JSON.stringify({shapes:'0',bonuses:'333',powers:'333333'})},
    });
    assert.deepEqual(json(a,'runOptions'), { ...JSON.parse(JSON.stringify(rules.options)), levelScore: rules.levelScore });
    assert.deepEqual(json(b,'runOptions'), json(a,'runOptions'));
    const initial = json(a,'({nodes:game.nodes,pickups:game.pickups,bonuses:game.bonuses})');
    extend(a,113); extend(b,809);
    assert.deepEqual(json(a,'game.nodes.slice(0,340)'),json(b,'game.nodes.slice(0,340)'));
    for (const field of ['pickups','bonuses','powerUps.items']) {
      assert.deepEqual(json(a,`game.${field}.filter(item=>item.y<30000)`),json(b,`game.${field}.filter(item=>item.y<30000)`));
    }
    const bonuses = json(a,'game.bonuses'), orbs = json(a,'game.pickups'), powers = json(a,'game.powerUps.items');
    assert.equal(orbs.length === 0,rules.options.bonuses[0] === '0');
    assert.equal(bonuses.filter(item=>item.kind!=='bomb').length === 0,rules.options.bonuses[1] === '0');
    assert.equal(bonuses.filter(item=>item.kind==='bomb').length === 0,rules.options.bonuses[2] === '0');
    const kinds = ['star','blaster','magnet','slow','double','energy'];
    powers.forEach(item=>assert.notEqual(rules.options.powers[kinds.indexOf(item.kind)],'0'));
    if (rules.options.powers === '000000') assert.equal(powers.length,0);
    a.get('#again').onclick();
    assert.deepEqual(json(a,'({nodes:game.nodes,pickups:game.pickups,bonuses:game.bonuses})'),initial);
  }
});

test('new daily music composes a repeatable score per track instead of a seven-song rotation', () => {
  const run = game('?mode=daily&track=3'), music = run.context.ThreadDailyMusic, songs = new Set();
  for (let id = 3; id < 67; id++) {
    const rules = daily.getTrack(id), score = music.generatedArrangement(rules.musicSeed);
    assert.deepEqual(score,music.generatedArrangement(daily.getTrack(id).musicSeed));
    assert.notDeepEqual(score,music.generatedArrangement(daily.getTrack(id+7).musicSeed));
    songs.add(JSON.stringify(score.profile));
  }
  assert.equal(songs.size,64);
});
