# john.learndoteach.org

A small static site (GitHub Pages) of music practice pages: a looping
video/audio player with labelled sections, optional score images, scale
helpers, and a drone.

## Architecture

The site is data-driven. There is **one shared template** (`song.html` for
markup, `song.js` for the player/audio engine, `song.css` for styling) and
**one data file**, `songs.json`. A song page is just the template loaded with
a slug:

```
song.html?s=earth-song
```

`song.js` fetches `songs.json`, looks up `data.songs[slug]`, and renders the
page from that object. `index.html` builds the song list by iterating
`data.songs`. Nothing reads the top level of `songs.json` other than the
`songs` (and reserved `concerts`) keys, so extra keys like `_format` are
ignored by the app.

Because of this, **features are turned on per-song by adding a field to the
song's entry** — there is no per-song HTML or JS. Each optional feature is
gated by an `if (song.<field>)` check in `song.js`. Keeping the template fully
song-agnostic is what makes single-song export (below) a clean copy.

## Adding or editing a song

Add an entry under `"songs"` in `songs.json`:

```json
"my-song": {
  "title": "my song",
  "videoId": "YouTubeIdHere",
  "loops": [
    { "start": "0:00", "end": "0:12", "label": "intro" }
  ]
}
```

It appears automatically on the home page and at `song.html?s=my-song`.

### Song fields

| Field | Meaning |
|-------|---------|
| `title` | Display name (required). |
| `videoId` | YouTube id. Use this **or** `audio`. |
| `audio` | Audio file URL. Use this **or** `videoId`. |
| `loops` | Array of `{ start, end, label?, score? }`. Times are `M:SS` or `M:SS.s`. `label` shows above the loop; `score` is an image shown while that loop plays. |
| `fineTune` | `true` adds ±0.1s nudge buttons to loop times. |
| `scales` | Object `{ root, items }` that shows scale-playback buttons. `root` is a note name; each item is `{ mode, label? }` where `mode` is `ionian`/`major`/`dorian`/`phrygian`/`lydian`/`mixolydian`/`aeolian`/`minor`/`natural minor`/`locrian`. `label` overrides the button text. Example: `{ "root": "A♭", "items": [{ "mode": "aeolian", "label": "A♭ Aeolian (7♭)" }, { "mode": "dorian" }] }`. |
| `drone` | A **note name** to enable a sustained drone, e.g. `"A♭"`, `"Eb3"`, `"G2"`. Octave is optional and defaults to 3. Omit the field (or set `null`) to leave the drone off. |
| `speedMin` | Minimum value for the speed slider. |
| `footer` | HTML note shown below the controls. |
| `lyrics` | Preformatted lyrics text shown at the bottom. |

### Placing loops by ear

Every song page shows a live `at M:SS.s` readout of the playing position, and
each loop field has a **set** button that stamps that position into it. So a
section can be captured while listening: play, hit **set** on `start` where it
begins, **set** on `end` where it stops, then trim with the ±0.1s buttons
(`"fineTune": true`).

`+` adds a loop starting where the previous one ended, and works on a song with
no loops at all — it seeds the first one at `0:00`. Audio-mode songs also get
the browser's own player, so the track can be scrubbed while hunting for a
boundary. Loops placed this way live only in the page until they are written
back into `songs.json`.

### Auto-detecting loop sections

`tools/detect_loops.py` listens to a song and suggests where its sections
start, so a new page begins with real loop times instead of guesses:

```
python3 tools/detect_loops.py audio/driftwood-burnin.m4a
python3 tools/detect_loops.py 'https://youtu.be/VIDEOID' \
    --slug my-song --video-id VIDEOID --title 'my song'
```

Plain output is a `loops` array to paste into the song's entry; with `--slug`
it prints the whole entry, indented to drop straight into the `songs` object.

How it works: the audio is reduced to two frames per second and described
twice per frame — chroma (which pitch classes sound) and MFCCs (what the
texture sounds like). Each description becomes a self-similarity matrix, and a
Foote checkerboard kernel slides down the diagonal to score how much the music
changes at each instant. Harmony and timbre vote separately, and the summed
novelty curve is peak-picked into boundaries.

| Flag | Use |
|------|-----|
| `--min-len` | Shortest allowed section, seconds (default 8). Raise for fewer, longer loops. |
| `--delta` | Peak threshold above the local average (default 0.05). Lower finds more boundaries. |
| `--kernel` | How far either side a boundary is judged over (default 6s). Raise for long, slow sections. |
| `--max-loops` | Keep only the N strongest boundaries. |
| `--embed` | Frames of context per feature vector (default 4 = 2s); `1` disables. |
| `--label-prefix` | Auto-label loops, e.g. `section` → `section 1`. |

Needs `numpy` and `ffmpeg`, plus `yt-dlp` when the input is a URL.

