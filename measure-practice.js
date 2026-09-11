// Measure practice. A part, movement by movement: pick a movement, pick a
// range of its measures, and hear them played as printed — the notes and the
// rhythm — so a bar that won't come can be drilled on its own and then put
// back into its phrase.
//
// The piece is Stravinsky's L'Oiseau de feu (1919 suite), cello part, from the
// Nieweg / McAlister edition (plate 22392). All seven movements are listed,
// because a dropdown that hides the ones with nothing in them would also hide
// how much of the part is still untranscribed. A movement with no measures
// says so and sits out.
//
// The part numbers its bars in three runs, which is why a movement carries its
// own numbers rather than a global count: the Introduction numbers from 1 and
// the next two movements continue it (to m 81), the Ronde des princesses
// starts again at 1, as does the Danse infernale, and the Berceuse starts again
// at 1 with the Final continuing it from m 47.
//
// TWO SOURCES, ONE PASSAGE: the engraving comes from
// tools/scores/measure-practice.ly (built to scores/measure-practice/ by
// tools/scores/build_scores.py, one SVG per transcribed movement) and the
// playback from the MOVEMENTS table below. They describe the same music and
// have to be edited together — a note changed in one and not the other means
// the page plays something it isn't showing. checkPassage() catches the
// easiest way to get that wrong.
//
// Audio helpers (pitchToMidi, the cello voice, the shared clock) live in audio.js.

const { pitchToMidi } = AudioKit;
const cello = AudioKit.instruments.cello;

// Durations are counted in sixteenths — the shortest note here, so every value
// in the passage is a whole number of them.
const eighth = (pitch) => ({ pitch, units: 2 });
const sixteenth = (pitch) => ({ pitch, units: 1 });
const eighthRest = () => ({ pitch: null, units: 2 });
// One beat of the Danse infernale's col legno figure: an eighth and two
// sixteenths, all on the same note. Written once because the part writes it
// fourteen times in six bars.
const cell = (pitch) => [eighth(pitch), sixteenth(pitch), sixteenth(pitch)];

const G = 'G#4';   // the col legno note: G♯ on the first ledger line, all four bars

// The movements of the suite, in playing order. `measures` is what has been
// transcribed and checked against the part so far; the rest are listed for
// their names and their printed tempo until someone does the reading.
//
// A movement that carries music also carries how to count it: `unitsPerBeat`
// (sixteenths to a printed beat) and `beatsPerMeasure`, which drive the
// metronome, the count-in and the bar check.
const MOVEMENTS = [
  { id: 'introduction', name: 'Introduction', tempo: '♪ = 108' },
  { id: 'oiseau-et-sa-danse', name: 'L’Oiseau de feu et sa danse', tempo: '♩ = 152' },
  { id: 'variation', name: 'Variation de l’Oiseau de feu', tempo: '♩. = 76' },
  { id: 'ronde-des-princesses', name: 'Ronde des princesses', tempo: '♩ = 72' },
  {
    id: 'danse-infernale',
    name: 'Danse infernale du roi Kastcheï',
    tempo: '♩ = 168',
    targetBpm: 168,
    meter: '3/4',
    clef: 'tenor',
    unitsPerBeat: 4,      // a quarter is the printed beat; the unit is a sixteenth
    beatsPerMeasure: 3,
    // mm 63–68: one system of the part and one phrase — col legno on a hammered
    // G♯, the same G♯ answered normale and marcatissimo, then col legno again.
    // Nearly every beat is the same limping cell, which is what makes the two
    // normale bars of straight eighths land the way they do.
    measures: [
      // In m 63 the rest stands in for the cell's own eighth, so the bar still limps.
      { n: 63, notes: [eighthRest(), sixteenth(G), sixteenth(G), ...cell(G), ...cell(G)] },
      { n: 64, notes: [...cell(G), ...cell(G), eighth(G), eighthRest()] },
      { n: 65, notes: ['F4', 'G#4', 'C5', 'B4', 'G#4', 'B4'].map(eighth) },
      { n: 66, notes: [...['D#5', 'D5', 'G#4', 'F4', 'B4'].map(eighth), eighthRest()] },
      { n: 67, notes: [...cell(G), ...cell(G), ...cell(G)] },
      { n: 68, notes: [...cell(G), ...cell(G), eighth(G), eighthRest()] },
    ],
  },
  { id: 'berceuse', name: 'Berceuse', tempo: '♩ = 60' },
  { id: 'final', name: 'Final', tempo: '𝅗𝅥 = 54' },
];

const PREFS_KEY = 'measure-practice:v3';

