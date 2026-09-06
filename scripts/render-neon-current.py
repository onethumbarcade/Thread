"""Neon Current — an original, sample-free THREAD menu music preview.

104 BPM / D major / 32 bars / 73.846 seconds. Melodic electronic instrumental:
articulated electric keys, plucked lead, syncopated bass, kick, snare, clap,
hats, shaker and tom fills. No sustained organ/pad layer.

Usage: python3 render-neon-current.py [output-directory]
Requires NumPy, SciPy and ffmpeg. Deterministic synthesis, no downloaded samples.
FLAC is the exact 32-bar loop master; MP3 is the listening preview.
"""
from pathlib import Path
import json
import subprocess
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 44100
BPM = 104
BEAT = 60 / BPM
BARS = 32
N = round(BARS * 4 * BEAT * SR)
RNG = np.random.default_rng(1040906)
BUSES = {name: np.zeros((N, 2), np.float32) for name in
         ['keys', 'lead', 'arp', 'bass', 'kick', 'snare', 'tops', 'fills']}
EVENTS = []
KICKS = []


def hz(note):
    return 440 * 2 ** ((note - 69) / 12)


def clock(seconds):
    return np.arange(round(seconds * SR), dtype=np.float64) / SR


def env(t, seconds, attack=.003, release=.04):
    return np.minimum(t / attack, 1) * np.clip((seconds - t) / release, 0, 1)


def filt(signal, lo=None, hi=None):
    cut = [lo, hi] if lo and hi else lo or hi
    kind = 'bandpass' if lo and hi else 'highpass' if lo else 'lowpass'
    return sosfilt(butter(2, cut, btype=kind, fs=SR, output='sos'), signal, axis=0)


def add(bus, signal, beat, gain=1, pan=0, note=None):
    start = round(beat * BEAT * SR) % N
    signal = np.asarray(signal, dtype=np.float32)
    if signal.ndim == 1:
        signal = signal[:, None] * np.array([
            np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        ], dtype=np.float32)
    signal = signal * gain
    first = min(len(signal), N - start)
    BUSES[bus][start:start + first] += signal[:first]
    if first < len(signal):
        BUSES[bus][:len(signal) - first] += signal[first:]
    EVENTS.append({'bus': bus, 'beat': round(beat, 5), 'note': note})


def keys(note, velocity=1, gate=.34):
    seconds = gate + .37
    t = clock(seconds)
    p = 2 * np.pi * hz(note) * t
    # Brief tine transient and a rapidly decaying, warm electric-piano body.
    fm = (.92 * np.exp(-t * 13) + .08) * np.sin(2 * p)
    tone = np.sin(p + fm) * (.80 * np.exp(-t * 4.8) + .08 * np.exp(-t * 2))
    tone += .14 * np.sin(3.998 * p) * np.exp(-t * 17)
    tone += .045 * np.sin(7.01 * p) * np.exp(-t * 35)
    release = np.exp(-np.maximum(t - gate, 0) * 18)
    return tone * release * env(t, seconds, .003, .07) * velocity


def pluck(note, gate=.30, bright=1):
    seconds = gate + .24
    t = clock(seconds)
    p = 2 * np.pi * hz(note) * t
    tone = np.sin(p + (.60 * np.exp(-t * 18)) * np.sin(2 * p))
    tone += .20 * np.sin(2 * p) * np.exp(-t * 10) * bright
    tone += .11 * np.sin(3 * p) * np.exp(-t * 15) * bright
    tone += .034 * np.sin(5.002 * p) * np.exp(-t * 24)
    amplitude = (.83 * np.exp(-t * 6.1) + .09 * np.exp(-t * 1.8))
    amplitude *= np.exp(-np.maximum(t - gate, 0) * 20)
    return tone * amplitude * env(t, seconds, .004, .06)


def bass(note, gate):
    seconds = gate + .10
    t = clock(seconds)
    p = 2 * np.pi * hz(note) * t
    tone = np.sin(p) + .34 * np.sin(2 * p) + .16 * np.sin(3 * p)
    tone += .055 * np.sin(4 * p) * np.exp(-t * 15)
    amplitude = (.65 + .35 * np.exp(-t * 10)) * np.exp(-t * 1.1)
    amplitude *= np.exp(-np.maximum(t - gate, 0) * 42)
    return np.tanh(tone * .9) * amplitude * env(t, seconds, .005, .035)


