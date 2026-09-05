const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { game, gameScript } = require('./game-harness.cjs');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const value = (run, code) => vm.runInContext(code, run.context);
const json = (run, code) => JSON.parse(value(run, `JSON.stringify(${code})`));
function menu(navigator = {}) {
  const run = game('?mode=generated', navigator);
  run.context.location = { href: 'https://onethumbarcade.github.io/Thread/update-2-preview.html', search: '' };
  const powerInputs = run.context.ThreadPowerUps.kinds.map(kind => {
    const input = run.get('mix-' + kind); input.dataset.powerRate = kind; return input;
  });
  const bonusInputs = ['orb', 'fruit', 'bomb'].map(kind => {
    const input = run.get('bonus-' + kind); input.dataset.bonusRate = kind; return input;
  });
  run.context.document.querySelectorAll = selector => selector === '[data-power-rate]' ? powerInputs : selector === '[data-bonus-rate]' ? bonusInputs : [];
  run.get('#powerups [data-go="generate"]').onclick = () => { run.returnedToGenerate = true; };
  vm.runInContext(read('assets/power-up-menu.js'), run.context);
  vm.runInContext(read('assets/generated-track-menu.js'), run.context);
  return { ...run, powerInputs, bonusInputs };
}
function select(run, id, selected) { const input = run.get(id); input.value = selected; input.onchange({ target: input }); }
function rates(inputs, mix) { inputs.forEach((input,i)=>{ input.value=mix[i]; input.oninput(); }); }

test('customize → confirm → generate → play/share preserves every choice for a friend', async () => {
  let payload;
  const owner = menu({ share: async data => { payload = data; } }), href = owner.context.location.href;
  const oldCode = owner.get('#seed').textContent;
  select(owner, '#starting-shape', '3'); select(owner, '#shape-mode', 'fixed');
  rates(owner.bonusInputs, '030'); rates(owner.powerInputs, '300000');
  owner.get('#confirm-power-mix').onclick();
  assert.equal(owner.context.location.href, href);
  assert.equal(owner.get('#seed').textContent, oldCode);
  assert.equal(owner.get('#play-generated').disabled, true);
  assert.equal(owner.get('#share-track').disabled, true);
  owner.get('#play-generated').onclick();
  assert.equal(owner.context.location.href, href);
  owner.get('#new-seed').onclick();
  assert.notEqual(owner.get('#seed').textContent, oldCode);
  assert.equal(owner.get('#play-generated').disabled, false);
  assert(owner.get('#generated-rules').textContent.includes('Triangle every level'));
  assert(owner.get('#generated-rules').textContent.includes('Fruit: Often'));
  await owner.get('#share-track').onclick();
  const shared = new URL(payload.url);
  assert.equal(shared.searchParams.get('shapes'), '3');
  assert.equal(shared.searchParams.get('bonuses'), '030');
  assert.equal(shared.searchParams.get('powers'), '300000');
  owner.get('#play-generated').onclick();
  assert.equal(owner.context.location.href, payload.url);
  const a = game(shared.search, {}, 600);
  const b = game(shared.search, {}, 1200, { storage: { 'thread-track-options': JSON.stringify({ shapes: '0', bonuses: '303', powers: '000003' }) } });
  assert.deepEqual(json(a, 'runOptions'), { powers: '300000', shapes: '3', bonuses: '030' });
  assert.deepEqual(json(a, 'runOptions'), json(b, 'runOptions'));
  const generation = gameScript.slice(gameScript.indexOf('          extend(g.nodes, g.distance + height * 2'), gameScript.indexOf('          const pace ='));
  for (const [run, increment] of [[a,113],[b,809]]) value(run, `{const g=game,dt=0;for(g.distance=0;g.distance<30000;g.distance+=${increment}){${generation}}}`);
  for (const expression of ['game.nodes', 'game.pickups', 'game.bonuses', 'game.powerUps.items']) {
    const left = json(a, expression), right = json(b, expression), count = Math.min(left.length, right.length);
    assert.deepEqual(left.slice(0,count), right.slice(0,count), expression);
  }
  assert.equal(value(a, 'game.pickups.length'), 0);
  assert(json(a, 'game.bonuses').every(item => item.kind !== 'bomb'));
  assert(json(a, 'game.powerUps.items').every(item => item.kind === 'star'));
});

