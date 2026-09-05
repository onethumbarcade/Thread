const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { game } = require('./game-harness.cjs');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/daily-music.js'), 'utf8'), context);
const music = context.ThreadDailyMusic;
const param = () => ({ value: 0,
  setValueAtTime(value, time) { assert(Number.isFinite(value) && time >= 0); },
  linearRampToValueAtTime(value, time) { assert(Number.isFinite(value) && time >= 0); },
  exponentialRampToValueAtTime(value, time) { assert(value > 0 && time >= 0); },
});
const node = () => ({
  gain: param(), frequency: param(), detune: param(), Q: param(), pan: param(), delayTime: param(),
  threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(),
  connect(target) { return target; }, disconnect() {},
  start(time = 0) { assert(Number.isFinite(time) && time >= 0); this.started = true; },
  stop(time = 0) { assert(Number.isFinite(time) && time >= 0); this.stopped = true; },
});
class Audio {
  destination = node(); sources = [];
  createGain() { return node(); }
  createBuffer(channels, length, rate) {
    const arrays = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, sampleRate: rate, getChannelData: channel => arrays[channel], copyToChannel: (data, channel) => arrays[channel].set(data) };
  }
  createBufferSource() { const source = node(); this.sources.push(source); return source; }
}
let renders = 0, finishRender;
class Offline extends Audio {
  constructor(channels, length, rate) { super(); this.result = this.createBuffer(channels, length, rate); }
  createDynamicsCompressor() { return node(); }
  createDelay() { return node(); }
  createStereoPanner() { return node(); }
  createBiquadFilter() { return node(); }
  createOscillator() { return node(); }
  async startRendering() { renders++; return this.result; }
}

test('seven distinct arrangements use repeatable melodies, rhythms and valid audio schedules', async () => {
  const signatures = new Set();
  for (let index = 0; index < 7; index++) {
    const score = music.arrangement(index);
    assert(score.profile.bpm >= 120 && score.profile.bpm <= 150);
    assert.deepEqual(score, music.arrangement(index + 7));
    for (const event of score.events) {
      assert(event.time >= 0 && event.time < score.duration);
      if ('note' in event) assert(event.note > 20 && event.note < 110);
    }
    signatures.add(JSON.stringify(score.events));
    const audio = new Audio(), player = music.createPlayer(audio, index, Offline);
    assert.equal(await player.start(), 'playing');
    const source = audio.sources.at(-1);
    assert.equal(source.loop, true);
    assert.equal(source.buffer.length, Math.round(score.duration * source.buffer.sampleRate));
    player.stop();
    assert.equal(source.stopped, true);
  }
  assert.equal(signatures.size, 7);
});

test('muting during rendering prevents late playback; retries reuse the rendered loop', async () => {
  class Pending extends Offline {
    startRendering() { renders++; return new Promise(resolve => { finishRender = () => resolve(this.result); }); }
  }
  const audio = new Audio(), player = music.createPlayer(audio, 2, Pending);
  const before = renders, pending = player.start();
  player.stop(); finishRender();
  assert.equal(await pending, 'cancelled');
  assert.equal(audio.sources.length, 0);
  assert.equal(await player.start(), 'playing');
  const first = audio.sources.at(-1);
  assert.equal(await player.start(), 'playing');
  assert.equal(first.stopped, true);
  assert.equal(renders, before + 1);
  player.stop();
});

test('unavailable rendering signals fallback to the existing game music', async () => {
  assert.equal(await music.createPlayer(new Audio(), 0, null).start(), 'unavailable');
  const run = game('?mode=daily&track=2');
  await new Promise(resolve => setImmediate(resolve));
  assert(run.get('#bgm').plays > 0);
});

test('daily music follows the Music setting while generated runs retain their soundtrack', async () => {
  const run = game('?mode=daily&track=3');
  await new Promise(resolve => setImmediate(resolve));
  vm.runInContext(`dailyMusic={starts:0,stops:0,start(){this.starts++;return Promise.resolve('playing')},stop(){this.stops++}};startMusic();`, run.context);
  const originalPlays = run.get('#bgm').plays;
  assert.equal(vm.runInContext('dailyMusic.starts', run.context), 1);
  run.get('setting-music').onclick();
  assert.equal(vm.runInContext('settings.music', run.context), false);
  assert(vm.runInContext('dailyMusic.stops', run.context) >= 2);
  run.get('setting-music').onclick();
  assert.equal(vm.runInContext('dailyMusic.starts', run.context), 2);
  assert.equal(run.get('#bgm').plays, originalPlays);
  const generated = game('?mode=generated&seed=N3ON-4821');
  assert.equal(generated.get('#bgm').plays, 1);
  assert.equal(vm.runInContext('dailyMusic', generated.context), undefined);
});
