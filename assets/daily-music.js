// Original synthwave/chiptune arrangements, scheduled just ahead of playback.
(() => {
  const profiles = [
    { name: "Neon Drive", bpm: 136, root: 38, chords: [0, -4, 3, -2], minor: [true, false, false, false], riff: [0, 2, 3, 2, 1, 2, 4, 2], bass: [0, 3, 6, 8, 11, 14], lead: "square", cutoff: 2900 },
    { name: "Laser Bloom", bpm: 124, root: 48, chords: [0, -5, -3, -7], minor: [true, false, false, false], riff: [3, 2, 1, -1, 2, 4, 3, -1], bass: [0, 2, 4, 7, 8, 10, 12, 15], lead: "triangle", cutoff: 4200 },
    { name: "Triangle Rush", bpm: 144, root: 47, chords: [0, -2, -4, -5], minor: [true, false, false, true], riff: [0, 1, 2, 3, 4, 3, 2, -1], bass: [0, 2, 5, 8, 10, 13, 15], lead: "sawtooth", cutoff: 2500 },
    { name: "Violet Circuit", bpm: 138, root: 42, chords: [0, 3, -2, -4], minor: [true, false, false, false], riff: [2, -1, 3, 1, 0, -1, 2, 4], bass: [0, 3, 4, 8, 11, 12], lead: "square", cutoff: 3400 },
    { name: "Orbit Glow", bpm: 130, root: 43, chords: [0, -5, -3, -7], minor: [false, false, true, false], riff: [0, -1, 1, 2, 3, -1, 4, 2], bass: [0, 4, 6, 8, 12, 14], lead: "triangle", cutoff: 5000 },
    { name: "Midnight Chase", bpm: 140, root: 40, chords: [0, -2, 3, -5], minor: [true, false, false, true], riff: [4, 3, 2, 1, 0, 2, -1, 1], bass: [0, 2, 6, 8, 10, 14], lead: "sawtooth", cutoff: 3100 },
    { name: "Electric Skyline", bpm: 128, root: 46, chords: [0, -4, -2, 3], minor: [true, false, false, false], riff: [0, 3, 2, -1, 1, 4, 2, 3], bass: [0, 3, 6, 7, 8, 11, 14], lead: "square", cutoff: 3700 },
  ];

  function arrangement(index) {
    const profile = profiles[((index % profiles.length) + profiles.length) % profiles.length];
    const beat = 60 / profile.bpm;
    const events = [];
    for (let bar = 0; bar < 16; bar++) {
      const chordIndex = Math.floor(bar / 2) % 4;
      const root = profile.root + profile.chords[chordIndex];
      const tones = [0, profile.minor[chordIndex] ? 3 : 4, 7, 12, 14];
      const time = bar * 4 * beat;
      tones.slice(0, 3).forEach((tone, voice) => events.push({ kind: "pad", time, length: beat * 4, note: root + 12 + tone, pan: (voice - 1) * .4 }));
      for (let step = 0; step < 16; step++) {
        const at = time + step * beat / 4;
        if (step % 4 === 0 || (bar % 4 === 3 && step === 14)) events.push({ kind: "kick", time: at });
        if (step === 4 || step === 12) events.push({ kind: "snare", time: at });
        if (step % 2 === 0 || (bar % 4 === 3 && step > 11)) events.push({ kind: "hat", time: at, open: step === 14, pan: step % 4 ? .25 : -.25 });
        if (profile.bass.includes(step)) events.push({ kind: "bass", time: at, length: beat * .35, note: root + (step === 14 ? 12 : 0) });
        if (step % 2 === 0) {
          const riffIndex = (step / 2 + (bar % 2 ? 2 : 0)) % profile.riff.length;
          const tone = profile.riff[riffIndex];
          if (tone >= 0) events.push({ kind: "lead", time: at, length: beat * (step === 14 ? .8 : .36), note: root + 24 + tones[tone], pan: .12 });
        }
        if (bar >= 8 && step % 2 === 1) events.push({ kind: "arp", time: at, length: beat * .18, note: root + 24 + tones[(step + bar) % 3], pan: step % 4 === 1 ? -.45 : .45 });
      }
    }
    return { profile, events, duration: 64 * beat };
  }

  const hz = note => 440 * 2 ** ((note - 69) / 12);

  function createSynth(context, score, index) {
    const methods = ["createGain", "createDynamicsCompressor", "createDelay", "createBuffer", "createBufferSource", "createOscillator", "createBiquadFilter", "createStereoPanner"];
    if (methods.some(method => typeof context?.[method] !== "function")) throw new Error("Web Audio unavailable");
    const sampleRate = 22050;
    const voices = new Set();
    const master = context.createGain();
    master.gain.value = .6;
    master.connect(context.destination);
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 12;
    compressor.ratio.value = 3;
    compressor.attack.value = .004;
    compressor.release.value = .18;
    compressor.connect(master);
    const delay = context.createDelay(1);
    const feedback = context.createGain();
    const wet = context.createGain();
    delay.delayTime.value = 60 / score.profile.bpm * .75;
    feedback.gain.value = .22;
    wet.gain.value = .2;
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(compressor);

    const noise = context.createBuffer(1, sampleRate, sampleRate);
    const samples = noise.getChannelData(0);
    let state = 7319 + index * 997;
    for (let i = 0; i < samples.length; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      samples[i] = state / 2147483648 - 1;
    }

    function output(source, filter, time, attack, sustain, release, volume, pan = 0, echo = false) {
      const gain = context.createGain();
      const panner = context.createStereoPanner();
      panner.pan.value = pan;
      gain.gain.setValueAtTime(.0001, time);
      gain.gain.linearRampToValueAtTime(volume, time + attack);
      gain.gain.setValueAtTime(volume * .8, time + attack + sustain);
      gain.gain.exponentialRampToValueAtTime(.0001, time + attack + sustain + release);
      source.connect(filter).connect(gain).connect(panner).connect(compressor);
      if (echo) panner.connect(delay);
      const voice = { source, nodes: [source, filter, gain, panner] };
      voices.add(voice);
      source.onended = () => {
        voice.nodes.forEach(node => node.disconnect());
        voices.delete(voice);
      };
      source.start(time);
      source.stop(time + attack + sustain + release + .01);
    }

    function note(event, time) {
      const filter = context.createBiquadFilter();
      if (event.kind === "hat" || event.kind === "snare") {
        const source = context.createBufferSource();
        source.buffer = noise;
        filter.type = "highpass";
        filter.frequency.value = event.kind === "hat" ? 6500 : 1300;
        output(source, filter, time, .001, .002, event.kind === "hat" ? (event.open ? .12 : .035) : .13, event.kind === "hat" ? .065 : .18, event.pan);
      } else {
        const source = context.createOscillator();
        filter.type = "lowpass";
        if (event.kind === "kick") {
          source.type = "sine";
          source.frequency.setValueAtTime(145, time);
          source.frequency.exponentialRampToValueAtTime(46, time + .12);
          filter.frequency.value = 900;
          output(source, filter, time, .002, .002, .19, .65);
        } else {
          source.frequency.value = hz(event.note);
          const pad = event.kind === "pad", bass = event.kind === "bass", arp = event.kind === "arp";
          source.type = pad ? "sawtooth" : bass ? "triangle" : arp ? "triangle" : score.profile.lead;
          source.detune.value = pad ? event.pan * 12 : 0;
          filter.frequency.value = pad ? 1350 : bass ? 800 : score.profile.cutoff;
          filter.Q.value = .7;
          output(source, filter, time, pad ? .16 : .008, event.length, pad ? .18 : .055, pad ? .035 : bass ? .21 : arp ? .045 : .07, event.pan, !pad && !bass);
        }
      }
    }
    function stop() {
      master.gain.value = 0;
      for (const voice of voices) {
        voice.source.onended = null;
        voice.source.stop();
        voice.nodes.forEach(node => node.disconnect());
      }
      voices.clear();
      [master, compressor, delay, feedback, wet].forEach(node => node.disconnect());
    }
    return { note, stop };
  }

  function createPlayer(context, index, timers = globalThis) {
    const score = arrangement(index);
    let synth, timer, generation = 0;

    function stop() {
      generation++;
      if (timer != null) { timers.clearTimeout(timer); timer = null; }
      synth?.stop();
      synth = null;
    }

    async function start() {
      stop();
      const request = generation;
      try {
        synth = createSynth(context, score, index);
        let loopStart = context.currentTime + .025, next = 0;
        function schedule() {
          if (request !== generation) return;
          const now = context.currentTime;
          // Resume at the current musical position after a background-tab stall;
          // don't queue a burst of old notes when timers resume.
          if (now >= loopStart + score.duration) {
            loopStart += Math.floor((now - loopStart) / score.duration) * score.duration;
            next = 0;
          }
          while (loopStart + score.events[next].time < now + .25) {
            const event = score.events[next], time = loopStart + event.time;
            if (time >= now - .01) synth.note(event, Math.max(now + .005, time));
            if (++next === score.events.length) { next = 0; loopStart += score.duration; }
          }
          timer = timers.setTimeout(schedule, 50);
        }
        schedule();
        return "playing";
      } catch {
        stop();
        return "unavailable";
      }
    }

    return { start, stop };
  }

  globalThis.ThreadDailyMusic = { arrangement, createPlayer };
})();