let tempoBpm = 60;          // ♩ = , so a sixteenth is 15/tempo seconds
let metronomeOn = true;
let countIn = true;
let loopOn = true;
// What is selected: a movement, and a range of its measures (indices, inclusive).
let movementIdx = MOVEMENTS.findIndex(m => (m.measures || []).length);
let fromIdx = 0;
let toIdx = 0;

let playing = false;
let loopTimerId = null;
let passTimers = [];        // pending rest highlights, cleared when playback stops

// --- the passage ------------------------------------------------------------

function movement() {
  return MOVEMENTS[movementIdx] || MOVEMENTS[0];
}

function measures() {
  return movement().measures || [];
}

function playable(m) {
  return (m.measures || []).length > 0;
}

function measureUnits(measure) {
  return measure.notes.reduce((total, note) => total + note.units, 0);
}

// Every bar has to come to a bar's worth of music. This is the mistake an edit
// to the table above will actually make — a note dropped, a duration mistyped —
// and it is silent otherwise: playback would simply run short and the loop
// would drift against the metronome.
function checkPassage() {
  const problems = [];
  MOVEMENTS.filter(playable).forEach(m => {
    const want = m.unitsPerBeat * m.beatsPerMeasure;
    m.measures.forEach(measure => {
      const got = measureUnits(measure);
      if (got !== want) problems.push(`${m.name} m ${measure.n}: ${got} sixteenths, not ${want}`);
    });
  });
  return problems;
}

// The selected measures as one flat list: { pitch, units, at } with `at` the
// note's start in sixteenths from the top of the range. Playback, the strip and
// the metronome all count in these, so they can never drift apart.
function selectedEvents() {
  const out = [];
  let at = 0;
  measures().slice(fromIdx, toIdx + 1).forEach(measure => {
    measure.notes.forEach(note => {
      out.push({ ...note, at });
      at += note.units;
    });
  });
  return out;
}

// Contiguous stretches of notes of equal length. playSequence lays its notes on
// an unbroken grid of one step, so a rest — or a change of note value — can
// only be expressed as a break between two runs.
function runsOf(events) {
  const runs = [];
  let current = null;
  events.forEach((e, i) => {
    if (e.pitch == null) { current = null; return; }
    if (!current || current.units !== e.units) {
      current = { at: e.at, index: i, units: e.units, notes: [] };
      runs.push(current);
    }
    current.notes.push(e.pitch);
  });
  return runs;
}

// "G#4" → "G♯". The octave is left off: on the page it's the letter and the
// accidental you're reading off the staff, and the staff is right above.
function displayName(pitch) {
  return pitch.replace('#', '♯').replace('b', '♭').replace(/-?\d+$/, '');
}

// --- the score and the strip ------------------------------------------------

// The builder names each movement's engraving after the movement and the bars
// it covers, so the page can work the path out rather than store it twice.
function scoreSrc() {
  const list = measures();
  if (!list.length) return null;
  const first = list[0].n;
  const last = list[list.length - 1].n;
  return `scores/measure-practice/${movement().id}-mm-${first}-${last}.svg`;
}

function buildScore() {
  const wrapper = document.getElementById('score-wrapper');
  const img = document.getElementById('score-img');
  if (!img || !wrapper) return;
  const src = scoreSrc();
  wrapper.hidden = !src;
  if (!src) return;
  const list = measures();
  img.src = src;
  img.alt = `${movement().name}, measures ${list[0].n} to ${list[list.length - 1].n}`;
}

// One chip per note, grouped by measure and numbered, each chip as wide as the
// note is long — so the strip reads as the rhythm, not just the pitches. The
// col legno bars are one note over and over: what you are drilling there is the
// shape of the beat, and the shape is what the widths show.
function buildStrip() {
  const strip = document.getElementById('strip');
  if (!strip) return;
  strip.innerHTML = '';
  let n = 0;
  measures().slice(fromIdx, toIdx + 1).forEach(measure => {
    const group = document.createElement('div');
    group.className = 'measure';

    const label = document.createElement('span');
    label.className = 'measure-no';
    label.textContent = measure.n;
    group.appendChild(label);

    const notes = document.createElement('div');
    notes.className = 'measure-notes';
    measure.notes.forEach(note => {
      const chip = document.createElement('span');
      chip.className = 'note' + (note.pitch == null ? ' rest' : '');
      chip.dataset.note = n++;
      // Width straight from the duration — a sixteenth is half an eighth, so
      // the cell's limp is visible before you press play. Proportional rather
      // than fixed, so a bar keeps its shape when the row has to shrink to fit
      // a phone; every bar fills the same width because every bar is a bar.
      chip.style.flexGrow = note.units;
      chip.style.flexBasis = '0';
      chip.textContent = note.pitch == null ? 'rest' : displayName(note.pitch);
      if (note.pitch == null) chip.title = 'rest';
      notes.appendChild(chip);
    });
    group.appendChild(notes);
    strip.appendChild(group);
  });
}

