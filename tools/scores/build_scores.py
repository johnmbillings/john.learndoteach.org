#!/usr/bin/env python3
"""Render per-loop SVG scores for songs.json.

Each piece below names a LilyPond source in this directory and the song in
songs.json it belongs to. For every loop of that song carrying a `score` path,
the measures it asks for are extracted from the source and rendered to a
cropped SVG at that path.

A loop says which measures it wants with `measures` ("4" or "4-6"); loops
without that field fall back to reading the range out of `label` ("mm 4-6").

Requires: lilypond on PATH.

Run from the repo root:
    python3 tools/scores/build_scores.py
"""
import json, re, subprocess, shutil, tempfile, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent

# How each piece is sliced and how its staff is set up.
#   extract  'volta'   — measures are the first \repeat volta block, whose
#                        first line is a pickup belonging to measure 1
#            'markers' — measures are the lines between %% BEGIN MEASURES
#                        and %% END MEASURES
PIECES = {
    'allemande': {
        'source': 'allemande.ly',
        'song': 'allemande',
        'extract': 'volta',
        'clef': 'bass',
        'key': '\\key g \\major',
        'time': '\\time 2/2',
        'hide_time_signature': True,
        'settings': [
            '\\set Timing.baseMoment = #(ly:make-moment 1/16)',
            "\\set Timing.beatStructure = #'(4 4 4 4)",
        ],
    },
    'loiseau-de-feu': {
        'source': 'loiseau-de-feu.ly',
        'song': 'loiseau-de-feu-excerpts',
        'extract': 'markers',
        'clef': 'bass',
        'key': '\\key c \\major',
        'time': '\\time 12/8',
        'hide_time_signature': False,
        'settings': ['\\tempo 8 = 108'],
    },
}


def read_measures(piece):
    """Return (pickup, measures) for a piece — pickup is '' when it has none."""
    src = (HERE / piece['source']).read_text()
    if piece['extract'] == 'volta':
        m = re.search(r'\\repeat\s+volta\s+2\s*\{(.+?)\n\s*\}', src, re.DOTALL)
        if not m:
            sys.exit(f"first \\repeat volta block not found in {piece['source']}")
        body = m.group(1)
    else:
        m = re.search(r'%%\s*BEGIN MEASURES\s*\n(.*?)\n\s*%%\s*END MEASURES',
                      src, re.DOTALL)
        if not m:
            sys.exit(f"%% BEGIN MEASURES block not found in {piece['source']}")
        body = m.group(1)

    lines = [l.strip() for l in body.splitlines() if l.strip()]
    lines = [l for l in lines if not l.startswith('%%')]
    pickup = ''
    if piece['extract'] == 'volta':
        pickup, lines = lines[0], lines[1:]
    measures = [ln for ln in lines if not ln.startswith('\\barNumberCheck')]
    return pickup, measures


def parse_range(loop):
    """Measure range for a loop: its `measures` field, else its label."""
    spec = loop.get('measures')
    if spec:
        nums = re.findall(r'\d+', str(spec))
        if not nums:
            sys.exit(f'no measure number in measures={spec!r}')
    else:
        nums = re.findall(r'\d+', loop.get('label', ''))
        if not nums:
            sys.exit(f'no measure range in label {loop.get("label")!r} '
                     '(add a "measures" field)')
    return int(nums[0]), int(nums[-1])


def make_ly(piece, pickup, measures, start, end):
    # The sources are in absolute octaves, so each measure stands alone — no
    # \relative context and no skipTypesetting of earlier measures needed.
    visible = '\n'.join('    ' + m for m in measures[start - 1:end])
    if start == 1:
        body = f'    {pickup}\n{visible}' if pickup else visible
    else:
        body = f'    \\set Score.currentBarNumber = #{start}\n{visible}'
    staff = ('\\new Staff \\with { \\remove "Time_signature_engraver" }'
             if piece['hide_time_signature'] else '\\new Staff')
    settings = ''.join(f'    {s}\n' for s in piece['settings'])
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
  {staff} {{
    \\clef "{piece['clef']}"
    {piece['key']}
    {piece['time']}
{settings}{body}
  }}
  \\layout {{
    % Project standard: hairpins begin just before their first note and end
    % just after their last note (negative shorten-pair lengthens each end).
    \\override Hairpin.shorten-pair = #'(-1 . -1)
  }}
}}
'''


songs = json.loads((REPO / 'songs.json').read_text())['songs']

with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    for name, piece in PIECES.items():
        song = songs.get(piece['song'])
        if not song:
            print(f'skip {name}: no song {piece["song"]!r} in songs.json')
            continue
        pickup, measures = read_measures(piece)
        for loop in song.get('loops', []):
            if not loop.get('score'):
                continue
            start, end = parse_range(loop)
            if end > len(measures):
                sys.exit(f'{name}: loop asks for m. {end}, source has '
                         f'{len(measures)} measures')
            out_base = tmp / Path(loop['score']).stem
            ly_path = out_base.with_suffix('.ly')
            ly_path.write_text(make_ly(piece, pickup, measures, start, end))
            r = subprocess.run(
                ['lilypond', '-dbackend=svg', '-dcrop=#t', '-dno-point-and-click',
                 '-o', str(out_base), str(ly_path)],
                capture_output=True, text=True)
            if r.returncode != 0:
                print(f'fail {ly_path.name}:', r.stderr[-400:])
                continue
            dest = REPO / loop['score']
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(str(out_base) + '.cropped.svg', dest)
            print(f'  -> {dest.relative_to(REPO)} ({dest.stat().st_size} bytes)')
