#!/usr/bin/env python3
"""Find the beat grid of a recording, for the synced metronome in song.html.

The page can click along with a track once it knows three things: the tempo,
the time of one downbeat, and (for a recording that was not played to a
click) how the tempo wanders. This script listens for them:

  1. decode the audio to mono and compute an onset-strength envelope — how
     much the spectrum lurches at each instant, ~86 times a second,
  2. autocorrelate it to find the tempo (with a mild preference for the
     60–180 bpm range, so a fast song is not reported at half speed),
  3. track the beats with Ellis's dynamic-programming beat tracker, which
     picks the sequence of onsets that best fits that tempo,
  4. fit a straight line through the tracked beats (that is the bpm and the
     offset), pick the downbeat phase, and measure how far the real beats
     stray from the line. If they stray more than a few tens of
     milliseconds, also emit `anchors`: downbeat times every few bars, which
     let the page follow the drift instead of fighting it.

Output is a `beat` object ready to paste into the song's entry in songs.json.

Usage:
    python3 tools/detect_beats.py audio/driftwood-burnin.m4a
    python3 tools/detect_beats.py 'https://youtu.be/VIDEOID' --bpm 113
    python3 tools/detect_beats.py song.m4a --beats-per-bar 3 --downbeat 0:19.5

Needs: numpy, ffmpeg on PATH (or the imageio-ffmpeg package), and yt-dlp only
when the input is a URL. (yt-dlp runs on your own machine; YouTube refuses
downloads from cloud addresses. If it answers 403, add
--cookies-from-browser safari, or chrome/firefox/edge.)

As with detect_loops.py, the numbers are a starting point: the page has
tap, set and ±nudge buttons for every one of them, and a "copy" button that
hands back the tuned object.
"""

import argparse
import json
import os
import sys
import tempfile

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from detect_loops import decode, fetch_url, find_ffmpeg, lead_in, mel_matrix, SR  # noqa: E402

N_FFT = 1024
HOP = 256
FPS = SR / HOP  # onset-envelope frames per second (~86)


# --------------------------------------------------------------------------
# onset strength
# --------------------------------------------------------------------------

