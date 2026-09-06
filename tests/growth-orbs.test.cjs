const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { game } = require('./game-harness.cjs');
const read = (run, code) => vm.runInContext(code, run.context);

function scenario({ shape = 0, star = 5, radius = 34, offset = 0, mode = 'generated' } = {}) {
  const query = mode === 'daily' ? '?mode=daily&track=3' : '?mode=generated&seed=N3ON-4821&bonuses=000&powers=000000';
  const run = game(query);
  read(run, `game.nodes=Array(200).fill(0);game.shapeSequence=[${shape}];
    game.ringRadius=${radius};game.ringOffset=${offset};game.energy=40;
    game.pickups=[{y:1,collected:false},{y:100000,collected:false}];
    game.bonuses=[{kind:'cherry',y:100000,side:1,offset:80,collected:false}];game.powerUps.items=[];
    game.powerUps.star=${star};lastHud=-1000;`);
  return run;
}

test('Growth Orbs grow every tracker shape during Star and update the rainbow outline and Size', () => {
  for (const mode of ['daily','generated']) for (const shape of [0,1,2,3]) {
    const run = scenario({mode,shape}), drawn=[];
    const draw = run.context.shape;
    run.context.shape = (...args) => { drawn.push({radius:args[2],shape:args[3]}); draw(...args); };
    run.step();
    assert.equal(read(run,'game.pickups[0].collected'),true);
    assert.equal(read(run,'game.ringRadius'),45);
    assert.equal(String(run.get('#ring').textContent),'45');
    assert(drawn.length > 0, 'the grown tracker is rendered');
    assert(drawn.every(item=>item.radius===45&&item.shape===shape));
    const score=read(run,'game.score');
    run.step();
    assert.equal(read(run,'game.ringRadius'),45,'a resolved orb grants growth once');
    assert(read(run,'game.score')-score<2,'no repeated orb points');
  }
});

test('an orb touching the tracker edge is collected even when the laser is outside the safe area', () => {
  for (const star of [0,5]) for (const [shape,factor] of [[0,1],[1,.92],[2,.68],[3,.56]]) {
    for (const side of [-1,1]) for (const touching of [true,false]) {
      const offset=side*(34*factor+11+(touching?-1:1));
      const run=scenario({shape,star,offset});
      run.step();
      assert.equal(read(run,'game.pickups[0].collected'),touching);
      assert.equal(read(run,'game.ringRadius')>34,touching);
      if(star)assert.equal(read(run,'game.energy'),40,'Star still blocks off-track damage');
      else assert(read(run,'game.energy')<40,'pickup overlap does not relax the laser safety rule');
    }
  }
});

test('Star and a Growth Orb collected in the same frame apply protection and growth immediately', () => {
  const run=scenario({star:0,offset:40});
  read(run,`game.powerUps.items=[{kind:'star',y:1,side:1,offset:60,collected:false}];
    game.bonuses=[{kind:'bomb',y:1,side:1,offset:40,collected:false}];`);
  run.step();
  assert.equal(read(run,'game.powerUps.star'),7);
  assert.equal(read(run,'game.pickups[0].collected'),true);
  assert.equal(read(run,'game.ringRadius'),45);
  assert.equal(read(run,'game.energy'),40);
});

test('growth stops at 72, keeps awarding points, and clearly reports maximum size', () => {
  for (const radius of [68,72]) {
    const run=scenario({radius});
    run.step();
    assert.equal(read(run,'game.ringRadius'),72);
    assert(read(run,'game.score')>=250);
    assert(read(run,'game.effects.some(effect=>effect.text==="MAX SIZE")'));
  }
});

test('Star with Magnet and Double Points grants Growth Orb size once and preserves it after Star ends', () => {
  const run=scenario({offset:100});
  read(run,'game.powerUps.magnet=2;game.powerUps.double=2;game.pickups=[{y:80,collected:false}];');
  for(let i=0;i<25;i++)run.step();
  assert.equal(read(run,'game.pickups[0].collected'),true);
  assert.equal(read(run,'game.ringRadius'),45);
  assert.equal(read(run,'game.score'),500);
  assert(read(run,'game.effects.some(effect=>effect.text==="+11 SIZE")'));
  read(run,'game.powerUps.star=.001;');
  run.step();
  assert(read(run,'game.ringRadius')>44.9,'only normal gradual shrinking resumes');
  run.get('#again').onclick();
  assert.equal(read(run,'game.ringRadius'),34);
  assert.equal(read(run,'game.powerUps.star'),0);
});
