# Score builder

Renders the per-loop SVG scores in `scores/` from LilyPond sources in this directory.

## Sources
- `allemande.ly` — Bach Cello Suite No. 1, Allemande (BWV 1007). Forked from
  the community LilyPond typeset at
  [babysnakes/Bach---Cello-Suites](https://github.com/babysnakes/Bach---Cello-Suites)
  (Bärenreiter-based), with editorial slurs, bow markings and trills added
  by hand to follow the Peters/Becker edition. Written in **absolute octaves**
  (not `\relative`) so each measure is self-contained.
- `loiseau-de-feu.ly` — Stravinsky, *L'Oiseau de feu*, cello practice excerpts.
  **Not transcribed from IMSLP**: the egress policy on Claude Code on the web
  blocks `imslp.org`, so these measures were dictated from the printed part and
  engraved by hand. Treat each measure as a first pass to check against the
  part. Absolute octaves, one measure per line.

## Build
Requires LilyPond on `$PATH`. Run `tools/scores/setup.sh` to install it if
missing (`apt-get install lilypond`); in Claude Code on the web this runs
automatically via the `SessionStart` hook in `.claude/`, so a fresh session is
ready to rebuild scores without manual setup.

From the repo root:

```
python3 tools/scores/build_scores.py
```

The script reads each loop in `songs.json`, works out which measures it wants,
extracts them from the matching LilyPond source, and writes the cropped SVG to
the path in the loop's `score` field. A loop names its measures with the
`measures` field (`"1"` or `"4-6"`); loops without one fall back to parsing a
range out of the `label` (e.g. `"mm 4-6"`), which is how `allemande` works.
Prefer `measures` for new pieces — it keeps the human-facing label free to say
anything (`"passage 1 (m. 1)"`) without the builder misreading its digits.

Which source belongs to which song, and how each staff is set up (clef, key,
meter, beaming, tempo), lives in the `PIECES` table at the top of the script.
Add an entry there to wire up a new piece.

A source is sliced one of two ways, per its `extract` setting: `volta` takes
the first `\repeat volta` block, treating its first line as a pickup
(`allemande`); `markers` takes the lines between `%% BEGIN MEASURES` and
`%% END MEASURES` (`loiseau-de-feu`). New pieces should use `markers`.

The source is in **absolute octaves**, so every measure renders on its own —
ranges that don't start at m. 1 simply set `Score.currentBarNumber`, with no
need to parse earlier measures for pitch context. (This replaced an older
`\relative` + `skipTypesetting` scheme whose octave context drifted whenever a
measure used polyphony.)

### One measure per line (important)
The splitter treats **each line of the music as one measure**. Keep one measure
per line, and keep any `\set` / `\once` / `\override` on the **same line** as the
measure it applies to (e.g. `\once \set fingeringOrientations = #'(down) <…>4 …`).
A setting on its own line counts as an extra "measure" and shifts every later
index, corrupting all the SVGs. After a build, `git status` should show only the
SVG(s) you meant to change — if others changed, a measure boundary shifted.

## Adding notes or notations
See the `score-workflow` skill (`.claude/skills/score-workflow/`) for the full
process: transcribing notes from IMSLP, then adding fingerings/articulations/
dynamics a few measures at a time from edition screen captures, and rebuilding.
