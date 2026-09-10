#!/usr/bin/env python3
"""Read staff positions off a photograph of a printed part.

A phone photo of a page on a music stand is curved, tilted and soft, and
eyeballing a notehead against a staff line in one is worth about half a line —
which is a third, i.e. a wrong note. This does the measuring instead:

  1. find the staff systems on the page,
  2. fit the five staff lines *per column*, so the page's curl and tilt are
     modelled rather than fought,
  3. resample the system onto a flat grid where the lines are horizontal and
     evenly spaced,
  4. find the bar lines and the stems,
  5. for each stem, find the notehead at its free end and measure its height
     against the staff lines **in its own columns**, so the fit's error cancels
     instead of accumulating,
  6. flag the readings worth a second look — a head that lands between a line
     and a space, or one whose ink has run into a beam or a ledger line.

What it will not do is read the music for you. It reports staff positions,
bar lines and a guess at the beaming; accidentals, articulations, slurs and
anything else editorial are left to your eyes — which is what the crops it
writes are for. Treat the note names as "where the head sits", not as pitch:
the key signature and the measure's own accidentals are yours to apply.

Usage:
    # what systems are on this page?
    python3 tools/read_part.py part.jpg

    # measure the last one, reading it in tenor clef, and write crops
    python3 tools/read_part.py part.jpg --system 1 --clef tenor --out /tmp/read

Needs: numpy, pillow.

Written for the measure-practice page (see tools/scores/README.md), where the
notes came off exactly this kind of photograph.
"""
import argparse
import sys
from pathlib import Path

try:
    import numpy as np
    from PIL import Image, ImageDraw
except ImportError:  # pragma: no cover - dependency hint is the whole point
    sys.exit('needs numpy and pillow:  pip install numpy pillow')

# The rectified grid: one staff space is SPACE pixels tall, the top line sits at
# TOP, and the image is stretched HSCALE times horizontally so a notehead is
# comfortably wider than a pixel or two of blur.
SPACE = 40.0
TOP = 160.0
HSCALE = 2

# The pitch on the top line of each clef. Everything else is counted from there
# in diatonic steps, which is all a staff position can tell you.
TOP_LINE = {'treble': ('F', 5), 'alto': ('G', 4), 'tenor': ('E', 4), 'bass': ('A', 3)}
LETTERS = 'CDEFGAB'


def step_name(clef, k):
    """The note k diatonic steps above the top line, e.g. tenor + 2 -> 'G4'."""
    letter, octave = TOP_LINE[clef]
    i = LETTERS.index(letter) + k
    return f'{LETTERS[i % 7]}{octave + i // 7}'


def load(path):
    img = Image.open(path).convert('L')
    return np.asarray(img, dtype=float)


def darkness(gray, threshold=150):
    return (gray < threshold).astype(float)


# --- finding the systems ---------------------------------------------------

def find_systems(dark, min_space=8.0, max_space=40.0, floor=0.25):
    """Staff systems as (top_y, bottom_y, spacing), top of the page first.

    Measured down a narrow strip through the middle of the page. Narrow,
    because a photographed page is tilted and a full-width row crosses several
    line heights at once, smearing every line away; middle, because the curl is
    worst at the edges.

    Scoring a comb of five lines is not enough on its own — a photograph of a
    page usually has a dark floor or music stand in it somewhere, and solid
    darkness scores a perfect five. So the four gaps between the lines are
    subtracted: a staff is dark *stripes on white*, and nothing else on the page
    is.
    """
    h, w = dark.shape
    strip = dark[:, int(w * 0.45):int(w * 0.55)]
    profile = strip.sum(axis=1) / strip.shape[1]

    systems = []
    for _ in range(12):
        best = None
        for sp in np.arange(min_space, max_space, 0.5):
            span = int(4 * sp) + 1
            if span >= h:
                break
            idx = np.arange(0, h - span)
            lines = sum(profile[idx + int(round(k * sp))] for k in range(5)) / 5
            gaps = sum(profile[idx + int(round((k + 0.5) * sp))] for k in range(4)) / 4
            score = lines - gaps
            top = int(np.argmax(score))
            if best is None or score[top] > best[0]:
                best = (score[top], top, sp)
        if best is None or best[0] < floor:
            break
        _, top, sp = best
        systems.append((float(top), float(top + 4 * sp), float(sp)))
        # Blank the staff we just took, plus a margin for its ledger lines, so
        # the next pass finds the next system and not this one's half-spacing.
        lo, hi = max(0, int(top - sp)), min(h, int(top + 5 * sp))
        profile[lo:hi] = 0.0
    return sorted(systems)


