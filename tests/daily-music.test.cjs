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
  connections: new Set(), stops: [],
  gain: param(), frequency: param(), detune: param(), Q: param(), pan: param(), delayTime: param(),
  threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(),
  connect(target) { this.connections.add(target); return target; },
  disconnect() { this.connections.clear(); },
  start(time = 0) { assert(Number.isFinite(time) && time >= 0); this.startTime = time; },
  stop(time = 0) { assert(Number.isFinite(time) && time >= 0); this.stops.push(time); },
});
class Audio {
  currentTime = 0; destination = node(); sources = []; nodes = []; buffers = [];
  resumeCalls = 0;
  resume() { this.resumeCalls++; return Promise.resolve(); }
  makeNode() { const result = node(); this.nodes.push(result); return result; }
  createGain() { return this.makeNode(); }
  createBuffer(channels, length, rate) {
    const arrays = Array.from({ length: channels }, () => new Float32Array(length));
    const buffer = { length, sampleRate: rate, getChannelData: channel => arrays[channel] };
    this.buffers.push(buffer);
    return buffer;
  }
  createBufferSource() { const source = this.makeNode(); this.sources.push(source); return source; }
  createOscillator() { return this.createBufferSource(); }
  createDynamicsCompressor() { return this.makeNode(); }
  createDelay() { return this.makeNode(); }
  createStereoPanner() { return this.makeNode(); }
  createBiquadFilter() { return this.makeNode(); }
  advance(time) {
    this.currentTime = time;
    for (const source of this.sources) {
      if (!source.ended && source.stops.at(-1) <= time) {
        source.ended = true;
        source.onended?.();
      }
    }
  }
}
class Timers {
  pending = new Map(); next = 0;
  setTimeout(callback, delay) { assert.equal(delay, 50); this.pending.set(++this.next, callback); return this.next; }
  clearTimeout(id) { this.pending.delete(id); }
  tick(audio, time) {
    audio.advance(time);
    const callbacks = [...this.pending.values()];
    this.pending.clear();
    callbacks.forEach(callback => callback());
  }
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
    const audio = new Audio(), timers = new Timers(), player = music.createPlayer(audio, index, timers);
    assert.equal(await player.start(), 'playing');
    for (let time = .05; time < score.duration + .05; time += .05) timers.tick(audio, time);
    // Every note in the first pass plays once, followed by the start of the next loop.
    assert(audio.sources.length > score.events.length);
    score.events.forEach((event, i) => assert(Math.abs(audio.sources[i].startTime - event.time - .025) < 1e-8));
    assert(Math.abs(audio.sources[score.events.length].startTime - score.duration - .025) < 1e-8);
    assert(audio.sources.filter(source => !source.ended).length < 60, 'finished voices are released during playback');
    player.stop();
    assert.equal(timers.pending.size, 0);
    assert(audio.nodes.every(node => node.connections.size === 0));
  }
  assert.equal(signatures.size, 7);
});

test('daily music schedules its opening immediately, without rendering a whole song', async () => {
  const audio = new Audio(), timers = new Timers(), player = music.createPlayer(audio, 0, timers);
  audio.currentTime = 100;
  const started = player.start();
  // Check before awaiting the return value: the opening is already queued.
  assert(audio.sources.length > 0 && audio.sources.length < 20);
  assert.equal(audio.sources[0].startTime, 100.025);
  assert(audio.sources.every(source => source.startTime < 100.25));
  assert.equal(audio.buffers.length, 1);
  assert.equal(audio.buffers[0].length / audio.buffers[0].sampleRate, 1, 'only a short percussion noise buffer is created');
  const count = audio.sources.length;
  timers.tick(audio, 100.2);
  assert(audio.sources.length > count);
  assert(audio.sources.slice(count).every(source => source.startTime >= 100.2 && source.startTime < 100.45));
  assert.equal(await started, 'playing');
  player.stop();
});

test('muting cancels queued notes and echoes; retries replace the previous schedule', async () => {
  const audio = new Audio(), timers = new Timers(), player = music.createPlayer(audio, 2, timers);
  assert.equal(await player.start(), 'playing');
  const stale = [...timers.pending.values()][0];
  const previous = [...audio.sources];
  player.stop();
  assert.equal(timers.pending.size, 0);
  assert(previous.every(source => source.stops.at(-1) === 0));
  assert(audio.nodes.every(node => node.connections.size === 0));
  stale();
  assert.equal(audio.sources.length, previous.length);
  audio.advance(5);
  assert.equal(await player.start(), 'playing');
  assert.equal(audio.sources[previous.length].startTime, 5.025);
  const count = audio.sources.length, second = [...audio.sources];
  assert.equal(await player.start(), 'playing');
  assert(second.every(source => source.stops.at(-1) === 0));
  assert.equal(timers.pending.size, 1);
  assert.equal(audio.sources[count].startTime, 5.025);
  const after = audio.sources.length;
  stale();
  assert.equal(audio.sources.length, after);
  player.stop();
});

test('a stalled tab skips missed notes instead of playing a burst of old music', async () => {
  const audio = new Audio(), timers = new Timers(), player = music.createPlayer(audio, 0, timers);
  assert.equal(await player.start(), 'playing');
  const before = audio.sources.length, now = music.arrangement(0).duration * 40 + 3;
  timers.tick(audio, now);
  const added = audio.sources.slice(before);
  assert(added.length > 0 && added.length < 20);
  assert(added.every(source => source.startTime >= now && source.startTime < now + .25));
  assert.equal(timers.pending.size, 1);
  player.stop();
});