**Treat the output as a first draft.** Checked against the hand-labelled
`driftwood-burnin` loops, the defaults find 7 of its 9 boundaries within 5s
(6 of the 8 named sections land within about a second or two), but roughly
half the boundaries it reports are extra sub-phrase splits. Expect to delete a
few and nudge the rest — set `"fineTune": true` on the song to get the ±0.1s
buttons. It hears *changes in sound*, so two musically distinct verses played
with identical instrumentation may not register a boundary at all.

### The drone

The drone (borrowed from the [mojotrio](https://github.com/johnmbillings/mojotrio)
drone tool) plays a sustained root with an optional perfect fifth and a volume
control, shown as a footnote at the bottom of the page. Its pitch comes
entirely from the song's `drone` field: `song.js` parses the note name to a
MIDI number (`pitchToMidi`), so the same field both enables the drone and sets
its note and label. The fifth is derived as root × 1.5.

## The shifting page

`shifting.html` / `shifting.js` is a standalone practice page (not a song). It
plays a major scale in strict time and, on the note before a string crossing,
slides the pitch down — **inside that note's own beat** — to the note the hand
passes through on the way to the new position. In G major the fourth finger
plays B and carries down to G♯, which is where the hand has to sit for the first
finger to cross to C on the next string. The shift adds no note and no beat; it
bends one that's already there. The ghost pitch is deliberately outside the key:
the point is to stop hearing it as a mistake.

Each key keeps a list of `{ on, drop }` — the index of the scale note the hand
shifts during, and how many semitones it travels below it. Click a note in the
strip to put a shift on it, `▾`/`▴` to move the note the hand slides to.

`localStorage` (under `shifting:prefs`) holds **only the keys whose layout you
have changed**, compared against the derived default. Storing all twelve freezes
whatever the defaults were the first time you opened the page — improve the
derivation later and every existing browser keeps the old shifts forever, with
no way to tell a stale copy from a deliberate edit. That is exactly what
happened between v2 and v3. The blob carries a `v` for the same reason: v1 hung
a shift *between* two notes, v2 stored every key, so both are ignored rather
than misread.

The defaults are derived from the fingerboard rather than guessed. Fingered
1–2–4 with a forward extension, a major scale falls onto the strings in groups
of three — degrees 1-2-3, then 4-5-6, then 7-8-9 — each group starting on the
first finger a string higher. So the hand shifts on the last note of each group:
**indices 2, 5 and 8**. Crossing puts the first finger a fifth above where it
sat, and the hand lands closed (the extension is a forward reach made after it
arrives), so the fourth finger carrying the hand comes to rest a major third
below the note being crossed to:

| shift | drop | lands on | in the key? |
|---|---|---|---|
| index 2 (3rd degree) | 3 | the raised tonic (G♯ in G) | never |
| index 5 (6th degree) | 2 | the dominant (D in G) | always |
| index 8 (9th degree) | 2 | the octave (G in G) | always |

All three fall out of the scale's shape, so they are identical in every key —
which is why transposing a layout around the circle is the right thing to do.
The strip greys out a ghost note that's already in the key, leaving the raised
tonic under the first shift as the one the eye and ear go to.

What *does* vary is the instrument. Where a crossing note happens to be an open
string — low D and A major especially — the open string covers the move and
there is no shift; remove it with `×`. Two octaves also end with four notes that
need a shift *up* the A string, a gesture this page doesn't model.

The derivation script is `tools/cello_shifts.py`.

`shifting.html` loads its scripts with a `?v=` query. GitHub Pages serves HTML
and JS with the same short max-age, so a reload can pick up fresh markup while
reusing a stale script from cache — fatal the moment the two disagree about
which controls exist (it happened: the markup dropped a toggle the cached script
still wired up, and init died with the page half-built). **Bump `?v=` whenever
either file changes in a way the other depends on.** As a backstop the script
looks its controls up through `control()`, which warns and skips rather than
throwing, so a future skew costs one dead control instead of the whole page.
And because a phone has no console, an inline watcher shows a visible notice
(naming the file that failed, with a cache-busting reload link) whenever
`shifting.js` doesn't reach its last line — a script that fails to fetch
otherwise renders a perfect-looking page that does nothing.

The audible slide comes from the `shape` option added to `playSequence` in
`audio.js`: a per-note `{ artic, tail }`, where `tail` is
`{ semis, at, over, level }` — the pitch leaves a note partway through its beat,
travels, and arrives before the next note is bowed, with the tone easing as the
hand moves. `artic` lets the note after it re-articulate as a fresh bow on a new
string. Everything else on the site passes no shape and is unaffected.

## The measure-practice pages

One engine, one page per piece. `practice.js` is everything that isn't the
music: the movement and measure-range pickers, playback, the metronome and
count-in, the bar-and-beat counter, and the strip of chips that lights up as it
plays. A **piece file** holds the music and ends by calling `Practice.start()`
with it; a page loads the engine and then one piece file.

| page | piece file | piece |
|---|---|---|
| `measure-practice.html` | `firebird-practice.js` | Stravinsky, *L'Oiseau de feu* (1919 suite), cello |
| `barber.html` | `barber-practice.js` | Barber, Violin Concerto Op. 14, cello |

A piece is `{ id, title, shortTitle?, sourceNote?, movements }`, and a movement
is `{ id, name, tempo?, targetBpm?, meter?, unitsPerBeat, beatsPerMeasure,
measures? }`. Every movement of the work is listed, transcribed or not — a
dropdown that hid the empty ones would also hide how much of a part is still
unread — and a movement with no `measures` says so and sits out.

Notes are written in sixteenths: `eighth('A2')`, `sixteenth('A3')`,
`rest(12)` for a bar of 3/4, `chord(2, 'A2', 'G3', 'A3')` for a stopped chord.
A movement's measures may come in **passages** with gaps between them (mm 1–12
and 63–68 of the Danse infernale); each passage is engraved separately and a
range can't reach across a gap. `checkPassage()` refuses to let a measure that
doesn't add up to a bar pass silently.

