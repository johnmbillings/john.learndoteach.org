# Score builder

Renders the SVG scores the site displays — the per-loop scores for the song
page, and the passage the measure-practice page drills — from the LilyPond
sources in this directory.

## Sources
- `allemande.ly` — Bach Cello Suite No. 1, Allemande (BWV 1007). Forked from
  the community LilyPond typeset at
  [babysnakes/Bach---Cello-Suites](https://github.com/babysnakes/Bach---Cello-Suites)
  (Bärenreiter-based), with editorial slurs, bow markings and trills added
  by hand to follow the Peters/Becker edition. Written in **absolute octaves**
  (not `\relative`) so each measure is self-contained.
- `measure-practice.ly` — passages from Stravinsky, *L'Oiseau de feu* (1919
  suite), cello part, Nieweg / McAlister edition (plate 22392), read from the
  part itself. **One `\absolute` block per movement**, each carrying its own
  clef and meter on setup lines before the music; absolute octaves and one
  measure per line, like the allemande.

  Transcribed so far:

  | block | movement | measures |
  |---|---|---|
  | `danseInfernale` | Danse infernale du roi Kastcheï | 63–68 |

  The Danse infernale is 3/4 at ♩ = 168, set at the movement's head and
  unchanged through these bars. Nearly every beat is the same limping cell — an
  eighth and two sixteenths — which is why mm 65–66, straight eighths, land the
  way they do. The part doesn't reprint the time signature in this system, so
  the builder removes the `Time_signature_engraver`; beams are manual, since
  neither the ♪♬ cell nor m 65's six-eighth beam is what 3/4 would do by itself.

  **Adding a movement** is a block here plus a row in `PRACTICE_MOVEMENTS` in
  the builder (LilyPond variable, movement id, first bar number), plus its
  measures in the `MOVEMENTS` table in `measure-practice.js`. The page works the
  SVG's name out from the movement id and the bar range, so no third list has to
  agree.

  The notes are duplicated between the `.ly` and `measure-practice.js` —
  **edit the two together**, or the page will play something it isn't showing.
  That file checks each measure adds up to a bar and says so on the page if one
  doesn't, which catches the likelier half of that mistake.

## Build
Requires LilyPond on `$PATH`. Run `tools/scores/setup.sh` to install it if
missing (`apt-get install lilypond`); in Claude Code on the web this runs
automatically via the `SessionStart` hook in `.claude/`, so a fresh session is
ready to rebuild scores without manual setup.

From the repo root:

```
python3 tools/scores/build_scores.py
```

For the song page, the script reads each loop in `songs.json`, parses the
measure range out of its `label` (e.g. `"mm 4-6"`), extracts those measures
from the matching LilyPond source, and writes the cropped SVG to the path in
the loop's `score` field.

For the measure-practice page it renders `measure-practice.ly` twice over: the
whole passage into `scores/measure-practice/mm-65-66.svg`, and each measure on
its own into `mm-65.svg`, `mm-66.svg` — the page shows one or the other
depending on which measures are selected. The bar number the source starts on
lives in `PRACTICE_FIRST_BAR` in the script, since a single-measure slice would
lose a `\set` written inside the music.

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

## Reading notes off a photograph
`tools/read_part.py` measures staff positions in a phone photo of a printed
part — it rectifies the page's tilt and curl, then reads each notehead against
the staff lines in its own columns and flags the ones worth a second look. It
does not read accidentals or articulations; those come off the crops it writes.

```
python3 tools/read_part.py part.jpg                       # list the systems
python3 tools/read_part.py part.jpg --system 0 --clef tenor --out /tmp/read
```

This is where `measure-practice.ly` came from. Needs numpy and pillow.

## Adding notes or notations
See the `score-workflow` skill (`.claude/skills/score-workflow/`) for the full
process: transcribing notes from IMSLP, then adding fingerings/articulations/
dynamics a few measures at a time from edition screen captures, and rebuilding.