# --- fitting the staff -----------------------------------------------------

def comb_fit(profile, top_lo, top_hi, spacings):
    """Best (top, spacing) for five evenly spaced lines in a row profile.

    `top_lo`/`top_hi` bound where the *top* line may sit; the search is clamped
    so the fifth line and the row below it stay inside the profile, since the
    score interpolates between neighbouring rows.
    """
    best = None
    for sp in spacings:
        limit = min(top_hi, len(profile) - 4 * sp - 2)
        for top in np.arange(top_lo, limit, 0.25):
            total = 0.0
            for k in range(5):
                y = top + k * sp
                i = int(y)
                f = y - i
                total += profile[i] * (1 - f) + profile[i + 1] * f
            if best is None or total > best[0]:
                best = (total, top, sp)
    return best[1], best[2]


def robust_polyfit(x, y, degree, iterations=8):
    """A polynomial fit that shrugs off the columns where the comb locked on to
    a beam instead of the staff — a handful of wild outliers otherwise bend the
    whole curve."""
    keep = np.ones(len(x), bool)
    coeffs = np.polyfit(x, y, degree)
    for _ in range(iterations):
        coeffs = np.polyfit(x[keep], y[keep], degree)
        residual = y - np.polyval(coeffs, x)
        spread = np.std(residual[keep]) if keep.any() else 0.0
        keep = np.abs(residual) < max(1.5, 2 * spread)
        if keep.sum() < degree + 2:
            break
    return coeffs


def fit_geometry(dark, band, x0, x1, step=10):
    """Model the staff across the system: top-line y and spacing per column."""
    y0, y1, space = band
    lo, hi = max(0, int(y0 - 3 * space)), min(dark.shape[0], int(y1 + 3 * space))
    spacings = np.arange(space * 0.85, space * 1.15, 0.1)
    xs, tops, sps = [], [], []
    for x in range(x0, x1, step):
        window = dark[lo:hi, max(0, x - 25):x + 25]
        top, sp = comb_fit(window.sum(axis=1), 0, hi - lo, spacings)
        xs.append(x)
        tops.append(top + lo)
        sps.append(sp)
    xs = np.array(xs, dtype=float)
    return robust_polyfit(xs, np.array(tops), 2), robust_polyfit(xs, np.array(sps), 1)


def rectify(gray, top_coeffs, sp_coeffs, x0, x1, height=380):
    """Resample the system so the staff lines are straight, horizontal and
    SPACE apart — after this, a y coordinate means a pitch."""
    h, _ = gray.shape
    width = (x1 - x0) * HSCALE
    out = np.full((height, width), 255.0)
    for xo in range(width):
        x = x0 + xo / HSCALE
        top = np.polyval(top_coeffs, x)
        sp = np.polyval(sp_coeffs, x)
        xi = min(max(int(round(x)), 0), gray.shape[1] - 1)
        for yo in range(height):
            ys = top + (yo - TOP) / SPACE * sp
            y = int(np.floor(ys))
            f = ys - y
            if 0 <= y < h - 1:
                out[yo, xo] = gray[y, xi] * (1 - f) + gray[y + 1, xi] * f
    return out


# --- what is on the rectified staff ----------------------------------------

