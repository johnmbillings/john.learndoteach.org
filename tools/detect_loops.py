#!/usr/bin/env python3
"""Suggest practice-loop boundaries for a song by listening to its audio.

Structural boundaries (intro -> verse -> hook -> ...) show up as moments where
the harmony and the timbre both change at once. This finds them with the
classic Foote method:

  1. decode the audio to mono and reduce it to ~2 feature frames per second,
  2. describe each frame twice -- chroma (which pitch classes sound) and
     MFCCs (what the texture sounds like),
  3. build a self-similarity matrix for each description,
  4. slide a "checkerboard" kernel down the SSM diagonal. It scores high where
     the past looks like itself, the future looks like itself, and the two look
     nothing like each other -- i.e. at a section change,
  5. peak-pick that novelty curve into boundaries.

Output is a `loops` array ready to paste into songs.json.

Usage:
    python3 tools/detect_loops.py audio/driftwood-burnin.m4a
    python3 tools/detect_loops.py 'https://youtu.be/VIDEOID' --max-loops 10
    python3 tools/detect_loops.py song.mp3 --min-len 12 --label-prefix section

Needs: numpy, ffmpeg on PATH (or the imageio-ffmpeg package), and yt-dlp only
when the input is a URL.

The numbers it prints are a starting point, not an answer -- nudge them in the
practice page itself (set "fineTune": true to get the +/-0.1s buttons).
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np

SR = 22050
N_FFT = 2048
HOP = 512
FRAME_RATE = 2.0  # feature frames per second after aggregation


# --------------------------------------------------------------------------
# audio loading
# --------------------------------------------------------------------------

def find_ffmpeg():
    exe = shutil.which('ffmpeg')
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        sys.exit('error: ffmpeg not found. Install it (macOS: "brew install ffmpeg", '
                 'Debian/Ubuntu: "sudo apt install ffmpeg"), or get a private copy '
                 'with "python3 -m pip install imageio-ffmpeg".')


def yt_dlp_command():
    """yt-dlp as a command list.

    Prefer the binary, but fall back to running the module with this same
    interpreter: `pip install --user` drops the binary somewhere PATH often
    does not reach (on macOS, ~/Library/Python/3.x/bin), so "not on PATH" is
    a poor test for "not installed".
    """
    exe = shutil.which('yt-dlp')
    if exe:
        return [exe]
    try:
        import yt_dlp  # noqa: F401
    except ImportError:
        sys.exit('error: yt-dlp not found. Install it with '
                 '"python3 -m pip install yt-dlp" to read URLs.')
    return [sys.executable, '-m', 'yt_dlp']


def fetch_url(url, workdir, cookies_from_browser=None):
    """Download the audio track of a URL with yt-dlp; return the local path."""
    out = os.path.join(workdir, 'audio.%(ext)s')
    cmd = yt_dlp_command() + ['-f', 'bestaudio/best', '-o', out,
                              '--no-playlist', '--quiet', url]
    if cookies_from_browser:
        cmd += ['--cookies-from-browser', cookies_from_browser]
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError:
        sys.exit(
            'error: yt-dlp could not download that URL.\n'
            '  A "403 Forbidden" usually means YouTube declined to serve a\n'
            '  signed-out request rather than that anything is broken. Retry\n'
            '  with the cookies of a browser you are signed in to:\n'
            '      --cookies-from-browser safari      (or chrome, firefox, edge)\n'
            '  An older error -- "page needs to be reloaded", or a SABR warning\n'
            '  -- instead points at a stale yt-dlp. On Python 3.9 pip silently\n'
            '  installs a long-outdated release, since current yt-dlp needs\n'
            '  3.10+; "brew install yt-dlp" brings its own Python.\n'
            '  Either way, saving the audio by hand and passing the file works:\n'
            '      python3 detect_loops.py ~/Downloads/song.m4a')
    files = [f for f in os.listdir(workdir) if f.startswith('audio.')]
    if not files:
        sys.exit('error: yt-dlp produced no audio file.')
    return os.path.join(workdir, files[0])


def decode(path, ffmpeg):
    """Decode any audio/video file to a mono float32 array at SR."""
    cmd = [ffmpeg, '-v', 'error', '-i', path,
           '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-']
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        sys.exit(f'error: ffmpeg failed to decode {path}\n{proc.stderr.decode()[:500]}')
    y = np.frombuffer(proc.stdout, dtype=np.float32)
    if y.size == 0:
        sys.exit(f'error: no audio samples decoded from {path}')
    return y.astype(np.float64)


# --------------------------------------------------------------------------
# features
# --------------------------------------------------------------------------

def stft_power(y):
    """Magnitude-squared STFT, shape (n_bins, n_frames)."""
    win = np.hanning(N_FFT + 1)[:-1]
    n_frames = 1 + max(0, (len(y) - N_FFT) // HOP)
    if n_frames < 2:
        sys.exit('error: audio is too short to analyse.')
    idx = np.arange(N_FFT)[None, :] + HOP * np.arange(n_frames)[:, None]
    frames = y[idx] * win
    spec = np.fft.rfft(frames, axis=1)
    return (np.abs(spec) ** 2).T


def chroma_matrix():
    """Map FFT bins onto the 12 pitch classes (A1..C8 only)."""
    freqs = np.fft.rfftfreq(N_FFT, 1.0 / SR)
    m = np.zeros((12, len(freqs)))
    usable = (freqs >= 55.0) & (freqs <= 4186.0)
    midi = np.zeros_like(freqs)
    midi[usable] = 69 + 12 * np.log2(freqs[usable] / 440.0)
    for k in np.nonzero(usable)[0]:
        m[int(round(midi[k])) % 12, k] = 1.0
    return m


def mel_matrix(n_mels=40):
    """Triangular mel filterbank."""
    freqs = np.fft.rfftfreq(N_FFT, 1.0 / SR)
    to_mel = lambda f: 2595.0 * np.log10(1.0 + f / 700.0)
    to_hz = lambda m: 700.0 * (10.0 ** (m / 2595.0) - 1.0)
    edges = to_hz(np.linspace(to_mel(40.0), to_mel(SR / 2), n_mels + 2))
    fb = np.zeros((n_mels, len(freqs)))
    for i in range(n_mels):
        lo, mid, hi = edges[i], edges[i + 1], edges[i + 2]
        rising = (freqs >= lo) & (freqs <= mid)
        falling = (freqs > mid) & (freqs <= hi)
        fb[i, rising] = (freqs[rising] - lo) / max(mid - lo, 1e-9)
        fb[i, falling] = (hi - freqs[falling]) / max(hi - mid, 1e-9)
    return fb


def dct_matrix(n_out, n_in):
    """DCT-II basis, used to turn a log-mel spectrum into MFCCs."""
    n = np.arange(n_in)
    k = np.arange(n_out)[:, None]
    return np.cos(np.pi * k * (2 * n + 1) / (2 * n_in))


def aggregate(x, factor):
    """Average groups of `factor` columns together."""
    n = (x.shape[1] // factor) * factor
    if n == 0:
        return x[:, :1]
    return x[:, :n].reshape(x.shape[0], n // factor, factor).mean(axis=2)


def l2_norm(x):
    """L2-normalise each column."""
    return x / np.maximum(np.linalg.norm(x, axis=0, keepdims=True), 1e-9)


def embed(f, m):
    """Time-delay embedding: describe each frame by itself plus the m-1 frames
    after it. A single 0.5s slice is easy to confuse with an unrelated one;
    a couple of seconds of context is much harder to mistake, which sharpens
    the self-similarity matrix considerably."""
    if m <= 1:
        return f
    stacked = np.vstack([np.roll(f, -i, axis=1) for i in range(m)])
    return l2_norm(stacked[:, :f.shape[1] - (m - 1)])


def features(y):
    """Return (chroma, mfcc) feature matrices at FRAME_RATE frames/sec."""
    power = stft_power(y)
    factor = max(1, int(round(SR / HOP / FRAME_RATE)))

    chroma = chroma_matrix() @ power
    chroma = aggregate(chroma, factor)
    # Compress dynamics so a loud chord and a quiet one look alike -- we want
    # which notes are sounding, not how hard they are played.
    chroma = np.log1p(1000.0 * chroma / np.maximum(chroma.max(), 1e-9))

    mel = np.log(np.maximum(mel_matrix() @ power, 1e-10))
    mfcc = dct_matrix(14, mel.shape[0]) @ mel
    mfcc = aggregate(mfcc[1:], factor)  # drop coeff 0: that is just loudness
    # z-score each coefficient so no single one dominates the distance
    mfcc = (mfcc - mfcc.mean(axis=1, keepdims=True)) / np.maximum(
        mfcc.std(axis=1, keepdims=True), 1e-9)

    n = min(chroma.shape[1], mfcc.shape[1])
    return l2_norm(chroma[:, :n]), l2_norm(mfcc[:, :n])


# --------------------------------------------------------------------------
# novelty
# --------------------------------------------------------------------------

def checkerboard(half):
    """Foote checkerboard kernel with a Gaussian taper."""
    g = np.arange(-half, half + 1)
    taper = np.exp(-0.5 * (g / (half / 2.0)) ** 2)
    k = np.outer(taper, taper)
    sign = np.sign(np.outer(g, g))
    sign[half, :] = 0
    sign[:, half] = 0
    return k * sign


def novelty(feat, half):
    """Slide the checkerboard kernel down the SSM diagonal."""
    ssm = feat.T @ feat
    n = ssm.shape[0]
    pad = np.pad(ssm, half, mode='edge')
    kernel = checkerboard(half)
    out = np.empty(n)
    for i in range(n):
        out[i] = np.sum(pad[i:i + 2 * half + 1, i:i + 2 * half + 1] * kernel)
    return out


def smooth(x, width):
    if width < 2:
        return x
    w = np.hanning(width)
    w /= w.sum()
    return np.convolve(np.pad(x, width, mode='edge'), w, mode='same')[width:-width]


def normalise(x):
    x = x - x.min()
    return x / max(x.max(), 1e-9)


def pick_peaks(curve, min_gap, delta, max_peaks=None):
    """Local maxima that clear a local-average threshold by `delta`."""
    win = max(min_gap * 2, 4)
    local_mean = smooth(curve, win)
    threshold = local_mean + delta

    cand = [i for i in range(1, len(curve) - 1)
            if curve[i] >= curve[i - 1] and curve[i] > curve[i + 1]
            and curve[i] > threshold[i]]
    # strongest first, then enforce a minimum spacing
    cand.sort(key=lambda i: curve[i], reverse=True)
    kept = []
    for i in cand:
        if all(abs(i - j) >= min_gap for j in kept):
            kept.append(i)
        if max_peaks and len(kept) >= max_peaks:
            break
    return sorted(kept)


# --------------------------------------------------------------------------
# segments -> loops
# --------------------------------------------------------------------------

def fmt(sec):
    tenths = max(0, int(round(sec * 10)))
    return f'{tenths // 600}:{(tenths // 10) % 60:02d}.{tenths % 10}'


def lead_in(y, floor_db=-45.0):
    """Time of the first audible sample, so a silent head is not loop 1."""
    n = max(1, int(0.05 * SR))
    trimmed = y[:len(y) // n * n].reshape(-1, n)
    rms = np.sqrt((trimmed ** 2).mean(axis=1))
    db = 20 * np.log10(np.maximum(rms, 1e-10) / max(rms.max(), 1e-10))
    audible = np.nonzero(db > floor_db)[0]
    return float(audible[0]) * n / SR if len(audible) else 0.0


def build(args):
    ffmpeg = find_ffmpeg()
    with tempfile.TemporaryDirectory() as workdir:
        src = args.source
        if src.startswith(('http://', 'https://')):
            print(f'fetching {src} ...', file=sys.stderr)
            src = fetch_url(src, workdir, args.cookies_from_browser)
        y = decode(src, ffmpeg)

    duration = len(y) / SR
    print(f'{duration:.1f}s of audio, analysing ...', file=sys.stderr)

    chroma, mfcc = features(y)
    chroma, mfcc = embed(chroma, args.embed), embed(mfcc, args.embed)
    half = max(2, int(round(args.kernel * FRAME_RATE)))

    # Harmony and timbre vote independently; a boundary both agree on wins.
    curve = normalise(smooth(normalise(novelty(chroma, half))
                             + normalise(novelty(mfcc, half)), 5))

    min_gap = max(1, int(round(args.min_len * FRAME_RATE)))
    peaks = pick_peaks(curve, min_gap, args.delta, args.max_loops)

    start = lead_in(y) if args.trim_silence else 0.0
    times = [start]
    times += [p / FRAME_RATE for p in peaks if start + args.min_len < p / FRAME_RATE < duration - args.min_len]
    times.append(duration)

    loops = []
    for i in range(len(times) - 1):
        loop = {'start': fmt(times[i]), 'end': fmt(times[i + 1])}
        if args.label_prefix:
            loop['label'] = f'{args.label_prefix} {i + 1}'
        loops.append(loop)
    return loops, curve, peaks


def main():
    p = argparse.ArgumentParser(
        description='Suggest songs.json practice loops from a song\'s audio.')
    p.add_argument('source', help='audio/video file, or a URL yt-dlp can read')
    p.add_argument('--min-len', type=float, default=8.0,
                   help='shortest allowed section, seconds (default: 8; raise '
                        'for fewer, longer loops)')
    p.add_argument('--max-loops', type=int, default=None,
                   help='keep only the N strongest boundaries')
    p.add_argument('--kernel', type=float, default=6.0,
                   help='how far either side a boundary is judged over, '
                        'seconds (default: 6; raise for long sections)')
    p.add_argument('--embed', type=int, default=4,
                   help='frames of context per feature vector (default: 4 = 2s; '
                        '1 disables)')
    p.add_argument('--delta', type=float, default=0.05,
                   help='peak threshold above the local average (default: 0.05; '
                        'lower finds more boundaries)')
    p.add_argument('--cookies-from-browser', default=None, metavar='BROWSER',
                   help='hand yt-dlp the cookies of a browser you are signed in '
                        'to (safari, chrome, firefox, edge); needed when YouTube '
                        'answers 403 to a signed-out request')
    p.add_argument('--label-prefix', default=None,
                   help='auto-label the loops, e.g. "section" -> "section 1"')
    p.add_argument('--no-trim-silence', dest='trim_silence', action='store_false',
                   help='start loop 1 at 0:00 even if the track opens silent')
    p.add_argument('--slug', default=None,
                   help='wrap the output as a songs.json entry under this slug')
    p.add_argument('--video-id', default=None, help='videoId for the entry')
    p.add_argument('--title', default=None, help='title for the entry')
    args = p.parse_args()

    loops, curve, peaks = build(args)
    print(f'found {len(loops)} sections', file=sys.stderr)

    if args.slug:
        # Indented to drop straight into the "songs" object of songs.json.
        head = {'title': args.title or args.slug}
        if args.video_id:
            head['videoId'] = args.video_id
        head['fineTune'] = True
        fields = ',\n'.join(f'      {json.dumps(k)}: {json.dumps(v)}'
                            for k, v in head.items())
        body = ',\n'.join('        ' + json.dumps(l) for l in loops)
        print(f'    {json.dumps(args.slug)}: {{\n{fields},\n'
              f'      "loops": [\n{body}\n      ]\n    }}')
    else:
        body = ',\n'.join('    ' + json.dumps(l) for l in loops)
        print(f'"loops": [\n{body}\n]')


if __name__ == '__main__':
    main()