def onset_envelope(y):
    """Spectral flux on a log-mel spectrogram: the rise in energy across all
    bands from one frame to the next, half-wave rectified so that only
    attacks count. Smoothed a little and centred on its local mean."""
    win = np.hanning(N_FFT + 1)[:-1]
    n_frames = 1 + max(0, (len(y) - N_FFT) // HOP)
    if n_frames < FPS * 4:
        sys.exit('error: audio is too short to find a beat in.')
    idx = np.arange(N_FFT)[None, :] + HOP * np.arange(n_frames)[:, None]
    power = np.abs(np.fft.rfft(y[idx] * win, axis=1)) ** 2
    mel = np.log1p(1000.0 * (power @ mel_matrix_for(N_FFT).T) / max(power.max(), 1e-9))
    flux = np.diff(mel, axis=0, prepend=mel[:1])
    env = np.maximum(flux, 0).sum(axis=1)
    # local-mean removal keeps a loud chorus from drowning out a quiet verse
    width = int(FPS * 0.5)
    kernel = np.ones(width) / width
    local = np.convolve(np.pad(env, width // 2, mode='edge'), kernel, mode='same')[width // 2:width // 2 + len(env)]
    env = np.maximum(env - local, 0)
    return env / max(env.max(), 1e-9)


def mel_matrix_for(n_fft):
    """detect_loops' filterbank is sized for its own N_FFT; rebuild for ours."""
    freqs = np.fft.rfftfreq(n_fft, 1.0 / SR)
    n_mels = 40
    to_mel = lambda f: 2595.0 * np.log10(1.0 + f / 700.0)  # noqa: E731
    to_hz = lambda m: 700.0 * (10.0 ** (m / 2595.0) - 1.0)  # noqa: E731
    edges = to_hz(np.linspace(to_mel(40.0), to_mel(SR / 2), n_mels + 2))
    fb = np.zeros((n_mels, len(freqs)))
    for i in range(n_mels):
        lo, mid, hi = edges[i], edges[i + 1], edges[i + 2]
        rising = (freqs >= lo) & (freqs <= mid)
        falling = (freqs > mid) & (freqs <= hi)
        fb[i, rising] = (freqs[rising] - lo) / max(mid - lo, 1e-9)
        fb[i, falling] = (hi - freqs[falling]) / max(hi - mid, 1e-9)
    return fb


# --------------------------------------------------------------------------
# tempo
# --------------------------------------------------------------------------

def estimate_tempo(env, hint=None, lo=50.0, hi=220.0):
    """Autocorrelation of the onset envelope, weighted by a log-Gaussian prior
    centred on 120 bpm (or tightly on `hint`); the best lag is the beat."""
    n = len(env)
    e = env - env.mean()
    ac = np.correlate(e, e, mode='full')[n - 1:]
    ac /= max(ac[0], 1e-9)
    lags = np.arange(n)
    bpm = np.zeros(n)
    bpm[1:] = 60.0 * FPS / lags[1:]
    valid = (bpm >= lo) & (bpm <= hi)
    if hint:
        prior = np.exp(-0.5 * ((np.log2(np.maximum(bpm, 1e-9) / hint)) / 0.08) ** 2)
    else:
        prior = np.exp(-0.5 * ((np.log2(np.maximum(bpm, 1e-9) / 120.0)) / 0.9) ** 2)
    score = np.where(valid, ac * prior, -np.inf)
    lag = int(np.argmax(score))
    # refine the lag by parabolic interpolation of the autocorrelation peak
    if 1 <= lag < n - 1 and valid[lag - 1] and valid[lag + 1]:
        a, b, c = ac[lag - 1], ac[lag], ac[lag + 1]
        denom = a - 2 * b + c
        if denom != 0:
            lag = lag + 0.5 * (a - c) / denom
    return 60.0 * FPS / lag


# --------------------------------------------------------------------------
# beat tracking (Ellis 2007)
# --------------------------------------------------------------------------

def track_beats(env, bpm, tightness=400.0):
    """Dynamic programming: each frame scores its onset strength plus the best
    earlier beat, penalised by how far that gap is from the tempo period
    (on a log scale, so a 10% rush costs the same as a 10% drag)."""
    period = 60.0 * FPS / bpm
    n = len(env)
    lo = max(1, int(round(period / 2)))
    hi = int(round(period * 2))
    window = np.arange(-hi, -lo + 1)
    penalty = -tightness * (np.log(-window / period)) ** 2
    cum = np.zeros(n)
    back = np.full(n, -1, dtype=int)
    for i in range(n):
        idx = i + window
        ok = idx >= 0
        if not ok.any():
            cum[i] = env[i]
            continue
        cand = cum[idx[ok]] + penalty[ok]
        k = int(np.argmax(cand))
        cum[i] = env[i] + cand[k]
        back[i] = idx[ok][k]
    # start from the best score in the final period, walk back
    tail = cum[max(0, n - hi):]
    i = int(np.argmax(tail)) + max(0, n - hi)
    beats = []
    while i >= 0:
        beats.append(i)
        i = back[i]
    beats = np.array(beats[::-1], dtype=float)
    # refine each beat to the onset peak within ±2 frames
    for j, b in enumerate(beats):
        lo_i, hi_i = int(max(0, b - 2)), int(min(n - 1, b + 2))
        beats[j] = lo_i + int(np.argmax(env[lo_i:hi_i + 1]))
    return beats / FPS


# --------------------------------------------------------------------------
# grid fitting
# --------------------------------------------------------------------------

def fit_grid(beat_times):
    """Least-squares line through beat index -> time. Returns (bpm, offset,
    residuals) with offset the fitted time of beat 0."""
    k = np.arange(len(beat_times))
    slope, intercept = np.polyfit(k, beat_times, 1)
    resid = beat_times - (intercept + slope * k)
    return 60.0 / slope, intercept, resid


def pick_downbeat(env, beat_times, beats_per_bar):
    """The phase whose beats carry the most onset energy. A rough guess: a
    backbeat-heavy drum part can fool it, which is what the page's
    'beat 1 ▸' button is for."""
    frames = np.clip(np.round(beat_times * FPS).astype(int), 0, len(env) - 1)
    best, best_score = 0, -1.0
    for phase in range(beats_per_bar):
        score = env[frames[phase::beats_per_bar]].mean()
        if score > best_score:
            best, best_score = phase, score
    return best


def fmt(sec):
    hundredths = max(0, int(round(sec * 100)))
    return f'{hundredths // 6000}:{(hundredths // 100) % 60:02d}.{hundredths % 100:02d}'


def parse_time(t):
    parts = t.split(':')
    if len(parts) == 1:
        return float(parts[0])
    return int(parts[0]) * 60 + float(parts[1])


def build(args):
    ffmpeg = find_ffmpeg()
    with tempfile.TemporaryDirectory() as workdir:
        src = args.source
        if src.startswith(('http://', 'https://')):
            print(f'fetching {src} ...', file=sys.stderr)
            src = fetch_url(src, workdir, args.cookies_from_browser)
        y = decode(src, ffmpeg)
    duration = len(y) / SR
    print(f'{duration:.1f}s of audio, listening for the beat ...', file=sys.stderr)

    env = onset_envelope(y)
    bpm0 = estimate_tempo(env, args.bpm)
    print(f'tempo by autocorrelation: {bpm0:.1f} bpm', file=sys.stderr)

    beats = track_beats(env, bpm0, args.tightness)
    # drop the silent head and tail: beats tracked through silence are noise
    start = lead_in(y)
    beats = beats[(beats >= start) & (beats <= duration - 0.5)]
    if len(beats) < 8:
        sys.exit('error: too few beats tracked to fit a grid.')

    bpm, offset, resid = fit_grid(beats)
    bpb = args.beats_per_bar
    phase = pick_downbeat(env, beats, bpb)
    if args.downbeat is not None:
        # snap the user's downbeat to the nearest tracked beat and take its phase
        t = parse_time(args.downbeat)
        phase = int(np.argmin(np.abs(beats - t))) % bpb

    spb = 60.0 / bpm
    downbeat = offset + phase * spb
    # report the first downbeat that is audibly inside the song
    while downbeat < start - 0.01:
        downbeat += bpb * spb

    drift = float(np.abs(resid).max())
    print(f'fitted grid: {bpm:.2f} bpm, downbeat at {fmt(downbeat)}; '
          f'beats stray up to {drift * 1000:.0f} ms from it', file=sys.stderr)

    beat = {'bpm': round(bpm, 2), 'offset': fmt(downbeat), 'beatsPerBar': bpb,
            'from': fmt(start), 'to': fmt(duration)}

    if drift > args.drift or args.anchors:
        # downbeat times every `every` bars, straight from the tracked beats
        step = bpb * args.every
        anchors = [fmt(t) for t in beats[phase::step]]
        beat['anchors'] = anchors
        print(f'tempo wanders — emitting {len(anchors)} anchors '
              f'(one every {args.every} bars)', file=sys.stderr)
    return beat, beats


def main():
    p = argparse.ArgumentParser(description="Find a song's beat grid for songs.json.")
    p.add_argument('source', help='audio/video file, or a URL yt-dlp can read')
    p.add_argument('--bpm', type=float, default=None,
                   help='rough tempo, if you know it; keeps the detector from '
                        'answering at half or double speed')
    p.add_argument('--beats-per-bar', type=int, default=4, help='default 4')
    p.add_argument('--downbeat', default=None, metavar='M:SS.s',
                   help='time of any beat 1, to pin the bar phase')
    p.add_argument('--drift', type=float, default=0.06,
                   help='emit anchors when beats stray more than this many '
                        'seconds from a straight tempo (default 0.06)')
    p.add_argument('--anchors', action='store_true', help='always emit anchors')
    p.add_argument('--every', type=int, default=4,
                   help='bars between anchors (default 4)')
    p.add_argument('--tightness', type=float, default=400.0,
                   help='how hard the tracker holds the tempo (default 400; '
                        'lower follows a rubato performance more willingly)')
    p.add_argument('--cookies-from-browser', default=None, metavar='BROWSER',
                   help='hand yt-dlp the cookies of a browser you are signed in to')
    p.add_argument('--beats', action='store_true',
                   help='also print every tracked beat time, one per line')
    args = p.parse_args()

    beat, beats = build(args)
    if args.beats:
        for t in beats:
            print(fmt(t), file=sys.stderr)
    print(f'"beat": {json.dumps(beat, ensure_ascii=False)}')


if __name__ == '__main__':
    main()