function clearHighlight() {
  document.querySelectorAll('#strip .sounding').forEach(el => el.classList.remove('sounding'));
}

function highlight(i) {
  clearHighlight();
  const el = document.querySelector(`#strip [data-note="${i}"]`);
  if (el) el.classList.add('sounding');
}

// --- playback ---------------------------------------------------------------

function stopPlayback() {
  playing = false;
  AudioKit.stopSequence();
  if (loopTimerId) { clearTimeout(loopTimerId); loopTimerId = null; }
  passTimers.forEach(id => clearTimeout(id));
  passTimers = [];
  clearHighlight();
  const btn = document.getElementById('play');
  if (btn) { btn.classList.remove('playing'); btn.textContent = 'play'; }
  updateWakeLock();
}

function finishPlayback() {
  loopTimerId = null;
  stopPlayback();
}

function startPlayback() {
  if (playing) { stopPlayback(); return; }
  if (!playable(movement())) return;
  playing = true;
  const btn = document.getElementById('play');
  if (btn) { btn.classList.add('playing'); btn.textContent = 'stop'; }
  updateWakeLock();
  schedulePass(null, false, true);
}

// Re-trigger a running loop so a changed control (a new tempo, a different
// range) takes effect at the next seam instead of only after a manual stop.
function restartIfLooping() {
  // Only a looping pass gets torn down: outside a loop the pass you're hearing
  // is the one you asked for, and restarting it from the top mid-measure is a
  // worse surprise than waiting out the few seconds it has left.
  if (!playing || !loopOn) return;
  if (loopTimerId) { clearTimeout(loopTimerId); loopTimerId = null; }
  clearHighlight();
  schedulePass(null, false, false); // already mid-practice: no second count-in
}

// Play one pass, then schedule the next on the audio clock (gapless) or finish.
// `lead` delays the first note by a count-in measure and ticks it out.
function schedulePass(when, chain, lead) {
  // Bind audio output to whatever is connected right now — a context built for
  // the phone speaker plays silence once CarPlay or a Bluetooth speaker joins.
  if (lead) AudioKit.prepareOutput();

  const here = movement();
  const events = selectedEvents();
  if (!events.length) { finishPlayback(); return; }
  const unit = (60 / tempoBpm) / here.unitsPerBeat;   // one sixteenth
  const beat = unit * here.unitsPerBeat;
  const leadBeats = lead && countIn ? here.beatsPerMeasure : 0;
  const start = when != null ? when
    : AudioKit.currentTime() + 0.06 + leadBeats * beat;

  // Short, hard-bitten notes with a sliver of silence after them: accents under
  // ff in the normale bars, staccato under the wood of the bow in the others.
  // Neither is a legato line, so one envelope serves both.
  runsOf(events).forEach((run, r) => {
    const step = run.units * unit;
    const base = pitchToMidi(run.notes[0]);
    cello.playSequence(base, run.notes.map(p => pitchToMidi(p) - base), {
      step,
      gate: step * 0.55,
      attack: 0.012,
      sustain: 0.4,
      release: 0.04,
      peak: 0.2,
      when: start + run.at * unit,
      // Only the first run of a fresh pass may clear what came before; the rest
      // chain onto it, or they'd cancel the runs scheduled ahead of them.
      chain: chain || r > 0,
      onNote: (semi, i) => highlight(run.index + i),
    });
  });

  // Rests get lit too — an empty beat you can see coming is the difference
  // between counting the bar and guessing at it.
  const now = AudioKit.currentTime();
  events.forEach((e, i) => {
    if (e.pitch != null) return;
    const id = setTimeout(() => {
      const k = passTimers.indexOf(id); if (k >= 0) passTimers.splice(k, 1);
      if (playing) highlight(i);
    }, Math.max(0, (start + e.at * unit - now) * 1000));
    passTimers.push(id);
  });

  // Ticks are scheduled after the notes: a fresh playSequence silences whatever
  // was pending on the clock, which would take any tick placed before it.
  const totalUnits = events.reduce((sum, e) => sum + e.units, 0);
  if (metronomeOn) {
    const beats = Math.round(totalUnits / here.unitsPerBeat);
    for (let b = 0; b < beats; b++) {
      AudioKit.click(start + b * beat, b % here.beatsPerMeasure === 0);
    }
  }
  for (let b = 0; b < leadBeats; b++) {
    AudioKit.click(start - (leadBeats - b) * beat, b === 0);
  }

  const nextStart = start + totalUnits * unit;
  if (loopOn) {
    const ahead = Math.min(0.25, totalUnits * unit * 0.5);
    const delay = Math.max(0, (nextStart - ahead - AudioKit.currentTime()) * 1000);
    loopTimerId = setTimeout(() => {
      if (loopOn && playing) schedulePass(nextStart, true, false);
      else loopTimerId = setTimeout(finishPlayback, Math.max(0, (nextStart - AudioKit.currentTime()) * 1000));
    }, delay);
  } else {
    loopTimerId = setTimeout(finishPlayback, Math.max(0, (nextStart - AudioKit.currentTime()) * 1000));
  }
}