test('unavailable synthesis signals fallback to the existing game music', async () => {
  const audio = new Audio();
  audio.createStereoPanner = undefined;
  assert.equal(await music.createPlayer(audio, 0, new Timers()).start(), 'unavailable');
  assert.equal(audio.nodes.length, 0);
  const run = game('?mode=daily&track=2');
  await new Promise(resolve => setImmediate(resolve));
  assert(run.get('#bgm').plays > 0);
});

test('daily music follows the Music setting while generated runs retain their soundtrack', async () => {
  const run = game('?mode=daily&track=3');
  await new Promise(resolve => setImmediate(resolve));
  vm.runInContext(`stopMusic();dailyMusic={starts:0,stops:0,start(){this.starts++;return Promise.resolve('playing')},stop(){this.stops++}};startMusic();`, run.context);
  const originalPlays = run.get('#bgm').plays;
  assert.equal(vm.runInContext('dailyMusic.starts', run.context), 1);
  run.get('setting-music').onclick();
  assert.equal(vm.runInContext('settings.music', run.context), false);
  assert.equal(vm.runInContext('dailyMusic.stops', run.context), 1);
  run.get('setting-music').onclick();
  assert.equal(vm.runInContext('dailyMusic.starts', run.context), 2);
  assert.equal(run.get('#bgm').plays, originalPlays);
  const generated = game('?mode=generated&seed=N3ON-4821');
  assert.equal(generated.get('#bgm').plays, 1);
  assert.equal(vm.runInContext('dailyMusic', generated.context), undefined);
});

test('first touch preserves custom music position and does not pause or replay it', () => {
  const run = game('?mode=generated&seed=N3ON-4821');
  const bgm = run.get('#bgm'), pauses = bgm.pauses, plays = bgm.plays;
  bgm.currentTime = 1.5;
  run.listeners.get('pointerdown')[0]();
  assert.equal(bgm.currentTime, 1.5);
  assert.equal(bgm.pauses, pauses);
  assert.equal(bgm.plays, plays);
  run.get('#again').onclick();
  assert.equal(bgm.currentTime, 0, 'an actual retry restarts the song');
  assert.equal(bgm.plays, plays + 1);
});

test('first touch resumes daily audio without replacing its synth or queued notes', async () => {
  const run = game('?mode=daily&track=3', {}, 844, { AudioContext: Audio });
  await new Promise(resolve => setImmediate(resolve));
  const audio = vm.runInContext('audio', run.context);
  const count = audio.sources.length, buffers = audio.buffers.length, resumes = audio.resumeCalls;
  const stops = audio.sources.map(source => source.stops.length);
  assert(count > 0);
  audio.currentTime = .12;
  run.listeners.get('pointerdown')[0]();
  assert.equal(audio.sources.length, count, 'the first gesture must not restart the arrangement');
  assert.equal(audio.buffers.length, buffers);
  assert.deepEqual(audio.sources.map(source => source.stops.length), stops);
  assert(audio.resumeCalls > resumes, 'the gesture still unlocks suspended audio');
  assert.equal(run.get('#bgm').plays, 0);
  run.get('#again').onclick();
  assert(audio.sources.length > count);
  assert.equal(audio.sources[count].startTime, .145);
});

test('first touch retries blocked media playback without seeking, including daily fallback', async () => {
  for (const search of ['?mode=generated&seed=N3ON-4821', '?mode=daily&track=2']) {
    const run = game(search);
    await new Promise(resolve => setImmediate(resolve));
    const bgm = run.get('#bgm'), plays = bgm.plays;
    bgm.paused = true;
    bgm.currentTime = .7;
    run.listeners.get('pointerdown')[0]();
    assert.equal(bgm.plays, plays + 1);
    assert.equal(bgm.currentTime, .7);
  }
});

test('first touch honors muted music in daily and custom tracks', () => {
  for (const search of ['?mode=generated&seed=N3ON-4821', '?mode=daily&track=3']) {
    const run = game(search, {}, 844, { AudioContext: Audio,
      storage: { 'thread-settings': JSON.stringify({ music: false }) } });
    run.listeners.get('pointerdown')[0]();
    assert.equal(run.get('#bgm').plays, 0);
    assert.equal(vm.runInContext('audio.sources.length', run.context), 0);
    run.get('setting-music').onclick();
    assert(search.includes('daily') ? vm.runInContext('audio.sources.length', run.context) > 0 : run.get('#bgm').plays === 1);
  }
});

test('an old daily startup cannot trigger fallback music over a newer run', async () => {
  const run = game('?mode=daily&track=3', {}, 844, { AudioContext: Audio });
  await new Promise(resolve => setImmediate(resolve));
  vm.runInContext(`
    stopMusic();
    let finishOldStart;
    dailyMusic = { start: () => new Promise(resolve => finishOldStart = resolve), stop() {} };
    startMusic();
    stopMusic();
    dailyMusic.start = () => Promise.resolve('playing');
    startMusic();
    finishOldStart('unavailable');
  `, run.context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(run.get('#bgm').plays, 0);
});