def kick():
    t = clock(.40)
    phase = 2 * np.pi * (52 * t + 96 * (1 - np.exp(-t * 44)) / 44)
    body = np.sin(phase) * np.exp(-t * 12.5)
    body += .16 * np.sin(2 * phase) * np.exp(-t * 28)
    transient = filt(RNG.normal(size=len(t)), 1500, 7500)
    return (body + .15 * transient * np.exp(-t * 200)) * env(t, .40, .001, .04)


def snare():
    t = clock(.23)
    noise = filt(RNG.normal(size=len(t)), 1000, 10000)
    wire = noise * .58 * np.exp(-t * 23)
    body = (.46 * np.sin(2 * np.pi * 185 * t) +
            .16 * np.sin(2 * np.pi * 332 * t)) * np.exp(-t * 33)
    return (wire + body) * env(t, .23, .0015, .03)


def clap():
    t = clock(.21)
    noise = filt(RNG.normal(size=len(t)), 1300, 7700)
    amp = np.zeros(len(t))
    for offset, gain in [(0, .60), (.009, .82), (.019, .9), (.030, .64)]:
        amp += gain * np.exp(-np.maximum(t - offset, 0) * (200 if offset < .03 else 34)) * (t >= offset)
    return noise * amp * env(t, .21, .001, .03)


def hat(opened=False):
    seconds = .22 if opened else .065
    t = clock(seconds)
    noise = filt(RNG.normal(size=len(t)), 6200, 15000)
    metal = sum(np.sin(2 * np.pi * f * t) for f in [4127, 5741, 6833, 8329]) / 4
    tone = .76 * noise + .14 * metal
    return tone * np.exp(-t * (18 if opened else 72)) * env(t, seconds, .0008, .016)


def shaker():
    t = clock(.052)
    noise = filt(RNG.normal(size=len(t)), 4900, 12500)
    amp = np.sin(np.pi * np.clip(t / .052, 0, 1)) ** 1.5
    return noise * amp * np.exp(-t * 23)


def rim():
    t = clock(.07)
    ring = sum(np.sin(2 * np.pi * f * t) for f in [640, 1037, 1691]) / 3
    noise = filt(RNG.normal(size=len(t)), 1300, 9000)
    return (ring * .65 + noise * .16) * np.exp(-t * 65) * env(t, .07, .0007, .015)


def tom(note):
    t = clock(.25)
    f = hz(note)
    p = 2 * np.pi * (f * t + f * .28 * (1 - np.exp(-t * 25)) / 25)
    return (np.sin(p) + .18 * np.sin(1.51 * p)) * np.exp(-t * 16) * env(t, .25, .002, .03)


# Dmaj9 -> Aadd9 -> Bm7 -> Gmaj9. Two bars per harmony.
CHORDS = [[62, 66, 69, 73, 76], [61, 64, 69, 71, 76],
          [62, 66, 69, 71, 74], [59, 62, 66, 69, 74]]
ROOTS = [38, 33, 35, 31]
# Each tuple is (beat within bar, MIDI pitch, gate in beats).
HOOK = [
    [(0, 78, .45), (.75, 81, .30), (1.5, 83, .45), (2.25, 81, .30), (3, 78, .35), (3.5, 76, .30)],
    [(.25, 74, .48), (1, 78, .30), (1.75, 76, .30), (2.5, 74, .75)],
    [(0, 76, .45), (.75, 81, .30), (1.5, 83, .45), (2.5, 81, .32), (3.25, 76, .32)],
    [(.25, 73, .45), (1, 76, .35), (1.75, 74, .30), (2.5, 73, .45), (3.25, 71, .30)],
    [(0, 74, .42), (.75, 78, .32), (1.5, 81, .48), (2.25, 78, .30), (3, 76, .35), (3.5, 74, .32)],
    [(.25, 71, .45), (1, 74, .30), (1.75, 78, .40), (2.5, 76, .30), (3.25, 74, .30)],
    [(0, 74, .42), (.75, 79, .30), (1.5, 78, .42), (2.5, 74, .30), (3.25, 71, .30)],
    [(.25, 69, .35), (1, 71, .30), (1.75, 74, .35), (2.5, 73, .35), (3.25, 76, .38)],
]
BRIDGE = [
    [(0, 69, .50), (1, 74, .35), (1.75, 78, .35), (2.5, 76, .40), (3.25, 74, .35)],
    [(.5, 73, .35), (1.25, 74, .32), (2, 78, .60), (3.25, 81, .35)],
    [(0, 81, .45), (.75, 76, .35), (1.5, 73, .35), (2.25, 71, .35), (3, 69, .50)],
    [(.5, 71, .35), (1.25, 73, .35), (2, 76, .50), (3.25, 73, .35)],
    [(0, 71, .40), (.75, 74, .32), (1.5, 78, .45), (2.25, 74, .32), (3, 81, .55)],
    [(.5, 78, .40), (1.25, 76, .35), (2, 74, .50), (3.25, 71, .35)],
    [(0, 71, .50), (1, 74, .35), (1.75, 79, .40), (2.5, 78, .35), (3.25, 74, .35)],
    [(.25, 76, .35), (1, 73, .35), (1.75, 71, .35), (2.5, 73, .40), (3.25, 76, .35)],
]