// --- the screen stays awake while it plays ----------------------------------

let wakeLock = null;

async function acquireWakeLock() {
  if (wakeLock || !('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (e) { /* unsupported or blocked — practice still works */ }
}

function releaseWakeLock() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

function updateWakeLock() {
  if (playing) acquireWakeLock();
  else releaseWakeLock();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') updateWakeLock();
});

// --- controls ---------------------------------------------------------------
// Every control is looked up through control(), which tolerates its absence: a
// browser can pair this script with a cached copy of the markup that predates
// it (or the reverse), and the cost of that has to be one dead control, never a
// page that stops halfway through setting itself up.
function control(id) {
  return document.getElementById(id);
}

function selectMovement(index) {
  if (playing) stopPlayback();
  movementIdx = Math.max(0, Math.min(index, MOVEMENTS.length - 1));
  const list = measures();
  fromIdx = 0;
  toIdx = Math.max(0, list.length - 1);
  buildRangeOptions();
  buildScore();
  buildStrip();
  syncControls();
  savePrefs();
}

function selectRange(from, to) {
  const last = measures().length - 1;
  fromIdx = Math.max(0, Math.min(from, last));
  toIdx = Math.max(fromIdx, Math.min(to, last));
  syncControls();
  buildStrip();
  savePrefs();
  restartIfLooping();
}

function buildMovementOptions() {
  const select = control('movement');
  if (!select) return;
  select.innerHTML = '';
  MOVEMENTS.forEach((m, i) => {
    const option = document.createElement('option');
    option.value = i;
    const bars = m.measures || [];
    // The state goes in the option itself: picking a movement to find nothing
    // there is a worse surprise than reading it in the list first.
    option.textContent = bars.length
      ? `${m.name} — mm ${bars[0].n}–${bars[bars.length - 1].n}`
      : `${m.name} — not transcribed yet`;
    select.appendChild(option);
  });
  select.addEventListener('change', () => selectMovement(Number(select.value)));
}

// Two lists of bar numbers, rebuilt whenever the movement changes. The second
// can't point before the first — dragging "from" past "to" pushes "to" along
// rather than refusing the change, since what you meant is obvious.
function buildRangeOptions() {
  const from = control('from');
  const to = control('to');
  if (!from || !to) return;
  [from, to].forEach(select => {
    select.innerHTML = '';
    measures().forEach((measure, i) => {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = measure.n;
      select.appendChild(option);
    });
  });
}

function syncControls() {
  const here = movement();
  const list = measures();
  const has = playable(here);

  const movementSelect = control('movement');
  if (movementSelect) movementSelect.value = movementIdx;
  const from = control('from');
  const to = control('to');
  if (from) { from.value = fromIdx; from.disabled = !has; }
  if (to) { to.value = toIdx; to.disabled = !has; }
  const whole = control('whole');
  if (whole) {
    whole.disabled = !has;
    whole.classList.toggle('on', has && fromIdx === 0 && toIdx === list.length - 1);
  }
  const play = control('play');
  if (play) play.disabled = !has;

  const strip = control('strip');
  if (strip) strip.hidden = !has;

  // The printed tempo, shown next to the tempo box rather than enforced by it:
  // it's the number this movement is aimed at, and knowing how far off you are
  // is the point of practising it slowly. It belongs to the movement, so it
  // follows the movement rather than sitting where the first one left it.
  const target = control('tempo-target');
  if (target) target.textContent = here.targetBpm ? `(printed ${here.targetBpm})` : '';

  // What this movement is, and what there is of it: the tempo it's printed at,
  // and either the bars that are ready or a plain word that none are.
  const state = control('movement-state');
  if (state) {
    state.textContent = has
      ? `${here.meter}, printed tempo ${here.tempo} — mm ${list[0].n}–${list[list.length - 1].n} transcribed`
      : `printed tempo ${here.tempo} — no measures transcribed yet, so there is nothing to play here`;
  }
}

function initControls() {
  const play = control('play');
  if (play) play.addEventListener('click', startPlayback);

  const whole = control('whole');
  if (whole) whole.addEventListener('click', () => selectRange(0, measures().length - 1));

  const from = control('from');
  if (from) from.addEventListener('change', () => {
    const v = Number(from.value);
    selectRange(v, Math.max(v, toIdx));
  });
  const to = control('to');
  if (to) to.addEventListener('change', () => {
    const v = Number(to.value);
    selectRange(Math.min(v, fromIdx), v);
  });

  const tempo = control('tempo');
  if (tempo) {
    tempo.value = tempoBpm;
    tempo.addEventListener('change', () => {
      const v = Math.round(Number(tempo.value));
      if (!Number.isFinite(v) || v < 20 || v > 200) { tempo.value = tempoBpm; return; }
      tempoBpm = v;
      savePrefs();
      restartIfLooping();
    });
  }

  [['metronome', v => { metronomeOn = v; }],
   ['count-in', v => { countIn = v; }],
   ['loop', v => { loopOn = v; }]].forEach(([id, set]) => {
    const el = control(id);
    if (!el) return;
    el.addEventListener('change', () => {
      set(el.checked);
      savePrefs();
      // The metronome is heard on the next pass; loop and count-in only matter
      // at a seam, so none of them need the current pass torn down.
      if (id === 'metronome') restartIfLooping();
    });
  });

  const note = control('source-note');
  if (note) {
    note.innerHTML = 'Stravinsky, <i>L’Oiseau de feu</i> (1919 suite) — cello part, '
      + 'Nieweg / McAlister edition (plate 22392), read from the part. '
      + 'transcribed measures are engraved from <code>tools/scores/measure-practice.ly</code>; '
      + 'the movements are listed as the part numbers them.';
  }
}

// --- prefs ------------------------------------------------------------------

function savePrefs() {
  try {
    const list = measures();
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      tempo: tempoBpm, metronome: metronomeOn, countIn, loop: loopOn,
      movement: movement().id,
      from: list.length ? list[fromIdx].n : null,
      to: list.length ? list[toIdx].n : null,
    }));
  } catch (e) { /* private mode, or a full store — the page still works */ }
}

