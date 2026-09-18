# Score builder

Renders the SVG scores the site displays — the per-loop scores for the song
page, and the passages the practice pages drill — from the LilyPond sources in
this directory.

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
  | `danseInfernaleOpening` | Danse infernale du roi Kastcheï | 1–12 |
  | `danseInfernale` | Danse infernale du roi Kastcheï | 63–68 |

  A movement can hold several blocks — passages with gaps between them. Each
  block is rendered separately and the page shows whichever passage the selected
  measures fall in; a range can't reach across a gap.

  mm 1–12 are the opening: the three-note chord (A2 on the G string, G3 on the
  D, open A3, struck at once — *non arpeg. possibile*), nine bars of rest, and
  the entry at m 11 on an octave A. The part prints mm 2–10 as a nine-bar
  multirest; they are written out one to a bar here, numbered, because counting
  them is the whole point of that passage on the page. Note also that `\sfff`
  is not one of LilyPond's dynamics — it's built inline with
  `-#(make-dynamic-script "sfff")`, the way `allemande.ly` builds its text
  dynamics.

  The Danse infernale is 3/4 at ♩ = 168, set at the movement's head and
  unchanged through these bars. Nearly every beat is the same limping cell — an
  eighth and two sixteenths — which is why mm 65–66, straight eighths, land the
  way they do. The part doesn't reprint the time signature in this system, so
  the builder removes the `Time_signature_engraver`; beams are manual, since
  neither the ♪♬ cell nor m 65's six-eighth beam is what 3/4 would do by itself.

- `barber.ly` — Barber, Violin Concerto Op. 14, III, mm 3–8, from the orchestra
  cello part rented from G. Schirmer. **The concerto is in copyright** (published
  1941; protected in the US into the late 2030s, longer in Europe), which is why
  it is a file of its own rather than another block in `measure-practice.ly`:
  what is engraved here is a reproduction of a rented part on a public website,
  and the boundary belongs somewhere someone will see it. Six measures are what
  is there — a phrase drilled before a rehearsal, not a movement published.
  Absolute octaves and one measure per line, like the rest.

  III is 4/4 at ♩ = 192. mm 3–6 are all one double stop, E2 under A2, struck
  staccato, and only the placing of the entries changes. m 3 is the cellos
  taking the mutes off (*senza sord.*): sf on the downbeat, then the answer pp
  on the last third of a triplet whose first two thirds are rests, then a
  quarter rest and the stop once more. m 4 drops the triplet — eight plain
  eighths, of which only the third and the seventh sound, squarely on beats 2
  and 4. Both bars answer on those two beats; m 3 pushes the beat-2 entry late,
  to the triplet's last third, and m 4 puts it on the beat.
  mm 5–6 are identical to each other and move the entries again, onto beats 1
  and 3. m 7 keeps that rhythm and drops the stop for two single notes, E2 and
  F2 a half step apart. m 8 returns to m 3's rhythm under a different stop: A2
  holds on top and the note beneath falls from E2 to D2, a fourth becoming a
  fifth.

  Only m 3 was read off a photograph; mm 4–8 were written from a description of
  their rhythm and pitches. Their staccato dots match m 3 rather than the part,
  their empty beats are spelled as eighth rests rather than quarter rests, and
  no dynamic is written after m 3's pp.

  **Adding a passage** is a block in one of these sources plus a row in
  `PRACTICE_MOVEMENTS` in the builder (source path, LilyPond variable, movement
  id, first bar number), plus its measures in the piece file the page loads —
  `firebird-practice.js`, `barber-practice.js`. The page works the SVG's name out
  from the movement id and the bar range, so no third list has to agree. All the
  engravings land in `scores/measure-practice/`, whichever source they came from,
  because the pages share the directory.

  The notes are duplicated between the `.ly` and the piece file —
  **edit the two together**, or the page will play something it isn't showing.
  `practice.js` checks each measure adds up to a bar and says so on the page if
  one doesn't, which catches the likelier half of that mistake.

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

For the practice pages it renders one SVG per row of `PRACTICE_MOVEMENTS` —
the whole of that passage, every bar numbered, into
`scores/measure-practice/<movement-id>-mm-<first>-<last>.svg`. The page shows
whichever passage the selected measures fall in and lets the range be picked out
of it, rather than a picture per pair of measures. The bar number a block starts
on lives in the table, since the music carries no `\set` for it.

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

This is where `measure-practice.ly` and `barber.ly` came from. Needs numpy and
pillow.

## Adding notes or notations
See the `score-workflow` skill (`.claude/skills/score-workflow/`) for the full
process: transcribing notes from IMSLP, then adding fingerings/articulations/
dynamics a few measures at a time from edition screen captures, and rebuilding.