test('shape controls support fixed shapes and custom repeating orders, including repeats', () => {
  const editor = menu();
  select(editor, '#starting-shape', '3');
  select(editor, '#next-shape-0', '0'); select(editor, '#next-shape-1', '3');
  editor.get('[data-remove-shape="2"]').onclick();
  editor.get('#confirm-power-mix').onclick();
  assert.equal(editor.context.ThreadPowerUpMenu.getOptions().shapes, '303');
  editor.get('#add-shape').onclick(); select(editor, '#next-shape-2', '2');
  editor.get('#confirm-power-mix').onclick();
  assert.equal(editor.context.ThreadPowerUpMenu.getOptions().shapes, '3032');
  for (const sequence of ['0','1','2','3','3032','102','30123012']) {
    const run = game('?mode=generated&seed=N3ON-4821&shapes='+sequence+'&bonuses=000&powers=000000');
    const shapes = [], original = run.context.shape;
    run.context.shape = (...args) => { shapes.push(args[3]); original(...args); };
    for(let level=0;level<16;level++) {
      value(run, `game.nodes=Array(200).fill(0);game.ringOffset=0;game.energy=100;game.score=${level*20000};`);
      run.step();
      assert.equal(shapes.at(-1), +sequence[level%sequence.length]);
    }
  }
  select(editor, '#shape-mode', 'fixed');
  assert.equal(editor.get('#shape-sequence').hidden, true);
  editor.get('#confirm-power-mix').onclick();
  assert.equal(editor.context.ThreadPowerUpMenu.getOptions().shapes, '3');
  editor.get('#reset-power-mix').onclick(); editor.get('#confirm-power-mix').onclick();
  assert.deepEqual(JSON.parse(editor.storage.get('thread-track-options')), { powers:'222222', shapes:'0123', bonuses:'222' });
  assert([...editor.powerInputs,...editor.bonusInputs].every(input=>input.value==='2'&&input['aria-valuetext']==='Normal'));
});

test('all 64 collectible mixes honor Off and each frequency grows Rare < Normal < Often', () => {
  const run = game('?mode=generated&bonuses=000'), totals = Array.from({length:3},()=>[0,0,0,0]);
  const generate = (mix, seed) => {
    const state = run.context.ThreadCollectibles.create(kind=>value(run, `seededRandom(hashSeed('${seed}:${kind}'))`), mix);
    run.context.ThreadCollectibles.extend(state, 5670*Math.expm1(600/105));
    return [state.orbs, state.bonuses.filter(item=>item.kind!=='bomb'), state.bonuses.filter(item=>item.kind==='bomb')];
  };
  for(let code=0;code<64;code++) {
    const mix=code.toString(4).padStart(3,'0'), items=generate(mix,17);
    for(let kind=0;kind<3;kind++) {
      assert.equal(items[kind].length===0, mix[kind]==='0');
      assert(items[kind].every(item=>Number.isFinite(item.y)));
    }
  }
  for(let kind=0;kind<3;kind++) for(let rate=0;rate<4;rate++) for(let seed=0;seed<30;seed++) {
    const mix=[...'000'];mix[kind]=String(rate);
    totals[kind][rate]+=generate(mix.join(''),seed)[kind].length;
  }
  for(const counts of totals) assert(counts[0]===0&&counts[1]>0&&counts[2]>counts[1]*1.5&&counts[3]>counts[2]*1.5);
});

test('turning all collectibles off does not suppress powers; changing their rates preserves other streams', () => {
  const a=game('?mode=generated&seed=N3ON-4821&bonuses=000&powers=300000'); a.step();
  assert.equal(value(a,'game.pickups.length+game.bonuses.length'),0);
  assert(value(a,'game.powerUps.items.length')>0);
  const b=game('?mode=generated&seed=N3ON-4821&bonuses=333&powers=300000'); b.step();
  assert.deepEqual(json(a,'game.nodes'),json(b,'game.nodes'));
  assert.deepEqual(json(a,'game.powerUps.items'),json(b,'game.powerUps.items'));
  const c=game('?mode=generated&seed=N3ON-4821&bonuses=313&powers=000000'); c.step();
  assert.deepEqual(json(b,'game.pickups'),json(c,'game.pickups'));
  assert.deepEqual(json(b,"game.bonuses.filter(x=>x.kind==='bomb')"),json(c,"game.bonuses.filter(x=>x.kind==='bomb')"));
});

test('daily rules ignore custom shapes and collectibles, and malformed shared settings use defaults', () => {
  const a=game('?mode=daily&track=3'), b=game('?mode=daily&track=3&shapes=0&bonuses=000&powers=000000',{},844,{storage:{'thread-track-options':JSON.stringify({shapes:'0',bonuses:'333',powers:'333333'})}});
  for(const field of ['shapeSequence','pickups','bonuses','nodes']) assert.deepEqual(json(a,'game.'+field),json(b,'game.'+field));
  assert.deepEqual(json(b,'game.shapeSequence'),json(b,'dailyTrack.shapes'));
  assert.equal(value(b,'runMix'),value(b,'dailyTrack.options.powers'));
  assert.equal(value(b,'ThreadTrackOptions.describeFrequencies()'),'Growth Orbs: Normal · Fruit: Normal · Bombs: Normal. Power-ups: Normal.');
  assert.match(value(b,'ThreadTrackOptions.describeFrequencies(ThreadTrackOptions.read())'),/Growth Orbs: Often/);
  for(const shapes of ['', '4', '012301230', '<script>']) {
    const run=game('?mode=generated&shapes='+encodeURIComponent(shapes)+'&bonuses=bad&powers=no');
    assert.deepEqual(json(run,'runOptions'),{ powers:'222222', shapes:'0123', bonuses:'222' });
  }
});
