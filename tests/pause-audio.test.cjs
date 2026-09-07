const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync(require('node:path').join(__dirname, '../assets/pause-audio.js'), 'utf8');
function fixture({ deferred = false } = {}) {
  const timers = new Map(), contexts = [], releases = [];
  let nextTimer = 0, enabled = true;
  const parameter = () => ({ values: [], setValueAtTime(v,t) { this.values.push([v,t]); },
    linearRampToValueAtTime(v,t) { this.values.push([v,t]); }, exponentialRampToValueAtTime(v,t) { this.values.push([v,t]); } });
  class Audio {
    currentTime = 2; destination = {}; sources = []; gains = []; suspended = 0; resumed = 0;
    constructor() { contexts.push(this); }
    resume() { this.resumed++; return deferred ? new Promise(resolve => releases.push(resolve)) : Promise.resolve(); }
    suspend() { this.suspended++; return Promise.resolve(); }
    createOscillator() {
      const o = { frequency: parameter(), stopped: [], connect(target) { return target; }, disconnect() {},
        start(time) { this.startTime = time; }, stop(time) { this.stopped.push(time); } };
      this.sources.push(o); return o;
    }
    createGain() { const g = { gain: parameter(), connect(target) { return target; }, disconnect() {} }; this.gains.push(g); return g; }
  }
  const context = vm.createContext({}); vm.runInContext(code, context);
  const cue = context.ThreadPauseAudio.create({ AudioContext: Audio, isEnabled: () => enabled,
    schedule(fn, delay) { const id = ++nextTimer; timers.set(id, {fn,delay}); return id; }, cancel(id) { timers.delete(id); } });
  return { cue, contexts, timers, releases, enabled(value) { enabled = value; },
    tick() { const [id,timer] = timers.entries().next().value; timers.delete(id); timer.fn(); } };
}
test('pause cue is a soft two-note fade, repeats more quietly every 12 seconds, and stops fully', async () => {
  const f = fixture(); f.cue.start(); await new Promise(resolve => setImmediate(resolve));
  const c = f.contexts[0];
  assert.equal(c.sources.length, 2);
  assert.deepEqual(c.sources.map(o => o.frequency.values[0][0]), [660,495]);
  assert(c.sources.every(o => o.type === 'sine'));
  assert.equal(c.gains[0].gain.values[1][0], .016);
  assert.equal([...f.timers.values()][0].delay, 12000);
  f.tick(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(c.sources.length, 4);
  assert.equal(c.gains[2].gain.values[1][0], .009);
  f.cue.stop();
  assert.equal(f.timers.size, 0);
  assert.equal(c.suspended, 1);
  assert(c.sources.every(o => o.stopped.at(-1) === undefined));
});
test('muted or backgrounded pause creates no audio; foreground return waits before reminding', async () => {
  const f = fixture(); f.enabled(false); f.cue.start();
  assert.equal(f.contexts.length, 0); assert.equal(f.timers.size, 0);
  f.enabled(true); f.cue.start({immediate:false});
  assert.equal(f.contexts.length, 0);
  f.tick(); await new Promise(resolve => setImmediate(resolve)); assert.equal(f.contexts[0].sources.length, 2);
  f.enabled(false); f.tick(); assert.equal(f.timers.size, 0);
});
test('late audio-unlock and cancelled reminder callbacks cannot sound or cancel a newer pause', async () => {
  const f = fixture({deferred:true}); f.cue.start();
  const stale = [...f.timers.values()][0].fn;
  f.cue.stop(); f.releases.shift()(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.contexts[0].sources.length, 0);
  f.cue.start(); stale();
  assert.equal(f.timers.size, 1);
  f.releases.shift()(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.contexts[0].sources.length, 2);
  f.cue.stop();
});