def vertical_runs(column, y0, y1, gap=2):
    """Unbroken (give or take `gap` pale pixels) dark stretches in one column."""
    runs, start, pale = [], None, 0
    for y in range(y0, y1):
        if column[y]:
            start = y if start is None else start
            pale = 0
        elif start is not None:
            pale += 1
            if pale > gap:
                runs.append((start, y - pale))
                start, pale = None, 0
    if start is not None:
        runs.append((start, y1 - 1))
    return runs


def find_verticals(rect, min_length=45):
    """Group the tall dark columns into bar lines and stems.

    A bar line spans the staff top to bottom; anything else that tall is a stem
    (or, occasionally, the two strokes of a sharp — which is why the ends are
    reported, so you can see what you are looking at).
    """
    dark = rect < 155
    y0, y1 = int(TOP - 3 * SPACE), int(TOP + 5.5 * SPACE)
    y0, y1 = max(0, y0), min(rect.shape[0], y1)

    columns = []
    for x in range(rect.shape[1]):
        for a, b in vertical_runs(dark[:, x], y0, y1):
            if b - a >= min_length:
                columns.append((x, a, b))

    groups, current = [], []
    for col in columns:
        if current and col[0] - current[-1][0] <= 2:
            current.append(col)
        else:
            if current:
                groups.append(current)
            current = [col]
    if current:
        groups.append(current)

    out = []
    for group in groups:
        x = int(np.mean([c[0] for c in group]))
        a = min(c[1] for c in group)
        b = max(c[2] for c in group)
        spans_staff = a <= TOP + SPACE * 0.5 and b >= TOP + 4 * SPACE - SPACE * 0.5
        out.append({'x': x, 'top': a, 'bottom': b, 'barline': spans_staff})
    return out


def head_of_stem(rect, stem):
    """Where the notehead sits on a stem, as a height in the rectified image.

    Looks at both ends: a stem-down note carries its head up and to the right, a
    stem-up note down and to the left, and the end with the head has far more
    ink in that window than the end with the beam. Then reads the ink profile
    across the head's own columns and measures the hump nearest that end.

    Returns (height, stem_down, hump_height_in_spaces) — a hump much taller or
    shorter than the one space a notehead occupies is a sign the head has run
    into something, and worth a look in the crop.
    """
    ink = np.clip(190 - rect, 0, 255) / 190.0
    width = int(SPACE * 0.9)                       # a notehead is about a space wide
    x, top, bottom = stem['x'], stem['top'], stem['bottom']

    right = ink[max(0, top - 10):top + int(SPACE), x + 2:x + 2 + width]
    left = ink[max(0, bottom - int(SPACE)):bottom + 10, max(0, x - 2 - width):x - 2]
    stem_down = right.sum() >= left.sum()

    # Search from a little past the stem's free end to a space or so back along
    # it: the head straddles that end, and nothing else does.
    if stem_down:
        band = ink[:, x + 2:x + 2 + width]
        lo, hi = top - SPACE * 0.6, top + SPACE * 0.9
    else:
        band = ink[:, max(0, x - 2 - width):x - 2]
        lo, hi = bottom - SPACE * 0.9, bottom + SPACE * 0.6
    profile = np.convolve(band.mean(axis=1), np.ones(5) / 5, 'same')

    lo = max(3, int(lo))
    hi = min(len(profile) - 3, int(hi))
    peak = max(range(lo, hi), key=lambda y: profile[y])

    # The half-height midpoint, not the centre of mass: a head that touches a
    # staff line or a ledger line shares ink with it, and the extra ink drags a
    # centroid a third of a step towards the line — which is how a photograph
    # turns a B into a C. The half-height edges move much less.
    threshold = 0.5 * profile[peak]
    a = b = peak
    while a > 3 and profile[a] > threshold:
        a -= 1
    while b < len(profile) - 4 and profile[b] > threshold:
        b += 1
    return (a + b) / 2.0, stem_down, (b - a) / SPACE


