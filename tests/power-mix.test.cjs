const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { game } = require('./game-harness.cjs');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const value = (run, code) => vm.runInContext(code, run.context);
const json = (run, code) => JSON.parse(value(run, `JSON.stringify(${code})`));
function mixer(run) {
  const inputs = run.context.ThreadPowerUps.kinds.map(kind => {
    const input = run.get('mix-' + kind); input.dataset.powerRate = kind; return input;
  });
  run.context.document.querySelectorAll = selector => selector === '[data-power-rate]' ? inputs : [];
  run.get('#powerups [data-go="generate"]').onclick = () => { run.returnedToGenerate = (run.returnedToGenerate || 0) + 1; };
  vm.runInContext(read('assets/power-up-menu.js'), run.context);
  return inputs;
}

test('frequency controls support all six kinds, including off, with repeatable placement', () => {
  function generate(mix, seed = 'N3ON-4821') {
    const run = game('?mode=generated&seed=' + seed + '&powers=' + mix);
    value(run, `game.bonuses=Array.from({length:500},(_,i)=>({kind:i%3===0?'bomb':'cherry',y:400+i*350}));ThreadPowerUps.extend(game.powerUps,game.bonuses);`);
    return json(run, 'game.powerUps.items');
  }
  assert.deepEqual(generate('000000'), []);
  const normal = generate('222222');
  assert.equal(new Set(normal.map(item => item.kind)).size, 6);
  assert.deepEqual(generate('222222'), normal);
  for (let kind = 0; kind < 6; kind++) {
    const rare = '000000'.split(''), often = [...rare]; rare[kind] = '1'; often[kind] = '3';
    let a = 0, b = 0;
    const seen = new Set();
    for (let sample = 0; sample < 30; sample++) {
      a += generate(rare.join(''), `TEST-${1000 + sample}`).length;
      const frequent = generate(often.join(''), `TEST-${1000 + sample}`);
      b += frequent.length;
      frequent.forEach(item => seen.add(item.kind));
    }
    assert(a > 0);
    assert(b > a * 1.5, `${kind}: ${a} rare vs ${b} often`);
    assert.equal(seen.size, 1);
  }
});

test('pickups remain spaced at high speeds and independent of extension batches', () => {
  const run = game('?mode=generated');
  for (const mix of ['111111', '222222', '333333', '300000']) {
    value(run, `{
      const bonuses=Array.from({length:600},(_,i)=>({kind:i%3===0?'bomb':'cherry',y:400+i*350}));
      const full=ThreadPowerUps.create(seededRandom(9876),'${mix}');
      const chunks=ThreadPowerUps.create(seededRandom(9876),'${mix}');
      ThreadPowerUps.extend(full,bonuses);
      for(let n=37;n<bonuses.length;n+=37)ThreadPowerUps.extend(chunks,bonuses.slice(0,n));
      ThreadPowerUps.extend(chunks,bonuses);
      globalThis.spacingResult={full:full.items,chunks:chunks.items};
    }`);
    const {full,chunks} = json(run, 'spacingResult');
    assert(full.length > 3);
    assert.deepEqual(full, chunks);
    let previous = -Infinity;
    for (const item of full) {
      const seconds = 105 * Math.log1p(item.y / 5670);
      assert(seconds >= 12);
      assert(seconds - previous >= 8 - .00001);
      previous = seconds;
    }
  }
});

test('each of the six powers set to Often appears early and keeps returning across seeds', () => {
  const run = game('?mode=generated');
  for (const kind of [0, 1, 2, 3, 4, 5]) {
    const rates = [...'000000']; rates[kind] = '3';
    for (let seed = 0; seed < 50; seed++) {
      value(run, `{
        const state=ThreadPowerUps.create(seededRandom(${seed}),'${rates.join('')}');
        const bonuses=Array.from({length:500},(_,i)=>({kind:i%3===0?'bomb':'cherry',y:400+i*350}));
        ThreadPowerUps.extend(state,bonuses);
        globalThis.oftenItems=state.items;
      }`);
      const items = json(run, 'oftenItems');
      const times = items.map(item => 105 * Math.log1p(item.y / 5670));
      assert(times.length > 10);
      assert(times[0] >= 12 && times[0] <= 16, 'first pickup arrives in the opening 12–16 course seconds');
      assert(items.every(item => item.kind === run.context.ThreadPowerUps.kinds[kind]));
      for (let i = 1; i < times.length; i++) {
        const gap = times[i] - times[i - 1];
        assert(gap >= 12 - .00001 && gap <= 18 + .00001, 'Often has no empty pickup slots');
      }
    }
  }
});

