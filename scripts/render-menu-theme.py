"""Render THREAD's original 'Neon Drift' menu theme. Requires NumPy, SciPy and ffmpeg.

90 BPM, D major / B minor, 32 bars, 85 1/3 seconds. All instruments are
synthesized here; no recordings or third-party musical samples are used.
The circular mix wraps instrument releases and echoes for a continuous loop.
Usage: python3 scripts/render-menu-theme.py /path/to/output.mp3
"""
from pathlib import Path
import subprocess
import sys
import tempfile

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 44100
BEAT = 60 / 90
BARS = 32
LENGTH = round(BARS * 4 * BEAT * SR)
rng = np.random.default_rng(902106)
buses = {name: np.zeros((LENGTH, 2), dtype=np.float32)
         for name in ['pad', 'keys', 'lead', 'bass', 'drums', 'air']}


def hz(note):
    return 440 * 2 ** ((note - 69) / 12)


def time(duration):
    return np.arange(round(duration * SR)) / SR


def envelope(t, duration, attack=.015, release=.2):
    return np.minimum(t / attack, 1) * np.clip((duration - t) / release, 0, 1)


def add(bus, signal, beat, gain=1, pan=0):
    start = round(beat * BEAT * SR) % LENGTH
    if signal.ndim == 1:
        signal = signal[:, None] * np.array([np.cos((pan + 1) * np.pi / 4),
                                            np.sin((pan + 1) * np.pi / 4)])
    signal = (signal * gain).astype(np.float32)
    first = min(len(signal), LENGTH - start)
    buses[bus][start:start + first] += signal[:first]
    if first < len(signal):
        buses[bus][:len(signal) - first] += signal[first:]


def piano(note, duration, velocity=1):
    t = time(duration)
    phase = 2 * np.pi * hz(note) * t
    body = np.sin(phase + .8 * np.exp(-t * 3.8) * np.sin(2 * phase))
    body += .19 * np.sin(2.003 * phase) * np.exp(-t * 4)
    body += .07 * np.sin(3 * phase) * np.exp(-t * 7)
    return body * np.exp(-t * 1.65) * envelope(t, duration, .008, .25) * velocity


def pad(chord, duration):
    t = time(duration)
    out = np.zeros((len(t), 2))
    for i, note in enumerate(chord):
        for side in range(2):
            f = hz(note) * (1 + (-1 if side else 1) * .0015)
            phase = 2 * np.pi * f * t + i * .72
            tone = np.sin(phase) + .16 * np.sin(2 * phase) + .06 * np.sin(3 * phase)
            out[:, side] += tone * (1 + .035 * np.sin(t * 2 * np.pi * .22 + i))
    return out / len(chord) * envelope(t, duration, .6, 1.6)[:, None]


def bass(note, duration):
    t = time(duration)
    phase = 2 * np.pi * hz(note) * t
    tone = np.sin(phase) + .22 * np.sin(2 * phase) + .06 * np.sin(3 * phase)
    return tone * envelope(t, duration, .012, .14) * np.exp(-t * .6)


def lead(note, duration):
    t = time(duration)
    phase = 2 * np.pi * hz(note) * t + .014 * np.sin(2 * np.pi * 4.6 * t)
    tone = np.sin(phase) + .13 * np.sin(2 * phase) + .025 * np.sin(3 * phase)
    return tone * np.exp(-t * .9) * envelope(t, duration, .035, .35)


def kick():
    t = time(.45)
    phase = 2 * np.pi * (47 * t + 63 * (1 - np.exp(-t * 32)) / 32)
    return np.sin(phase) * np.exp(-t * 12) * np.minimum(t / .004, 1)


def snare():
    t = time(.28)
    noise = sosfilt(butter(2, [900, 6000], fs=SR, btype='bandpass', output='sos'), rng.normal(size=len(t)))
    return (noise * .47 + np.sin(2 * np.pi * 185 * t) * .13) * np.exp(-t * 23) * np.minimum(t / .003, 1)


def hat(opened=False):
    t = time(.22 if opened else .09)
    noise = sosfilt(butter(2, [4500, 10000], fs=SR, btype='bandpass', output='sos'), rng.normal(size=len(t)))
    return noise * np.exp(-t * (19 if opened else 65)) * np.minimum(t / .002, 1)


# Two bars per harmony: Dmaj9, Bm9, Gmaj9, A6/9. Inversions keep the upper voices close.
chords = [[62, 66, 69, 73, 76], [59, 62, 66, 69, 73],
          [59, 62, 66, 69, 74], [61, 64, 66, 69, 71]]
