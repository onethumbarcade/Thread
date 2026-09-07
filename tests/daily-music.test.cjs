const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { game } = require('./game-harness.cjs');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/daily-music.js'), 'utf8'), context);
const music = context.ThreadDailyMusic;
test('pause stays free of menu music through music settings, backgrounding, and resume', () => {
  const run = game('?mode=daily&track=2');
  const theme = run.get('#menu-bgm');
  assert.equal(theme.paused, true);
  run.get('#pause-game').click();
  assert.equal(theme.paused, true);
  run.get('setting-music').click();
  assert.equal(theme.paused, true);
  run.get('setting-music').click();
  assert.equal(theme.paused, true);
  for (const active of [false, true]) {
    for (const listener of run.listeners.get('thread:app-state')) listener({ detail: { isActive: active } });
    assert.equal(theme.paused, true);
  }
  run.get('#resume-game').click();
  assert.equal(theme.paused, true);
  assert.equal(run.storage.get('thread-daily-attempts-2'), '1');
});
test('repeated card interactions and Home never pause or rewind the menu song', () => {
  const run = game('?mode=daily&track=2');
  vm.runInContext('game.running=false;showResult(false)', run.context);
  const theme = run.get('#menu-bgm');
  theme.currentTime = 37.25;
  const pauses = theme.pauses;
  vm.runInContext('startMenuMusic();startMenuMusic()', run.context);
  assert.equal(theme.pauses, pauses);
  assert.equal(theme.currentTime, 37.25);
  run.get('#home-button').click();
  assert.equal(theme.pauses, pauses);
});

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

test('generated codes compose distinct, repeatable music with valid notes and event order', () => {
  const signatures = new Set(), melodies = new Set(), tempos = new Set();
  for (let i = 0; i < 32; i++) {
    const code = `NEON-${4100 + i}`;
    const score = music.generatedArrangement(code);
    assert.deepEqual(score, music.generatedArrangement(code.toLowerCase().replace('-', ' ')));
    assert(score.profile.bpm >= 122 && score.profile.bpm <= 146);
    assert(score.events.length > 400 && score.events.length < 900);
    let previous = -1;
    for (const event of score.events) {
      assert(event.time >= previous && event.time < score.duration);
      if ('note' in event) assert(event.note >= 28 && event.note <= 100);
      previous = event.time;
    }
    signatures.add(JSON.stringify(score.events));
    melodies.add(JSON.stringify(score.profile.riff));
    tempos.add(score.profile.bpm);
  }
  assert.equal(signatures.size, 32, 'new codes compose new arrangements');
  assert(melodies.size > 24, 'custom music is not a selection from the seven daily songs');
  assert(tempos.size > 6);
});

test('generated songs start immediately, loop cleanly, and release their audio nodes', async () => {
  for (const code of ['N3ON-4821', 'ABCD-1234', 'WAVE-9328']) {
    const score = music.generatedArrangement(code);
    const audio = new Audio(), timers = new Timers(), player = music.createGeneratedPlayer(audio, code, timers);
    const started = player.start();
    assert(audio.sources.length > 0 && audio.sources.length < 20);
    assert.equal(audio.sources[0].startTime, .025);
    assert.equal(audio.buffers.length, 1);
    assert.equal(audio.buffers[0].length / audio.buffers[0].sampleRate, 1);
    assert.equal(await started, 'playing');
    for (let time = .05; time < score.duration + .1; time += .05) timers.tick(audio, time);
    score.events.forEach((event, i) => assert(Math.abs(audio.sources[i].startTime - event.time - .025) < 1e-8));
    assert(Math.abs(audio.sources[score.events.length].startTime - score.duration - .025) < 1e-8);
    assert(audio.sources.filter(source => !source.ended).length < 60);
    player.stop();
    assert.equal(timers.pending.size, 0);
    assert(audio.nodes.every(node => node.connections.size === 0));
  }
});

const modes = ['?mode=daily&track=3', '?mode=generated&seed=N3ON-4821'];
const flush = () => new Promise(resolve => setImmediate(resolve));
const inspect = (run, code) => vm.runInContext(code, run.context);
const opening = audio => audio.sources.map(source => ({
  type: source.type, frequency: source.frequency.value, time: source.startTime,
}));