for bar in range(BARS):
    at, section = bar * 4, bar // 8
    chord_i = (bar // 2) % 4
    chord, root = CHORDS[chord_i], ROOTS[chord_i]
    if bar % 8 == 7:
        chord, root = CHORDS[1], ROOTS[1]  # Dominant turnaround into D.

    # Short offbeat chord punches; no continuously held pad.
    stabs = [(.0, .92), (1.5, .72), (2.75, .80)] if bar % 2 == 0 else [(.5, .79), (2, .84), (3.5, .63)]
    for off, velocity in stabs:
        for i, note in enumerate(chord):
            add('keys', keys(note, velocity, .26 if off == 3.5 else .34),
                at + off + i * .009, .073, (i - 2) * .22, note)

    # Bass articulates roots, fifths and octaves in a syncopated pocket.
    bassline = [(0, root, .62, 1), (.75, root + 12, .30, .74),
                (1.5, root, .42, .86), (2.25, root + 7, .32, .74),
                (2.75, root + 12, .38, .84), (3.5, root + 7, .31, .78)]
    if bar % 2:
        bassline = [(0, root, .70, 1), (1.25, root + 7, .32, .75),
                    (1.75, root + 12, .42, .80), (2.75, root, .38, .9),
                    (3.5, root + 12, .30, .72)]
    for off, note, gate, velocity in bassline:
        add('bass', bass(note, gate * BEAT), at + off, .26 * velocity, 0, note)

    phrase = BRIDGE if section == 2 else HOOK
    for j, (off, note, gate) in enumerate(phrase[bar % 8]):
        gain = .19 * (1 if j % 3 == 0 else .88)
        add('lead', pluck(note, gate * BEAT), at + off + .013,
            gain, -.12 + .04 * (j % 3), note)

    # Quiet, bright answering figures develop the second and fourth phrases.
    if section in [1, 3]:
        for j, off in enumerate([.5, 1.25, 2, 3.0]):
            note = chord[[1, 3, 2, 4][(j + bar) % 4]] + 12
            add('arp', pluck(note, .12, .6), at + off + .018, .043,
                .38 if j % 2 else -.38, note)
    elif section == 2 and bar % 2:
        for j, off in enumerate([2.75, 3.5]):
            note = chord[3 - j] + 12
            add('arp', keys(note, .7, .12), at + off, .045, .4, note)

    # Clearly audible four-on-the-floor drums, slightly swung high percussion.
    kick_offsets = [0, 1, 2, 3]
    if section == 2 and bar % 8 < 4:
        kick_offsets = [0, 1.75, 2.5]
    if bar % 4 == 3:
        kick_offsets += [3.5]
    for off in kick_offsets:
        add('kick', kick(), at + off, .48 if off % 1 == 0 else .34)
        KICKS.append(at + off)
    for off in [1, 3]:
        add('snare', snare(), at + off + .017, .27, -.04)
        add('snare', clap(), at + off + .027, .105, .16)
    if bar % 2:
        add('snare', snare(), at + 2.78, .055, -.14)
    for step in range(8):
        off = step * .5 + (.035 if step % 2 else 0)
        opened = step % 2 == 1 and section != 2
        gain = (.098 if opened else .060) * (1 if step % 2 else .78)
        add('tops', hat(opened), at + off, gain, .22 if step % 2 else -.19)
    for step in range(16):
        if step % 2 == 0 and section == 2:
            continue
        off = step * .25 + (.027 if step % 2 else .005)
        add('tops', shaker(), at + off, .034 if step % 4 == 3 else .019,
            -.38 if step % 2 else .36)
    for off in ([.75, 2.5] if bar % 2 == 0 else [1.75, 3.25]):
        add('fills', rim(), at + off + .012, .074, -.28)
    if bar % 8 == 7:
        for j, (off, note) in enumerate([(3.25, 53), (3.5, 50), (3.75, 45)]):
            add('fills', tom(note), at + off, .15 + .018 * j, -.26 + .26 * j, note)
        add('tops', hat(True), at + 3.75, .11, .2)


def space(bus, echo=.0, room=.0):
    dry = BUSES[bus].copy()
    wet_source = filt(dry, 260, 5700).astype(np.float32)
    for repeat in range(1, 4):
        shift = round(.75 * BEAT * repeat * SR)
        BUSES[bus] += np.roll(wet_source, shift, axis=0)[:, ::-1] * echo * .43 ** (repeat - 1)
    for j, delay in enumerate([.029, .047, .079, .113, .163, .223, .307, .419, .557, .701]):
        BUSES[bus] += np.roll(wet_source, round(delay * SR), axis=0)[:, ::-1] * room * .79 ** j


space('keys', .08, .062)
space('lead', .21, .054)
space('arp', .22, .042)
space('snare', 0, .044)
space('fills', 0, .034)

# Gentle rhythmic ducking makes space for the kick without exaggerated pumping.
duck = np.ones(N, np.float32)
duck_time = clock(.28)
dip = .27 * np.exp(-duck_time * 15) * np.minimum(duck_time / .004, 1)
for beat in KICKS:
    start = round(beat * BEAT * SR) % N
    idx = (np.arange(len(dip)) + start) % N
    duck[idx] = np.minimum(duck[idx], 1 - dip)
for name in ['keys', 'arp', 'bass']:
    BUSES[name] *= duck[:, None]

levels = {name: round(float(np.sqrt(np.mean(buf ** 2))), 6) for name, buf in BUSES.items()}
mix = sum(BUSES.values())
# Use a settled periodic filter so the exact loop includes all its release tails.
sos = butter(2, [28, 15000], fs=SR, btype='bandpass', output='sos')
_, zi = sosfilt(sos, mix, axis=0, zi=np.zeros((len(sos), 2, 2)))
mix, _ = sosfilt(sos, mix, axis=0, zi=zi)
mix = np.tanh(mix * 1.22)
mix *= .90 / np.max(np.abs(mix))

outdir = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
outdir.mkdir(parents=True, exist_ok=True)
wave = outdir / 'THREAD-Neon-Current.wav'
mp3 = wave.with_suffix('.mp3')
flac = wave.with_suffix('.flac')
wavfile.write(wave, SR, np.round(mix * 32767).astype(np.int16))
metadata = ['-metadata', 'title=Neon Current', '-metadata', 'artist=One Thumb Arcade',
            '-metadata', 'album=THREAD', '-metadata', 'comment=Original 104 BPM menu theme preview; 32-bar loop']
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wave),
                '-c:a', 'libmp3lame', '-b:a', '192k', *metadata, str(mp3)], check=True)
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wave),
                '-compression_level', '12', *metadata, str(flac)], check=True)

report = {
    'title': 'Neon Current', 'bpm': BPM, 'bars': BARS, 'seconds': N / SR,
    'sample_rate': SR, 'loop_samples': N,
    'peak': float(np.max(np.abs(mix))), 'rms': float(np.sqrt(np.mean(mix ** 2))),
    'loop_seam_delta': float(np.max(np.abs(mix[-1] - mix[0]))),
    'stereo_correlation': float(np.corrcoef(mix[:, 0], mix[:, 1])[0, 1]),
    'bus_rms_before_master': levels,
    'event_counts': {name: sum(e['bus'] == name for e in EVENTS) for name in BUSES},
    'arrangement': ['0–8 bars: main hook and full groove', '8–16: hook with answering arpeggios',
                    '16–24: new melody and lighter kick pattern', '24–32: full hook and percussion fills'],
}
(outdir / 'audio-checks.json').write_text(json.dumps(report, indent=2) + '\n')
wave.unlink()
print(json.dumps(report, indent=2))