roots = [38, 35, 31, 33]
# An original eight-bar phrase, answered an octave lower in the quiet middle section.
melody = [[(0.5, 78, 1), (2, 76, .7), (3, 73, 1.2)],
          [(1, 69, 1), (2.5, 73, .8)],
          [(.5, 73, .8), (2, 74, .7), (3, 78, 1.3)],
          [(1, 76, 1.6)],
          [(.5, 74, 1), (2, 71, .9), (3.5, 69, .7)],
          [(1, 66, 1.1), (2.5, 69, 1)],
          [(.5, 71, 1), (2, 73, .7), (3, 76, 1)],
          [(1, 73, 1), (2.5, 69, 1.2)]]

for bar in range(BARS):
    block, section = (bar // 2) % 4, bar // 8
    chord, root = chords[block], roots[block]
    at = bar * 4
    if bar % 2 == 0:
        add('pad', pad([n - 12 for n in chord] + chord[2:], 8 * BEAT + 1.5), at, .19)
    # Slightly swung, sparse electric-piano harmony.
    for off, velocity in [(0, .9), (1.75, .48), (3.25, .65)]:
        for i, note in enumerate(chord):
            add('keys', piano(note, 2.4), at + off + i * .008,
                .056 * velocity * (.9 if section == 2 else 1), (i - 2) * .16)
    for off, note, duration in [(0, root, .8), (1.5, root, .6), (2.75, root + 12, .55)]:
        add('bass', bass(note, duration * BEAT), at + off, .18 if section != 2 else .135)
    if section != 2 or bar % 2 == 0:
        add('drums', kick(), at, .21)
    if section != 2:
        add('drums', kick(), at + 2.5, .13)
    add('drums', snare(), at + 2.018, .1 if section != 2 else .055, -.08)
    for step in range(8):
        if section == 2 and step % 2 == 0:
            continue
        add('drums', hat(step == 7 and bar % 2 == 1), at + step * .5 + (.035 if step % 2 else 0),
            .022 * (1 if step % 2 else .66), .28 if step % 2 else -.22)
    if section in [1, 3] or bar % 2 == 0:
        for off, note, length in melody[bar % 8]:
            add('lead', lead(note - (12 if section == 2 else 0), length * BEAT + .45),
                at + off, .078 if section != 2 else .052, -.08)
    if section == 3:
        for i, off in enumerate([.75, 2.25, 3.5]):
            add('air', piano(chord[(i + bar) % len(chord)] + 12, 2), at + off, .021, [-.5, .5, .15][i])

# Low, filtered stereo echoes and a diffuse late tail, wrapped onto the loop start.
for bus, wet in [('keys', .23), ('lead', .27), ('air', .26), ('pad', .09)]:
    dry = buses[bus].copy()
    filtered = sosfilt(butter(2, 3100, fs=SR, output='sos'), dry, axis=0)
    for n in range(1, 5):
        echo = np.roll(filtered, round(.75 * BEAT * n * SR), axis=0)
        if n % 2:
            echo = echo[:, ::-1]
        buses[bus] += echo * wet * .48 ** (n - 1)
    for n, delay in enumerate([.071, .113, .173, .257, .389, .541, .773, 1.031]):
        buses[bus] += np.roll(filtered, round(delay * SR), axis=0)[:, ::-1] * .017 * .8 ** n

mix = sum(buses.values())
mix = sosfilt(butter(2, 25, fs=SR, btype='highpass', output='sos'), np.tile(mix, (2, 1)), axis=0)[LENGTH:]
mix = np.tanh(mix * 1.25)
mix *= .84 / np.max(np.abs(mix))
output = Path(sys.argv[1] if len(sys.argv) > 1 else 'assets/thread-menu.mp3')
output.parent.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory() as folder:
    wave = Path(folder) / 'neon-drift.wav'
    wavfile.write(wave, SR, np.round(mix * 32767).astype(np.int16))
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wave),
                    '-c:a', 'libmp3lame', '-b:a', '160k', '-metadata', 'title=Neon Drift',
                    '-metadata', 'artist=One Thumb Arcade', '-metadata', 'album=THREAD',
                    str(output)], check=True)
print(f'{output}: {LENGTH / SR:.3f}s, peak {np.max(np.abs(mix)):.3f}, RMS {np.sqrt(np.mean(mix ** 2)):.3f}')
