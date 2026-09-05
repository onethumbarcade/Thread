const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { game } = require('./game-harness.cjs');
const script = fs.readFileSync(require('node:path').join(__dirname,'../assets/leaderboard.js'),'utf8');
const flushTasks = () => new Promise(resolve => setImmediate(resolve));
function client(fetcher, storage = new Map()) {
  const context = vm.createContext({ crypto:webcrypto, Uint8Array, AbortController, setTimeout, clearTimeout,
    fetch:fetcher, addEventListener(){}, localStorage: {getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)} });
  vm.runInContext(script,context);
  return { api:context.ThreadLeaderboard, storage };
}
const reply = data => ({ok:true,json:async()=>data});
test('guest credential persists and pending scores retry once after reconnect', async () => {
  let connected = true, finishes = 0, firstToken;
  const storage = new Map();
  const fetcher = async (url, options) => {
    firstToken ||= options.headers.Authorization;
    assert.equal(options.headers.Authorization,firstToken);
    const body = JSON.parse(options.body);
    if (body.action === 'start') return reply({runId:'run-1'});
    if (!connected) throw new Error('Offline');
    finishes++; return reply({saved:true,yours:{rank:2,score:500}});
  };
  const first = client(fetcher,storage), session = first.api.startRun(2);
  await session.ready; connected = false;
  await assert.rejects(first.api.finishRun(session,{score:500,distance:1000,duration:20}));
  assert.equal(JSON.parse(storage.get('thread-ranked-pending')).length,1);
  connected = true;
  const second = client(fetcher,storage); await second.api.flush(); await second.api.flush();
  assert.equal(finishes,1); assert.equal(JSON.parse(storage.get('thread-ranked-pending')).length,0);
});
test('an offline start never fabricates a ranked result', async () => {
  let calls=0;
  const c=client(async()=>{calls++;throw new Error('offline');});
  await assert.rejects(c.api.finishRun(c.api.startRun(2),{score:10,distance:30,duration:1}),/Played offline/);
  assert.equal(calls,1); assert.equal(c.storage.has('thread-ranked-pending'),false);
});
test('permanently rejected submissions leave the retry queue', async () => {
  const c=client(async(url,options)=>JSON.parse(options.body).action==='start' ? reply({runId:'run-1'}) : {ok:false,status:400,json:async()=>({error:'Invalid score'})});
  await assert.rejects(c.api.finishRun(c.api.startRun(2),{score:123,distance:0,duration:0}),/Invalid score/);
  assert.equal(JSON.parse(c.storage.get('thread-ranked-pending')).length,0);
});
test('daily game submits once with its track and simulated duration; custom games never submit', async () => {
  for (const mode of ['daily','generated']) {
    const starts=[],finishes=[];
    const leaderboard={ startRun(track){starts.push(track);return {track};},async finishRun(session,body){finishes.push(body);return {yours:{rank:3,score:500}};} };
    const g=game(`?mode=${mode}&track=2&seed=N3ON-4821`,{},844,{leaderboard});
    vm.runInContext('game.energy=.01;game.ringOffset=10000;game.score=500',g.context);g.step();g.step();await flushTasks();
    assert.equal(starts.length,mode==='daily'?1:0);assert.equal(finishes.length,mode==='daily'?1:0);
    if(mode==='daily'){
      assert.equal(starts[0],2);assert.ok(finishes[0].duration>0);
      assert.match(g.get('#result-ranking').textContent,/DAILY RANK #3/);
      assert.equal(g.get('#result-board-link').href,'update-2-preview.html?view=leaderboard&track=2');
    }else assert.equal(g.get('#result-board-link').hidden,true);
  }
});
test('slow submission from a prior attempt does not overwrite the next attempt’s result', async () => {
  let resolve;
  const leaderboard={startRun(){return {};},finishRun(){return new Promise(r=>{resolve=r;});}};
  const g=game('?mode=daily&track=2',{},844,{leaderboard});
  vm.runInContext('game.energy=.01;game.ringOffset=10000',g.context);g.step();g.get('#again').click();
  resolve({yours:{rank:1,score:900}});await flushTasks();
  assert.equal(g.get('#result-ranking').textContent,'');
});