def local_top_line(rect, x, width=54):
    """The top staff line's height in this note's own columns.

    The rectification is good to a pixel or two, and a pixel or two is a tenth
    of a step — but the errors are systematic across a measure, so measuring the
    line and the head in the same columns cancels them.
    """
    ink = np.clip(190 - rect, 0, 255) / 190.0
    band = ink[:, max(0, x - 8):x + width]
    profile = np.convolve(band.mean(axis=1), np.ones(5) / 5, 'same')
    return comb_fit(profile, TOP - 12, TOP + 12, np.arange(SPACE - 2, SPACE + 2, 0.1))


def beam_thickness(rect, x0, x1):
    """How much ink sits in the beam band between two stems, in staff spaces.

    Rough: one beam runs about half a space, two run about one and a third with
    the gap. Enough to tell eighths from sixteenths, not enough to bet on.
    """
    dark = (rect[:, x0:x1] < 150).mean(axis=1)
    rows = [y for y in range(len(dark)) if dark[y] > 0.7]
    if not rows:
        return 0.0
    runs, start, prev = [], rows[0], rows[0]
    for y in rows[1:]:
        if y - prev > 2:
            runs.append((start, prev))
            start = y
        prev = y
    runs.append((start, prev))
    return max(b - a + 1 for a, b in runs) / SPACE


# --- putting it together ---------------------------------------------------

def split_accidentals(verticals, apart=1.0):
    """Separate the stems from the uprights of sharps and naturals.

    Both are tall thin strokes, but a sharp is *two* of them less than a space
    apart, and two stems never are — a printed note needs room for its head.
    Pairs that close are handed back separately rather than dropped, because
    where an accidental sits is exactly what you want to see in the crop.

    (Two stems that close would be 32nds crammed under one beam. If you are
    reading music like that off a phone photograph, believe the crops.)
    """
    stems, accidentals, i = [], [], 0
    while i < len(verticals):
        pair = i + 1 < len(verticals) and verticals[i + 1]['x'] - verticals[i]['x'] < apart * SPACE
        if pair:
            accidentals.extend(verticals[i:i + 2])
            i += 2
        else:
            stems.append(verticals[i])
            i += 1
    return stems, accidentals


def analyse(rect, clef):
    """Bar lines, stems and staff positions, in reading order."""
    verticals = find_verticals(rect)
    barlines = [v['x'] for v in verticals if v['barline']]
    tall = [v for v in verticals if not v['barline'] and v['bottom'] - v['top'] >= SPACE * 2.2]
    stems, accidentals = split_accidentals(tall)

    notes = []
    for stem in stems:
        y, stem_down, hump = head_of_stem(rect, stem)
        top, spacing = local_top_line(rect, stem['x'])
        k = (top - y) / (spacing / 2.0)
        notes.append({
            'x': stem['x'],
            'y': y,
            'steps': k,
            'name': step_name(clef, int(round(k))),
            'off': k - round(k),
            'stem': 'down' if stem_down else 'up',
            'hump': hump,
        })
    return barlines, notes, accidentals


