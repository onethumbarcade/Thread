const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const tick = () => new Promise(resolve => setImmediate(resolve));
function archive(today = 43) {
  const elements = new Map(), storage = new Map([['thread-daily-attempts-42','1']]);
  function element(id) {
    const classes = new Set();
    return {id, children:[], dataset:{}, disabled:false, textContent:'', classList:{toggle(name,on){on?classes.add(name):classes.delete(name);}},
      setAttribute(name,value){this[name]=value;}, appendChild(child){this.children.push(child);}, append(...children){this.children.push(...children);},
      replaceChildren(...children){this.children=children;}, scrollIntoView(){this.scrolled=true;}};
  }
  const get = id => {if(!elements.has(id)) elements.set(id,element(id)); return elements.get(id);};
  const records = new Map([[43,{track:43,score:44610,rank:2}],[1,{track:1,score:52910,rank:75}]]), requests = [], pending = [];
  let fail = false, hold = false;
  const context = vm.createContext({crypto:webcrypto,Uint8Array,AbortController,URLSearchParams,addEventListener(){},
    setTimeout(callback,delay){const timer=setTimeout(callback,delay);timer.unref();return timer;},clearTimeout,
    localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},ThreadDaily:{today:()=>today},
    document:{getElementById:get,createElement:tag=>element(tag)},
    async fetch(url) {
      if(fail) throw Error('offline');
      const params = new URL(url).searchParams;
      if(params.get('board')==='played') return {ok:true,json:async()=>({played:[43,40,1]})};
      const tracks = params.get('tracks').split(',').map(Number); requests.push(tracks);
      const response = {ok:true,json:async()=>({tracks,bests:tracks.filter(track=>records.has(track)).map(track=>records.get(track))})};
      return hold ? new Promise(resolve=>pending.push(()=>resolve(response))) : response;
    },
  });
  for(const file of ['leaderboard.js','track-archive.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets',file),'utf8'),context);
  return {get,context,records,requests,pending,storage,ids:()=>get('archive-list').children.map(row=>Number(row.dataset.track)),
    open(){context.ThreadTrackArchive.setActive(true);},fail(){fail=true;},hold(){hold=true;}};
}
test('archive shows 20 recent tracks per page, including records older than 24 tracks',async()=>{
  const a=archive();a.open();await tick();
  assert.deepEqual(a.ids(),Array.from({length:20},(_,i)=>43-i));
  assert.equal(a.get('archive-page').textContent,'Page 1 of 3');assert.equal(a.get('archive-prev').disabled,true);
  const first=a.get('archive-list').children[0];
  assert.equal(first.children[1].textContent,'44,610');assert.equal(first.children[2].textContent,'#2');
  assert.equal(first.children[3].children[0].href,'index.html?mode=daily&track=43');
  assert.equal(first.children[3].children[0].textContent,'REPLAY');
  a.get('archive-next').onclick();await tick();
  assert.deepEqual(a.ids(),Array.from({length:20},(_,i)=>23-i));
  a.get('archive-next').onclick();await tick();
  assert.deepEqual(a.ids(),[3,2,1]);assert.equal(a.get('archive-next').disabled,true);
  const last=a.get('archive-list').children[2];assert.equal(last.children[2].textContent,'#75');
  assert.deepEqual(a.requests.map(rows=>rows.length),[20,20,3]);
  a.get('archive-next').onclick();await tick();assert.equal(a.requests.length,3);
  a.get('archive-prev').onclick();await tick();assert.equal(a.ids()[0],23);
});
test('Not Played puts every unplayed track first across pages, preserving recent order in each group',async()=>{
  const a=archive();a.open();await tick();a.get('archive-unplayed').onclick();await tick();
  assert.equal(a.get('archive-unplayed')['aria-pressed'],'true');
  const all=[...a.ids()];a.get('archive-next').onclick();await tick();all.push(...a.ids());
  a.get('archive-next').onclick();await tick();all.push(...a.ids());
  const recent=Array.from({length:43},(_,i)=>43-i),played=new Set([43,42,40,1]);
  assert.deepEqual(all,recent.filter(n=>!played.has(n)).concat(recent.filter(n=>played.has(n))));
  a.get('archive-recent').onclick();await tick();assert.equal(a.ids()[0],43);assert.equal(a.get('archive-page').textContent,'Page 1 of 3');
});
test('short archives disable pagination and unranked tracks show dashes with playable links',async()=>{
  const a=archive(2);a.open();await tick();
  assert.deepEqual(a.ids(),[2,1]);assert.equal(a.get('archive-prev').disabled,true);assert.equal(a.get('archive-next').disabled,true);
  const row=a.get('archive-list').children[0];assert.equal(row.children[1].textContent,'—');assert.equal(row.children[2].textContent,'—');
  assert.equal(row.children[3].children[0].textContent,'PLAY');assert.equal(row.children[3].children[0].href,'index.html?mode=daily&track=2');
});
test('offline archives remain playable without presenting device-only scores as globally ranked',async()=>{
  const a=archive(2);a.storage.set('thread-daily-2','99999');a.fail();a.open();await tick();
  assert.match(a.get('archive-score-status').textContent,/unavailable/i);
  assert.equal(a.get('archive-list').children[0].children[1].textContent,'—');
  assert.equal(a.get('archive-list').children[0].children[2].textContent,'—');
  assert.equal(a.get('archive-list')['aria-busy'],'false');
});
test('late page responses cannot replace the page selected while loading',async()=>{
  const a=archive();a.hold();a.open();await tick();
  a.get('archive-next').onclick();await tick();assert.equal(a.pending.length,2);
  a.pending[1]();await tick();assert.equal(a.ids()[0],23);
  a.pending[0]();await tick();assert.equal(a.ids()[0],23);assert.equal(a.get('archive-page').textContent,'Page 2 of 3');
});
