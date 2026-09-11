#!/usr/bin/env python3
"""Render the SVG scores the site displays, from the LilyPond sources here.

Two jobs, one script:

  * the per-loop scores for songs.json — for each loop with a `label` like
    "mm 4-6" and a `score` path, extracts those measures from `allemande.ly`
    and renders a cropped SVG into the path the JSON points at;
  * the measure-practice passages — renders each transcribed movement of
    `measure-practice.ly` into `scores/measure-practice/`, which
    measure-practice.html displays.

Requires: lilypond on PATH.

Run from the repo root:
    python3 tools/scores/build_scores.py
"""
import json, re, subprocess, shutil, tempfile, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
SRC_LY = HERE / 'allemande.ly'
PRACTICE_LY = HERE / 'measure-practice.ly'
# The movements of measure-practice.ly that have music: the LilyPond variable
# holding them, the movement id measure-practice.js uses, and the bar number the
# block starts on (the music itself carries no \set for it). A new movement is
# a new block in the .ly and a new row here; the page works the SVG's name out
# from the id and the bars, so the two stay in step without a third list.
PRACTICE_MOVEMENTS = [
    ('danseInfernale', 'danse-infernale', 63),
]

src = SRC_LY.read_text()
m = re.search(r'\\repeat\s+volta\s+2\s*\{(.+?)\n\s*\}', src, re.DOTALL)
if not m:
    sys.exit(f'first \\repeat volta block not found in {SRC_LY}')
lines = [l.strip() for l in m.group(1).splitlines() if l.strip()]
pickup = lines[0]
measures = [ln for ln in lines[1:] if not ln.startswith('\\barNumberCheck')]


def parse_range(label):
    nums = re.findall(r'\d+', label)
    return int(nums[0]), int(nums[1])


def render(ly_text, dest, tmp):
    """Run LilyPond on `ly_text` and copy the cropped SVG to `dest`."""
    out_base = tmp / dest.stem
    ly_path = out_base.with_suffix('.ly')
    ly_path.write_text(ly_text)
    r = subprocess.run(
        ['lilypond', '-dbackend=svg', '-dcrop=#t', '-dno-point-and-click',
         '-o', str(out_base), str(ly_path)],
        capture_output=True, text=True)
    if r.returncode != 0:
        print(f'fail {ly_path.name}:', r.stderr[-400:])
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(str(out_base) + '.cropped.svg', dest)
    print(f'  -> {dest.relative_to(REPO)} ({dest.stat().st_size} bytes)')
    return True


def make_ly(start, end):
    # The source is in absolute octaves, so each measure stands alone — no
    # \relative context and no skipTypesetting of earlier measures needed.
    visible = '\n'.join('    ' + m for m in measures[start-1:end])
    if start == 1:
        body = f'    {pickup}\n{visible}'
    else:
        body = f'    \\set Score.currentBarNumber = #{start}\n{visible}'
    return f'''\\version "2.24.0"
\\paper {{
  indent = 0
  line-width = 180\\mm
  ragged-right = ##f
  ragged-last = ##t
  print-page-number = ##f
}}
\\header {{ tagline = "" }}
\\score {{
  \\new Staff \\with {{ \\remove "Time_signature_engraver" }} {{
    \\clef "bass"
    \\key g \\major
    \\time 2/2
    \\set Timing.baseMoment = #(ly:make-moment 1/16)
    \\set Timing.beatStructure = #'(4 4 4 4)
{body}
  }}
  \\layout {{
    % Project standard: hairpins begin just before their first note and end
    % just after their last note (negative shorten-pair lengthens each end).
    \\override Hairpin.shorten-pair = #'(-1 . -1)
  }}
}}
'''


def practice_block(variable):
    """One movement's block from measure-practice.ly, as (setup, measures).

    Setup lines (\\clef, \\time, \\set …) carry no bar check, so the bar-check
    line ending is what marks a line as a measure — the same one-measure-per-line
    discipline the allemande source keeps. The setup travels with its movement
    because the movements share neither clef nor meter.
    """
    body = re.search(variable + r'\s*=\s*\\absolute\s*\{(.+?)\n\}',
                     PRACTICE_LY.read_text(), re.DOTALL)
    if not body:
        sys.exit(f'{variable} block not found in {PRACTICE_LY}')
    lines = [l.strip() for l in body.group(1).splitlines() if l.strip()]
    return ([l for l in lines if not l.endswith('|')],
            [l for l in lines if l.endswith('|')])


def make_practice_ly(setup, bars, first_bar):
    """A snippet of `bars`, numbered from `first_bar`, under its own `setup`.

    No time signature is printed: the part sets it at the movement's head and
    doesn't reprint it where nothing changes, so neither does this. Bar numbers
    are forced visible on every measure — the numbers are the whole point of a
    page you drill measure by measure.
    """
    body = '\n'.join('    ' + line for line in list(setup) + list(bars))
    return f'''\\version "2.24.0"
\\paper {{
  indent = 0
  line-width = 170\\mm
  ragged-right = ##t
  print-page-number = ##f
}}
\\header {{ tagline = "" }}
\\score {{
  \\new Staff \\with {{ \\remove "Time_signature_engraver" }} {{
    \\set Score.currentBarNumber = #{first_bar}
    \\set Score.barNumberVisibility = #all-bar-numbers-visible
    \\override Score.BarNumber.break-visibility = #'#(#t #t #t)
{body}
  }}
  \\layout {{
    \\override Hairpin.shorten-pair = #'(-1 . -1)
  }}
}}
'''


def build_allemande(tmp):
    songs = json.loads((REPO / 'songs.json').read_text())
    allemande = songs['songs']['allemande']
    for loop in allemande['loops']:
        if not loop.get('score'):
            continue
        start, end = parse_range(loop['label'])
        render(make_ly(start, end), REPO / loop['score'], tmp)


def build_measure_practice(tmp):
    """One engraving per transcribed movement, named for the page to find."""
    out = REPO / 'scores' / 'measure-practice'
    wanted = set()
    for variable, movement_id, first_bar in PRACTICE_MOVEMENTS:
        setup, bars = practice_block(variable)
        last_bar = first_bar + len(bars) - 1
        name = f'{movement_id}-mm-{first_bar}-{last_bar}.svg'
        wanted.add(name)
        # The whole movement's transcribed measures in one line of music, with
        # every bar numbered: the page picks a range out of it rather than
        # showing a different picture per range, which would mean a file per
        # pair of measures.
        render(make_practice_ly(setup, bars, first_bar), out / name, tmp)
    for stale in sorted(out.glob('*.svg')):
        if stale.name not in wanted:
            stale.unlink()
            print(f'  -- removed {stale.relative_to(REPO)} (no longer built)')


with tempfile.TemporaryDirectory() as tmpdir:
    tmpdir = Path(tmpdir)
    build_allemande(tmpdir)
    build_measure_practice(tmpdir)
