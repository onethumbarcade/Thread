"""Render Stillwater, an original chill menu theme for THREAD.
68 BPM, Eb major / C minor, 32 bars (112.94 seconds). Soft felt electric keys,
long warm pads, a sparse half-time brushed beat, and a mellow answering phrase.
Synthesized from scratch without samples. All releases and echoes wrap into
one continuous lossless loop; MP3 is provided as the lightweight listening copy.
Usage: python3 scripts/render-menu-theme.py /path/to/thread-menu.mp3
"""
from pathlib import Path
import subprocess
import sys
import tempfile

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 32000
BEAT = 60 / 68
BARS = 32
LENGTH = round(BARS * 4 * BEAT * SR)
rng = np.random.default_rng(680906)
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
    body = np.sin(phase + .22 * np.exp(-t * 2.8) * np.sin(2 * phase))
    body += .065 * np.sin(2.003 * phase) * np.exp(-t * 4)
    body += .014 * np.sin(3 * phase) * np.exp(-t * 7)
    return body * np.exp(-t * .85) * envelope(t, duration, .026, .8) * velocity


def pad(chord, duration):
    t = time(duration)
    out = np.zeros((len(t), 2))
    for i, note in enumerate(chord):
        for side in range(2):
            f = hz(note) * (1 + (-1 if side else 1) * .0015)
            phase = 2 * np.pi * f * t + i * .72
            tone = np.sin(phase) + .16 * np.sin(2 * phase) + .06 * np.sin(3 * phase)
            out[:, side] += tone * (1 + .035 * np.sin(t * 2 * np.pi * .22 + i))
    return out / len(chord) * envelope(t, duration, 1.2, 2.7)[:, None]


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


# Two-bar chords with close voice leading: Ebmaj9, Cm9, Abmaj9, Bb13sus.
chords = [[55, 58, 62, 65, 67], [55, 58, 62, 63, 67],
          [55, 58, 60, 63, 67], [53, 56, 60, 63, 67]]
roots = [39, 36, 32, 34]
# Sparse long notes leave breathing room between the harmonies.
phrase = {0: [(1.25, 70, 1.7)], 2: [(2.5, 67, 2.0)],
          4: [(.75, 65, 1.6), (3.2, 63, 1.4)], 7: [(1.2, 65, 2.1)]}
for bar in range(BARS):
    chord, root = chords[(bar // 2) % 4], roots[(bar // 2) % 4]
    at, section = bar * 4, bar // 8
    if bar % 2 == 0:
        add('pad', pad(chord + [chord[0] - 12], 8 * BEAT + 2.8), at, .31)
        for i, note in enumerate(chord):
            add('keys', piano(note, 6.5), at + .035 + i * .015, .063, (i - 2) * .2)
        add('bass', bass(root, 5.9), at + .025, .135)
    else:
        # A quiet upper-voice answer, never a repeated fast arpeggio.
        for i, note in enumerate(chord[2:]):
            add('keys', piano(note, 4.8), at + 1.55 + i * .035, .025, .15 + i * .15)
    if section != 2 or bar % 2 == 0:
        add('drums', kick(), at + .025, .10)
    if bar % 4 == 3 and section != 2:
        add('drums', kick(), at + 3.35, .041)
    add('drums', snare(), at + 2.07, .032 if section != 2 else .017, -.18)
    for off, vol, pan in [(.6, .010, -.28), (1.65, .013, .28), (3.65, .009, .14)]:
        if section != 2 or off == 1.65:
            add('drums', hat(), at + off, vol, pan)
    if section in [1, 3]:
        for off, note, duration in phrase.get(bar % 8, []):
            add('lead', piano(note, duration * BEAT + 2.4), at + off,
                .039 if section == 1 else .032, -.22)

# Diffuse warm stereo space. Every tail wraps, including the last chord.
for bus, wet in [('keys', .28), ('lead', .31), ('pad', .13)]:
    filtered = sosfilt(butter(2, 2300, fs=SR, output='sos'), buses[bus], axis=0)
    for n in range(1, 5):
        echo = np.roll(filtered, round(.75 * BEAT * n * SR), axis=0)
        buses[bus] += echo[:, ::-1] * wet * .48 ** (n - 1)
    for n, delay in enumerate([.097, .173, .283, .419, .613, .827, 1.133, 1.573]):
        buses[bus] += np.roll(filtered, round(delay * SR), axis=0)[:, ::-1] * .045 * .84 ** n
mix = sum(buses.values())
# Filter a repeated cycle and retain its settled second pass, preserving the seam.
filters = butter(2, [28, 5200], fs=SR, btype='bandpass', output='sos')
mix = sosfilt(filters, np.tile(mix, (2, 1)), axis=0)[LENGTH:]
mix = np.tanh(mix * 1.1)
mix *= .73 / np.max(np.abs(mix))
output = Path(sys.argv[1] if len(sys.argv) > 1 else 'assets/thread-menu.mp3')
output.parent.mkdir(parents=True, exist_ok=True)
wave = output.with_suffix('.wav')
wavfile.write(wave, SR, np.round(mix * 32767).astype(np.int16))
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wave),
                '-c:a', 'libmp3lame', '-b:a', '160k', '-metadata', 'title=Stillwater',
                '-metadata', 'artist=One Thumb Arcade', '-metadata', 'album=THREAD',
                str(output)], check=True)
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wave),
                '-compression_level', '12', str(output.with_suffix('.flac'))], check=True)
wave.unlink()
print(f'{output}: {LENGTH / SR:.3f}s, peak {np.max(np.abs(mix)):.3f}, RMS {np.sqrt(np.mean(mix ** 2)):.3f}, loop seam delta {np.max(np.abs(mix[-1]-mix[0])):.6f}')