function applyPrefs() {
  let p;
  try { p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); } catch (e) { return; }
  if (!p || typeof p !== 'object') return;
  if (Number.isFinite(p.tempo) && p.tempo >= 20 && p.tempo <= 200) tempoBpm = Math.round(p.tempo);
  if (typeof p.metronome === 'boolean') metronomeOn = p.metronome;
  if (typeof p.countIn === 'boolean') countIn = p.countIn;
  if (typeof p.loop === 'boolean') loopOn = p.loop;
  const m = MOVEMENTS.findIndex(x => x.id === p.movement);
  if (m >= 0) movementIdx = m;
  // Stored as bar numbers rather than indices: measures added in front of a
  // movement would otherwise silently shift the range you left selected.
  const list = measures();
  const a = list.findIndex(x => x.n === p.from);
  const b = list.findIndex(x => x.n === p.to);
  if (a >= 0 && b >= a) { fromIdx = a; toIdx = b; }
  else { fromIdx = 0; toIdx = Math.max(0, list.length - 1); }
  [['metronome', metronomeOn], ['count-in', countIn], ['loop', loopOn]].forEach(([id, v]) => {
    const el = control(id);
    if (el) el.checked = v;
  });
}

// A measure that doesn't add up is a bug in the table above, not in the
// browser, and the page says so out loud rather than quietly playing a short
// bar that drifts against the metronome.
const passageProblems = checkPassage();
if (passageProblems.length) {
  const box = control('load-error');
  const detail = control('load-error-detail');
  if (box) box.hidden = false;
  if (detail) detail.textContent = 'passage: ' + passageProblems.join('; ');
}

toIdx = Math.max(0, measures().length - 1);
applyPrefs();
buildMovementOptions();
buildRangeOptions();
buildScore();
buildStrip();
initControls();
syncControls();

// Reached only if everything above ran. The page's load handler shows a visible
// notice when this flag is missing, which is the only way a phone can tell a
// script that failed to fetch from a practice tool that's simply broken.
window.__measureReady = true;