test('unsupported synthesis keeps the game playable without restoring the removed recording', async () => {
  const audio = new Audio();
  audio.createStereoPanner = undefined;
  assert.equal(await music.createPlayer(audio, 0, new Timers()).start(), 'unavailable');
  assert.equal(await music.createGeneratedPlayer(audio, 'N3ON-4821', new Timers()).start(), 'unavailable');
  assert.equal(audio.nodes.length, 0);
  for (const mode of modes) {
    const run = game(mode);
    await flush();
    assert.equal(inspect(run, 'game.running'), true);
    assert.equal(inspect(run, 'musicStarted'), false);
    assert.equal(run.get('#bgm').plays, 0);
  }
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert(!/<audio\s+id="bgm"/.test(html));
  assert(/<audio\s+id="menu-bgm"/.test(html));
});

test('daily and generated music both honor mute and release the playing arrangement', async () => {
  for (const mode of modes) {
    const run = game(mode, {}, 844, { AudioContext: Audio });
    await flush();
    const audio = inspect(run, 'audio'), sources = [...audio.sources];
    assert(sources.length > 0);
    run.get('setting-music').onclick();
    assert.equal(inspect(run, 'settings.music'), false);
    assert.equal(inspect(run, 'musicStarted'), false);
    assert(sources.every(source => source.stops.at(-1) === 0));
    assert(audio.nodes.every(node => node.connections.size === 0));
    run.get('setting-music').onclick();
    assert(audio.sources.length > sources.length);
    assert.equal(run.get('#bgm').plays, 0);
  }
});

test('first touch resumes daily and custom synths without restarting; retries restart cleanly', async () => {
  for (const mode of modes) {
    const run = game(mode, {}, 844, { AudioContext: Audio });
    await flush();
    const audio = inspect(run, 'audio'), initial = opening(audio);
    const count = audio.sources.length, buffers = audio.buffers.length, resumes = audio.resumeCalls;
    const stops = audio.sources.map(source => source.stops.length);
    assert(count > 0);
    audio.currentTime = .12;
    run.listeners.get('pointerdown')[0]();
    assert.equal(audio.sources.length, count);
    assert.equal(audio.buffers.length, buffers);
    assert.deepEqual(audio.sources.map(source => source.stops.length), stops);
    assert(audio.resumeCalls > resumes);
    assert.equal(run.get('#bgm').plays, 0);
    run.get('#again').onclick();
    assert(audio.sources.length > count);
    assert.equal(audio.sources[count].startTime, .145);
    const retried = opening(audio).slice(count);
    assert.deepEqual(retried.map(({type,frequency}) => ({type,frequency})), initial.map(({type,frequency}) => ({type,frequency})));
  }
});

test('shared custom track codes reproduce the music independently of screen size and saved preferences', async () => {
  const run = game('?mode=generated&seed=N3ON-4821', {}, 844, { AudioContext: Audio });
  await flush();
  const score = inspect(run, 'ThreadDailyMusic.generatedArrangement(runSeed)');
  const code = new URL(inspect(run, 'ThreadTracks.trackUrl("generated", runSeed, location.href, runMix, runOptions)')).search;
  const friend = game(code, {}, 600, { AudioContext: Audio, width: 360,
    storage: { 'thread-power-mix': '000000' } });
  await flush();
  assert.equal(JSON.stringify(score), JSON.stringify(inspect(friend, 'ThreadDailyMusic.generatedArrangement(runSeed)')));
  assert.deepEqual(opening(inspect(run, 'audio')), opening(inspect(friend, 'audio')));
  const different = game('?mode=generated&seed=WAVE-9328', {}, 844, { AudioContext: Audio });
  await flush();
  assert.notDeepEqual(opening(inspect(run, 'audio')), opening(inspect(different, 'audio')));
});

test('first touch honors muted music in daily and custom tracks', () => {
  for (const mode of modes) {
    const run = game(mode, {}, 844, { AudioContext: Audio,
      storage: { 'thread-settings': JSON.stringify({ music: false }) } });
    run.listeners.get('pointerdown')[0]();
    assert.equal(run.get('#bgm').plays, 0);
    assert.equal(inspect(run, 'audio.sources.length'), 0);
    run.get('setting-music').onclick();
    assert(inspect(run, 'audio.sources.length') > 0);
  }
});

test('an old startup result cannot change the current music session', async () => {
  const run = game('?mode=generated&seed=N3ON-4821', {}, 844, { AudioContext: Audio });
  await flush();
  inspect(run, `
    stopMusic();
    let finishOldStart;
    trackMusic = { start: () => new Promise(resolve => finishOldStart = resolve), stop() {} };
    startMusic();
    stopMusic();
    trackMusic.start = () => Promise.resolve('playing');
    startMusic();
    finishOldStart('unavailable');
  `);
  await flush();
  assert.equal(inspect(run, 'musicStarted'), true);
  assert.equal(run.get('#bgm').plays, 0);
});