A transcribed passage exists twice — engraved in `tools/scores/*.ly`, and as
notes in the piece file — so **edit the two together**. See
`tools/scores/README.md` for the engraving side.

The note being played lights up twice too: as a chip in the strip, and as a band
over the engraving. The engraving is an `<img>` and nothing inside it can be
restyled, so the builder stamps each notehead and rest in the SVG with the moment
it falls on and marks each system's staff lines; `practice.js` reads those out of
the file and positions a translucent band, as wide as the note is long. The
stamped moments in time order are the passage's events in reading order, so they
pair off with the notes in the piece file one for one — and if they ever stop
pairing off, the band stays away rather than pointing at the wrong bar.

### Copyright

The Firebird suite (1919) is public domain in the US, so its notes can be
transcribed and engraved here freely; the *edition* the part comes from is not,
which is why no scan of it is in this repository.

**Barber's Violin Concerto is not.** Written 1939, premiered 1941, published by
G. Schirmer and protected in the US into the late 2030s; the orchestral parts
are rental-only and it is not on IMSLP. Nothing of it can be fetched, and this
repository is a public website, so anything added to `barber-practice.js` is a
copy of a copyrighted part published on the open web. Read the measures you need
off the part on your stand, keep them to what a rehearsal actually needs, and
leave the rest out.

## Assets

Per-song score images live under `scores/<slug>/` (e.g.
`scores/allemande/mm-1-4.svg`) so a song's assets are self-contained. Scores
are generated from LilyPond source by `tools/scores/build_scores.py`, which
writes to whatever path the song's `loop.score` points at.

## Exporting a single song to its own site

To split one song into a standalone, deployable site:

```
node tools/export.mjs <slug> <dest-dir>
# e.g. node tools/export.mjs allemande ../bach-site
```

This copies the shared template/engine/styles plus only the assets that song
references, and writes a `songs.json` containing just that song. Add a `CNAME`
in the destination if you want a custom domain.

## Validation (CI)

`.github/workflows/validate.yml` runs on every push/PR and:

1. validates `songs.json` against `songs.schema.json` (via `ajv-cli`), and
2. runs `node tools/check-assets.mjs` to confirm every referenced score/audio
   file actually exists.

Run the same checks locally:

```
npx ajv-cli@5 validate --spec=draft7 --strict=false -s songs.schema.json -d songs.json
node tools/check-assets.mjs
```

## Deployment

GitHub Pages serves the `main` branch root. A `.nojekyll` file disables Jekyll
so files are served as-is (this is a plain static site, not a Jekyll site).
Pushing/merging to `main` redeploys via the `deploy-pages` workflow
(`.github/workflows/deploy-pages.yml`), which uploads the repo root and deploys
it with `actions/deploy-pages`.

For this workflow to be the active deploy path, the repo's Pages **source** must
be set to **GitHub Actions** (Settings → Pages → Build and deployment → Source).
The workflow also has a `workflow_dispatch` trigger, so a stuck deploy can be
re-run on demand from the **Actions** tab, and a `concurrency` policy that
cancels an in-progress deploy when a newer one starts (so a hung deploy no longer
blocks the next push).

**Gotcha:** if a change isn't showing up live after a few minutes, the deploy
may be stuck or the HTML cached, not your code. Check the repo's **Actions** tab
for the latest `deploy-pages` run (re-run it if it's stuck), and note that the
custom domain can cache HTML harder than a browser hard-refresh clears — a fresh
deploy purges it.