test('confirming Star Often saves without launching, then Play This Track uses that mix', () => {
  const menu = game('?mode=generated&seed=CM6A-7118');
  const inputs = mixer(menu), before = menu.context.location.href;
  vm.runInContext(read('assets/generated-track-menu.js'), menu.context);
  menu.get('#seed').textContent = 'CM6A-7118';
  inputs.forEach((input, i) => { input.value = i === 0 ? '3' : '0'; input.oninput(); });
  menu.get('#confirm-power-mix').onclick();
  assert.equal(menu.context.location.href, before);
  assert.equal(menu.returnedToGenerate, 1);
  assert.equal(menu.get('#play-generated').disabled, true);
  menu.get('#new-seed').onclick();
  menu.get('#play-generated').onclick();
  const url = new URL(menu.context.location.href);
  assert.equal(url.searchParams.get('powers'), '300000');
  const run = game(url.search);
  assert.equal(value(run, 'runMix'), '300000');
  run.step();
  const initial = json(run, 'game.powerUps.items');
  const first = json(run, 'game.powerUps.items[0]');
  assert.equal(first.kind, 'star');
  // Advance a live game frame to when that first star enters the visible course.
  value(run, `game.distance=${first.y}-200;game.ringOffset=Math.min(width*.4,190)*Math.sin(angle(game.nodes,game.distance));`);
  run.step();
  assert.equal(value(run, 'game.running'), true);
  assert(json(run, 'game.powerUps.items').every(item => item.kind === 'star'));
  assert.equal(value(run, 'game.powerUps.items[0].resolved'), undefined);
  assert(value(run, 'game.powerUps.items[0].y-game.distance') > 0);
  assert(value(run, 'game.powerUps.items[0].y-game.distance') < 200);
  const friend = game(url.search); friend.step();
  assert.deepEqual(json(friend, 'game.powerUps.items'), initial);
  run.get('#again').onclick(); run.step();
  assert.deepEqual(json(run, 'game.powerUps.items'), initial);
});

test('daily mix is shared, generated links carry their mix, and malformed mixes use defaults', async () => {
  const daily = game('?mode=daily&track=3&powers=000000');
  assert.equal(value(daily, 'runMix'), value(daily, 'dailyTrack.options.powers'));
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

test('mix menu confirms accessible settings, resets all to Normal, and reports failed saves', () => {
  const run = game('?mode=generated&seed=N3ON-4821');
  const inputs = mixer(run), href = run.context.location.href;
  assert(inputs.every(input => input.value === '2' && input['aria-valuetext'] === 'Normal'));
  inputs[2].value='3'; inputs[2].oninput();
  assert.equal(run.storage.get('thread-power-mix'), undefined);
  assert.equal(run.context.ThreadPowerUpMenu.getMix(), '222222');
  assert.equal(inputs[2]['aria-valuetext'], 'Often');
  run.get('#confirm-power-mix').onclick();
  assert.equal(JSON.parse(run.storage.get('thread-track-options')).powers, '223222');
  assert.equal(run.context.ThreadPowerUpMenu.getMix(), '223222');
  assert.equal(run.context.location.href, href);
  assert.equal(run.returnedToGenerate, 1);
  run.get('#reset-power-mix').onclick();
  assert(inputs.every(input => input.value === '2' && input['aria-valuetext'] === 'Normal'));
  run.get('#confirm-power-mix').onclick();
  assert.equal(JSON.parse(run.storage.get('thread-track-options')).powers, '222222');
  assert.equal(run.returnedToGenerate, 2);
  run.context.localStorage.setItem = () => { throw Error('Storage denied'); };
  inputs[0].value='0'; inputs[0].oninput();
  run.get('#confirm-power-mix').onclick();
  assert(run.get('#power-mix-status').textContent.includes('could not save'));
  assert.equal(run.returnedToGenerate, 2);
  assert.equal(run.context.ThreadPowerUpMenu.getMix(), '222222');
  assert.equal(run.context.location.href, href);
});

test('saved mixes apply to generated links without powers, and explicit shared mixes take priority', () => {
  const options = { storage: { 'thread-power-mix': '300000' } };
  for (const [query, expected] of [
    ['?mode=generated&seed=ABCD-1234', '300000'],
    ['?mode=generated&seed=ABCD-1234&powers=030000', '030000'],
    ['?mode=daily&track=2', '222222'],
    ['?mode=daily&track=2&powers=300000', '222222'],
  ]) {
    const run = game(query, {}, 844, options);
    assert.equal(value(run, 'runMix'), expected);
    assert.deepEqual(json(run, 'game.powerUps.rates'), Object.fromEntries(run.context.ThreadPowerUps.kinds.map((kind, i) => [kind, +expected[i]])));
  }
});

test('changing saved preferences elsewhere does not alter the played track, score share, or retry', async () => {
  let payload;
  const run = game('?mode=generated&seed=ABCD-1234&powers=030000', { share: async data => { payload = data; } });
  value(run, 'game.running=false;game.score=51106;');
  const before = json(run, '{score:game.score,distance:game.distance,running:game.running,rates:game.powerUps.rates}');
  run.context.ThreadTrackOptions.save({ powers: '300000', shapes: '3', bonuses: '000' });
  assert.deepEqual(json(run, '{score:game.score,distance:game.distance,running:game.running,rates:game.powerUps.rates}'), before);
  assert.equal(value(run, 'runMix'), '030000');
  await run.get('#share-score').onclick();
  assert.equal(new URL(payload.url).searchParams.get('powers'), '030000');
  run.get('#again').onclick();
  assert.equal(value(run, 'runMix'), '030000');
  run.step();
  assert(json(run, 'game.powerUps.items').every(item => item.kind === 'blaster'));
  await run.get('#share-score').onclick();
  assert.equal(new URL(payload.url).searchParams.get('powers'), '030000');
  const daily = game('?mode=daily&track=2');
  daily.context.ThreadTrackOptions.save({ powers: '000000', shapes: '3', bonuses: '000' });
  daily.get('#again').onclick();
  assert.equal(value(daily, 'runMix'), '222222');
});
