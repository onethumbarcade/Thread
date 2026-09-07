// A separate context keeps the paused song's clock frozen while the cue plays.
(() => {
  function create({ isEnabled = () => true, AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext,
    schedule = setTimeout, cancel = clearTimeout } = {}) {
    let context, timer, generation = 0, active = false;
    const voices = new Set();
    function stop() {
      active = false; generation++;
      if (timer != null) cancel(timer);
      timer = null;
      for (const voice of voices) {
        try { voice.oscillator.stop(); } catch {}
        voice.oscillator.disconnect(); voice.gain.disconnect();
      }
      voices.clear();
      context?.suspend?.()?.catch(() => {});
    }
    function play(token, reminder) {
      if (!active || token !== generation || !isEnabled() || !AudioContext) return;
      try {
        context ||= new AudioContext();
        Promise.resolve(context.resume()).then(() => {
          if (!active || token !== generation || !isEnabled()) return;
          // A gentle descending fourth: rounded attack, long fade, no sharp click.
          for (const [frequency, delay] of [[660, 0], [495, .22]]) {
            const oscillator = context.createOscillator(), gain = context.createGain();
            const start = context.currentTime + delay, volume = reminder ? .009 : .016;
            oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, start);
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(volume, start + .075);
            gain.gain.exponentialRampToValueAtTime(.0001, start + .85);
            oscillator.connect(gain).connect(context.destination);
            const voice = { oscillator, gain }; voices.add(voice);
            oscillator.onended = () => { voices.delete(voice); oscillator.disconnect(); gain.disconnect(); };
            oscillator.start(start); oscillator.stop(start + .9);
          }
        }).catch(() => {});
      } catch {} // Audio unavailable or blocked: the pause screen remains quiet.
    }
    function start({ immediate = true } = {}) {
      stop();
      if (!isEnabled() || !AudioContext) return;
      active = true;
      const token = generation;
      if (immediate) play(token, false);
      function repeat() {
        if (!active || token !== generation) return;
        if (!isEnabled()) { stop(); return; }
        play(token, true);
        timer = schedule(repeat, 12000);
      }
      timer = schedule(repeat, 12000);
    }
    return { start, stop };
  }
  globalThis.ThreadPauseAudio = { create };
})();