def write_crops(rect, notes, barlines, out_dir, clef):
    """A picture per note with its own staff ruler drawn on, plus the whole
    system — because the measurement is a claim, and a claim about a photograph
    should come with the photograph."""
    out_dir.mkdir(parents=True, exist_ok=True)
    img = Image.fromarray(rect.astype(np.uint8)).convert('RGB')
    img.save(out_dir / 'system.png')

    for i, note in enumerate(notes):
        x = note['x']
        left, right = max(0, x - 45), min(rect.shape[1], x + 75)
        scale = 6
        crop = img.crop((left, 10, right, 220)).resize(((right - left) * scale, 210 * scale), Image.LANCZOS)
        draw = ImageDraw.Draw(crop)
        top, spacing = local_top_line(rect, x)
        for k in range(-2, 9):
            y = top - k * spacing / 2
            if 10 <= y < 220:
                yy = (y - 10) * scale
                on_line = k % 2 == 0
                colour = (220, 0, 0) if on_line else (0, 140, 255)
                draw.line([(0, yy), (40, yy)], fill=colour, width=2)
                draw.text((44, yy - 6), step_name(clef, k), fill=colour)
        crop.save(out_dir / f'note-{i:02d}-{note["name"]}.png')


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('photo', type=Path)
    ap.add_argument('--system', type=int, help='which staff system (0 = top of the page)')
    ap.add_argument('--clef', choices=sorted(TOP_LINE), default='treble')
    ap.add_argument('--x-range', nargs=2, type=int, metavar=('X0', 'X1'),
                    help='limit the fit to these columns of the photo')
    ap.add_argument('--out', type=Path, help='directory for the rectified system and note crops')
    args = ap.parse_args()

    gray = load(args.photo)
    dark = darkness(gray)
    systems = find_systems(dark)
    if not systems:
        sys.exit('no staff systems found — try a straighter, closer photograph')

    if args.system is None:
        print(f'{len(systems)} staff system(s) in {args.photo.name}:')
        for i, (y0, y1, space) in enumerate(systems):
            print(f'  [{i}] y {y0:.0f}–{y1:.0f}, {space:.1f}px between lines')
        print('\nre-run with --system N --clef alto|tenor|bass|treble to measure one')
        return

    band = systems[args.system]
    x0, x1 = args.x_range if args.x_range else (0, gray.shape[1])
    x0 = max(x0, 30)
    x1 = min(x1, gray.shape[1] - 30)
    top_coeffs, sp_coeffs = fit_geometry(dark, band, x0, x1)
    rect = rectify(gray, top_coeffs, sp_coeffs, x0, x1)
    barlines, notes, accidentals = analyse(rect, args.clef)

    print(f'system {args.system}, read in {args.clef} clef')
    print(f'  bar lines at x = {", ".join(str(b) for b in barlines)}  (rectified columns)')
    print(f'  {len(notes)} note(s), {len(accidentals) // 2} accidental(s) '
          f'at x = {", ".join(str(a["x"]) for a in accidentals[::2])}\n')
    print('   #   x    steps  reading  off   stem  head')
    measure = 1
    for i, note in enumerate(notes):
        while measure - 1 < len(barlines) and note['x'] > barlines[measure - 1]:
            measure += 1
            print(f'  --- bar line ---')
        # Two things earn a "check": a reading that sits a quarter-step or more
        # off its line or space, and a head whose hump isn't about one space
        # tall (it has run into a beam, a ledger line or its neighbour). Both
        # are answered by opening the crop.
        odd_head = not 0.7 <= note['hump'] <= 1.4
        flag = '  <-- check' if abs(note['off']) >= 0.25 or odd_head else ''
        print(f'  {i:3d} {note["x"]:5d} {note["steps"]:6.2f}  {note["name"]:>6}'
              f'  {abs(note["off"]):.2f}  {note["stem"]:>4}  {note["hump"]:.2f}{flag}')

    if len(notes) > 1:
        # Only the gaps between neighbouring stems inside one measure: a gap
        # that spans a bar line has no beam in it by definition, and would drag
        # the range down to nothing.
        beams = []
        for i in range(len(notes) - 1):
            a, b = notes[i]['x'] + 20, notes[i + 1]['x'] - 20
            if b - a <= 8 or any(a < line < b for line in barlines):
                continue
            beams.append(beam_thickness(rect, a, b))
        if beams:
            beams.sort()
            print(f'\n  beam band between stems: {beams[0]:.2f}–{beams[-1]:.2f} staff spaces'
                  f' (median {beams[len(beams) // 2]:.2f})')
            print('  (about 0.5 = one beam/eighths, about 1.3 = two beams/sixteenths,')
            print('   and a staff line inside the band adds roughly 0.25)')

    print('\n  Staff positions only: accidentals, articulations and the key')
    print('  signature are yours to read off the crops.')

    if args.out:
        write_crops(rect, notes, barlines, args.out, args.clef)
        print(f'\n  wrote {args.out}/system.png and one crop per note')


if __name__ == '__main__':
    main()
