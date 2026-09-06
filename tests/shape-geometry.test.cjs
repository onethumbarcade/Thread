const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { game } = require('./game-harness.cjs');
const evaluate = (run, code) => vm.runInContext(code, run.context);
function triangle(run, radius, scale = 1) {
  const points = [], ctx = run.get('#canvas').getContext('2d');
  ctx.moveTo = ctx.lineTo = (x,y) => points.push({x,y});
  run.context.shape(195,500,radius,3,scale);
  return points;
}

test('triangle has equal sides and its centroid stays at the dot as size changes', () => {
  const run = game('?mode=generated&shapes=3&bonuses=000&powers=000000');
  for(const radius of [24,39,72]) for(const scale of [1,.88,.74]) {
    const points = triangle(run,radius,scale);
    assert.equal(points.length,3);
    const sides = points.map((p,i)=>Math.hypot(p.x-points[(i+1)%3].x,p.y-points[(i+1)%3].y));
    assert(sides.every(side=>Math.abs(side-sides[0])<1e-8));
    assert(Math.abs(points.reduce((sum,p)=>sum+p.x,0)/3-195)<1e-8);
    assert(Math.abs(points.reduce((sum,p)=>sum+p.y,0)/3-500)<1e-8);
  }
});

test('triangle energy boundary matches the visible width through its centered dot', () => {
  for(const direction of [-1,1]) for(const outside of [false,true]) {
    const run=game('?mode=generated&shapes=3&bonuses=000&powers=000000');
    const [tip,right]=triangle(run,39);
    const rightAtDot=tip.x+(right.x-tip.x)*(500-tip.y)/(right.y-tip.y);
    const offset=direction*(rightAtDot-195-6+(outside ? .1 : -.1));
    evaluate(run,`game.nodes=Array(200).fill(0);game.ringRadius=39;game.ringOffset=${offset};game.energy=50;`);
    run.step(.001);
    assert.equal(evaluate(run,'game.energy')<50,outside);
  }
});

test('normal and rainbow triangle outlines share the center dot during gameplay', () => {
  for(const star of [0,7]) {
    const run=game('?mode=generated&shapes=3&bonuses=000&powers=000000');
    evaluate(run,`game.nodes=Array(200).fill(0);game.powerUps.star=${star};`);
    const ctx=run.get('#canvas').getContext('2d'), dots=[], centers=[];
    ctx.arc=(x,y,r)=>{if(r===4)dots.push({x,y});};
    const original=run.context.shape;
    run.context.shape=(...args)=>{
      const points=[];
      const move=ctx.moveTo,line=ctx.lineTo;
      ctx.moveTo=ctx.lineTo=(x,y)=>points.push({x,y});
      original(...args);
      ctx.moveTo=move;ctx.lineTo=line;
      centers.push({x:points.reduce((s,p)=>s+p.x,0)/3,y:points.reduce((s,p)=>s+p.y,0)/3});
    };
    run.step();
    assert(centers.length > 0, 'the tracker outline is rendered');
    assert.equal(dots.length,1);
    assert(centers.every(c=>Math.hypot(c.x-dots[0].x,c.y-dots[0].y)<1e-8));
  }
});
