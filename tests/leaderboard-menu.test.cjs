const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function menu(search = '') {
  const elements=new Map(),storage=new Map([['thread-daily-1','56392'],['thread-daily-2','47589']]);
  function get(id) {
    if(!elements.has(id))elements.set(id,{id,textContent:'',value:'',hidden:false,dataset:{},children:[],
      classList:{toggle(){}},setAttribute(){},replaceChildren(...children){this.children=children;},
      appendChild(child){this.children.push(child);},append(...children){this.children.push(...children);}});
    return elements.get(id);
  }
  const slots=[1,2].map(n=>{const el=get('archive-'+n);el.dataset.rankedBest=String(n);return el;});
  const queries=[];
  let fail=false,score=49964,boardRows,personalRow;
  const context=vm.createContext({crypto:webcrypto,Uint8Array,AbortController,URLSearchParams,
    setTimeout(callback,delay){const timer=setTimeout(callback,delay);timer.unref();return timer;},clearTimeout,addEventListener(){},
    localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
    ThreadDaily:{today:()=>2},location:{search},
    document:{getElementById:get,createElement:()=>({...get('new-'+elements.size),children:[]}),
      querySelectorAll:selector=>selector==='[data-ranked-best]'?slots:[]},
    async fetch(url,options){
      if(fail)throw new Error('offline');
      const query=new URL(url).searchParams,body=options.body&&JSON.parse(options.body);
      queries.push(query);
      const track=Number(query.get('track'))||1;
      const row={rank:1,track,score:track===1?score:47433,name:'BOND',tag:'44F914',isYou:true};
      assert.equal(body,undefined,'Opening or refreshing menus must not request an editable profile');
      const data=query.get('board')==='personal'?{from:1,to:2,bests:[{track:1,score},{track:2,score:47433}]}:{board:query.get('board'),track,entries:boardRows||[row],yours:personalRow||row};
      return {ok:true,json:async()=>data};
    },show(view){context.ThreadLeaderboardMenu.open(view);},
  });
  for(const name of ['leaderboard.js','leaderboard-menu.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets',name),'utf8'),context);
  return {get,storage,context,queries,setScore(value){score=value;},setRows(rows,yours){boardRows=rows;personalRow=yours;},fail(){fail=true;}};
}
test('today, archive, and leaderboard show the same server best while device records remain intact',async()=>{
  const m=menu();await tick();
  assert.equal(m.get('daily-best').textContent,'47,433');
  assert.equal(m.get('archive-1').textContent,'49,964');
  assert.equal(m.get('archive-2').textContent,'47,433');
  m.get('board-track-select').value='1';m.get('board-track-select').onchange();await tick();
  assert.equal(m.get('board-entries').children[0].children[2].textContent,m.get('archive-1').textContent);
  assert.equal(m.get('board-yours').hidden,true);
  assert.equal(m.storage.get('thread-daily-1'),'56392');
  m.setScore(58000);m.get('board-refresh').onclick();await tick();
  assert.equal(m.get('archive-1').textContent,'58,000');
  assert.equal(m.get('board-entries').children[0].children[2].textContent,'58,000');
});
test('reopening archive refreshes global scores and offline failures do not display a local score as ranked',async()=>{
  const m=menu();await tick();m.setScore(60000);
  m.context.ThreadLeaderboardMenu.open('archive');await tick();
  assert.equal(m.get('archive-1').textContent,'60,000');
  m.fail();m.context.ThreadLeaderboardMenu.open('today');await tick();
  assert.equal(m.get('daily-best').textContent,'47,433');
  assert.match(m.get('today-score-status').textContent,/unavailable/i);
});
test('rankings show YOU and game IDs even when a cached response contains legacy custom names',async()=>{
  const m=menu();await tick();
  const own={rank:2,track:1,score:49964,name:'BOND',tag:'44F914ABCDEF',isYou:true};
  const other={rank:1,track:1,score:60000,name:'FUCK YOU',tag:'98AC1234D567',isYou:false};
  m.setRows([other,own],own);m.context.ThreadLeaderboardMenu.open('leaderboard');await tick();
  let rows=m.get('board-entries').children;
  assert.equal(rows[0].children[1].textContent,'PLAYER 98AC1234D567');
  assert.equal(rows[1].children[1].textContent,'YOU');
  assert.equal(rows[1].className,'rank you');
  assert.equal(m.get('board-yours').hidden,true);
  m.setRows([other],own);m.get('board-refresh').onclick();await tick();
  rows=m.get('board-yours').children;
  assert.equal(m.get('board-yours').hidden,false);
  assert.equal(rows[0].children[1].textContent,'YOU');
  assert.equal(rows[0].children[1].children.length,0);
  assert.equal(rows[0].children[2].textContent,'49,964');
});
test('one leaderboard per track opens today, switches to archive records, and honors track links',async()=>{
  const m=menu();await tick();m.context.ThreadLeaderboardMenu.open('leaderboard');await tick();
  assert.equal(Number(m.get('board-track-select').value),2);
  assert.equal(m.get('board-entries').children[0].children[2].textContent,'47,433');
  m.get('board-track-select').value='1';m.get('board-track-select').onchange();await tick();
  assert.equal(m.get('board-entries').children[0].children[2].textContent,'49,964');
  m.setScore(60000);m.get('board-refresh').onclick();await tick();
  assert.equal(m.get('board-entries').children[0].children[2].textContent,'60,000');
  assert.equal(m.get('archive-1').textContent,'60,000');
  assert.deepEqual(m.queries.filter(q=>q.get('board')!=='personal').map(q=>q.toString()),[
    'board=daily&track=2','board=daily&track=1','board=daily&track=1'
  ]);
  const linked=menu('?view=leaderboard&track=1');await tick();
  assert.equal(Number(linked.get('board-track-select').value),1);
  assert.equal(linked.get('board-entries').children[0].children[2].textContent,'49,964');
});
