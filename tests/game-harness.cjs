const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const gameScript = [...read('index.html').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)[1];
function element(id) {
  const classes = new Set();
  const drawing = new Proxy({}, { get: (obj, key) => obj[key] || (() => ({ addColorStop() {} })) });
  return {
    id, dataset: {}, hidden: false, disabled: false, value: '', textContent: '', plays: 0, pauses: 0, paused: true, currentTime: 0,
    classList: { add: value => classes.add(value), remove: value => classes.delete(value),
      toggle: (value, on) => on ? classes.add(value) : classes.delete(value), contains: value => classes.has(value) },
    style: { setProperty() {} }, setAttribute(name, value) { this[name] = value; },
    removeAttribute(name) { delete this[name]; }, focus() { this.focused = true; }, select() { this.selected = true; },
    click() { return this.onclick?.(); },
    querySelectorAll() { return []; }, querySelector() { return element('child'); },
    getContext() { return drawing; }, play() { this.plays++; this.paused = false; return Promise.resolve(); }, pause() { this.pauses++; this.paused = true; },
  };
}
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
const node = () => ({ gain: param(), frequency: param(), connect(target) { return target; }, disconnect() {}, start() {}, stop() {} });
function game(search, navigator = {}, height = 844, options = {}) {
  const elements = new Map(), storage = new Map(Object.entries(options.storage || {})), listeners = new Map();
  const session = options.session || new Map();
  const history = options.history || { state: null, replaceState(state, title, url) { this.state = state; } };
  const get = id => { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); };
  const settingButtons = ['sfx', 'music', 'haptics', 'reduced'].map(key => {
    const button = get('setting-' + key); button.dataset.setting = key; return button;
  });
  const context = vm.createContext({
    URL, URLSearchParams, navigator, ThreadLeaderboard: options.leaderboard, history,
    sessionStorage: options.sessionStorage || {
      getItem: key => session.get(key) || null, setItem: (key, value) => session.set(key, value),
      removeItem: key => session.delete(key),
    },
    location: { href: 'https://onethumbarcade.github.io/Thread/index.html' + search, search },
    innerWidth: options.width || 390, innerHeight: height, devicePixelRatio: 1, performance: { now: () => 0 },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)) },
    document: { body: get('body'), createElement: element, querySelector: get, querySelectorAll: selector => selector === '[data-setting]' ? settingButtons : [] },
    AudioContext: options.AudioContext || class { currentTime = 0; destination = node(); resume() { return Promise.resolve(); } createGain() { return node(); } createOscillator() { return node(); } },
    Path2D: class { moveTo() {} lineTo() {} },
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback); },
    requestAnimationFrame() {}, setTimeout() {},
  });
  context.window = context;
  for (const id of ['level', 'ring', 'speed', 'score', 'energy']) context[id] = get('#' + id);
  for (const name of ['menu-music', 'track-options', 'collectibles', 'track-sharing', 'daily-tracks', 'daily-music', 'power-ups', 'result-navigation', 'game-renderer']) vm.runInContext(read(`assets/${name}.js`), context);
  vm.runInContext(gameScript, context);
  let time = 0;
  return { context, get, storage, session, history, listeners, step(dt = .016) { time += dt * 1000; vm.runInContext(`frame(${time})`, context); } };
}
module.exports = { game, gameScript, element };
