// The measure-practice engine: a part, movement by movement. Pick a movement,
// pick a range of its measures, and hear them played as printed — the notes and
// the rhythm — so a bar that won't come can be drilled on its own and then put
// back into its phrase.
//
// This file holds everything that isn't the music. The music lives in a piece
// file — firebird-practice.js, barber-practice.js — which ends by calling
// Practice.start() with its movements; a page loads this, then one of those.
//
// A piece is:
//   { id, title, shortTitle?, sourceNote?, movements: [...] }
// and a movement is:
//   { id, name, tempo?, targetBpm?, meter?, clef?,
//     unitsPerBeat, beatsPerMeasure, measures? }
// where `measures` is [{ n, notes: [...] }] and a movement without any is
// listed but sits out. Durations are counted in units of the movement's own
// choosing: `unitsPerBeat` says how many go to a printed beat, so a movement of
// plain eighths and sixteenths counts in sixteenths (4 to a quarter) and one
// that also has triplets counts in sixths of a beat (6), where an eighth is 3
// units and a triplet eighth 2. With `beatsPerMeasure` it drives the metronome,
// the count-in, the bar counter and the bar check.
//
// A transcribed passage exists twice: engraved in tools/scores/*.ly (built to
// scores/measure-practice/ by tools/scores/build_scores.py) and as notes in the
// piece file. They describe the same music and have to be edited together — a
// note changed in one and not the other means the page plays something it isn't
// showing. checkPassage() catches the easiest way to get that wrong.
//
// Audio helpers (pitchToMidi, the cello voice, the shared clock) live in audio.js.

const { pitchToMidi } = AudioKit;
const cello = AudioKit.instruments.cello;

// An event holds a list of pitches: one for a note, several for a chord or a
// double stop, none for a rest — and a duration in the movement's units.
//
// These two builders bake in the sixteenth grid (unitsPerBeat: 4), which is
// what most passages want. A movement counting some other way — Barber's III
// counts in sixths of a beat, so that a triplet lands on a whole number — has
// to spell its durations out with chord() and rest() instead, or every note in
// it comes out the wrong length.
const eighth = (pitch) => ({ pitches: [pitch], units: 2 });
const sixteenth = (pitch) => ({ pitches: [pitch], units: 1 });
const rest = (units) => ({ pitches: [], units });
const eighthRest = () => rest(2);
const chord = (units, ...pitches) => ({ pitches, units });

// The piece this page is showing, and where its settings are remembered. Both
// are set by start(); until then the engine has nothing to show.
let PIECE = { id: 'none', title: '', movements: [] };
let PREFS_KEY = 'measure-practice:v3:none';


let tempoBpm = 60;          // ♩ = , so a sixteenth is 15/tempo seconds
let metronomeOn = true;
let countIn = true;
let loopOn = true;
// What is selected: a movement, and a range of its measures (indices, inclusive).
let movementIdx = 0;
let fromIdx = 0;
let toIdx = 0;

let playing = false;
let loopTimerId = null;
let passTimers = [];        // pending rest highlights, cleared when playback stops

// --- the passage ------------------------------------------------------------

function movement() {
  return PIECE.movements[movementIdx] || PIECE.movements[0] || {};
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
  PIECE.movements.filter(playable).forEach(m => {
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

// A movement is transcribed in passages — stretches of consecutive bars, with
// gaps between them where nothing has been read yet. The bar numbers say where
// one ends and the next begins, so the passages are derived rather than stored.
function passages(m) {
  const list = (m || movement()).measures || [];
  const out = [];
  list.forEach((measure, i) => {
    const last = out[out.length - 1];
    if (last && measure.n === list[i - 1].n + 1) last.to = i;
    else out.push({ from: i, to: i });
  });
  return out;
}

function passageAt(index) {
  return passages().find(p => index >= p.from && index <= p.to) || { from: 0, to: 0 };
}

// What to schedule, in order: a `seq` of consecutive single notes of equal
// length (playSequence lays those on one unbroken grid, which is cheaper and
// phrases better), or a `chord` whose pitches all start together. A rest — or a
// change of note value — ends whatever run was open.
function scheduleUnits(events) {
  const units = [];
  let run = null;
  events.forEach((e, i) => {
    if (!e.pitches.length) { run = null; return; }
    if (e.pitches.length > 1) {
      run = null;
      units.push({ kind: 'chord', at: e.at, index: i, units: e.units, pitches: e.pitches });
      return;
    }
    if (!run || run.units !== e.units) {
      run = { kind: 'seq', at: e.at, index: i, units: e.units, pitches: [] };
      units.push(run);
    }
    run.pitches.push(e.pitches[0]);
  });
  return units;
}

// "G#4" → "G♯". The octave is left off: on the page it's the letter and the
// accidental you're reading off the staff, and the staff is right above.
function displayName(pitch) {
  return pitch.replace('#', '♯').replace('b', '♭').replace(/-?\d+$/, '');
}

// Fill a chip with a note's names, bottom to top, each with its octave in
// smaller type. The octave earns its place: the figure from m 11 is one letter,
// A, alternating between two octaves, and without the numbers the strip would
// read "A A A A" and show none of it.
function fillChip(chip, note) {
  if (!note.pitches.length) { chip.textContent = 'rest'; return; }
  note.pitches.forEach((pitch, i) => {
    if (i) chip.appendChild(document.createTextNode('+'));
    const name = document.createElement('span');
    name.textContent = displayName(pitch);
    chip.appendChild(name);
    const octave = document.createElement('span');
    octave.className = 'oct';
    octave.textContent = pitch.replace(/\D/g, '');
    chip.appendChild(octave);
  });
}

// --- the score and the strip ------------------------------------------------

// The builder names each passage's engraving after its movement and the bars it
// covers, so the page can work the path out rather than store it twice. Which
// engraving to show follows the selection: a movement can hold several
// passages, and the one you're working on is the one you want to see.
function scoreSrc() {
  const list = measures();
  if (!list.length) return null;
  const p = passageAt(fromIdx);
  return `scores/measure-practice/${movement().id}-mm-${list[p.from].n}-${list[p.to].n}.svg`;
}

function buildScore() {
  const wrapper = document.getElementById('score-wrapper');
  const img = document.getElementById('score-img');
  if (!img || !wrapper) return;
  const src = scoreSrc();
  wrapper.hidden = !src;
  if (!src) return;
  const list = measures();
  const p = passageAt(fromIdx);
  img.src = src;
  img.alt = `${movement().name}, measures ${list[p.from].n} to ${list[p.to].n}`;
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
      chip.className = 'note'
        + (note.pitches.length ? '' : ' rest')
        + (note.pitches.length > 1 ? ' chord' : '');
      chip.dataset.note = n++;
      // Width straight from the duration — a sixteenth is half an eighth, so
      // the cell's limp is visible before you press play. Proportional rather
      // than fixed, so a bar keeps its shape when the row has to shrink to fit
      // a phone; every bar fills the same width because every bar is a bar.
      chip.style.flexGrow = note.units;
      chip.style.flexBasis = '0';
      fillChip(chip, note);
      chip.title = note.pitches.length ? note.pitches.join(' + ') : 'rest';
      notes.appendChild(chip);
    });
    group.appendChild(notes);
    strip.appendChild(group);
  });
}

// --- the count ---------------------------------------------------------------
// Nine empty bars is the hard part of this passage, and an empty bar looks
// exactly like the one before it. The counter says the bar out loud, in the
// only way a page can: big, and changing on the beat.

function buildCounter() {
  const pips = document.getElementById('count-beats');
  if (!pips) return;
  pips.innerHTML = '';
  for (let i = 0; i < movement().beatsPerMeasure; i++) {
    const pip = document.createElement('span');
    pip.className = 'pip';
    pip.dataset.beat = i;
    pips.appendChild(pip);
  }
}

function showCount(label, beat) {
  const bar = document.getElementById('count-bar');
  if (bar) bar.textContent = label;
  document.querySelectorAll('#count-beats .pip').forEach(pip => {
    pip.classList.toggle('on', Number(pip.dataset.beat) === beat);
  });
}

function clearCount() {
  showCount('–', -1);
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
  clearCount();
  const counter = document.getElementById('counter');
  if (counter) counter.classList.remove('running');
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
  const counter = document.getElementById('counter');
  if (counter) counter.classList.add('running');
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
  const unit0 = (60 / tempoBpm) / here.unitsPerBeat;  // one sixteenth, in seconds
  const beat = unit0 * here.unitsPerBeat;
  const leadBeats = lead && countIn ? here.beatsPerMeasure : 0;
  const start = when != null ? when
    : AudioKit.currentTime() + 0.06 + leadBeats * beat;

  // Short, hard-bitten notes with a sliver of silence after them: accents under
  // ff in the normale bars, staccato under the wood of the bow in the others,
  // and a struck chord at the opening. None of it is a legato line, so one
  // envelope serves throughout.
  const voice = (step) => ({
    step,
    gate: step * 0.55,
    attack: 0.012,
    sustain: 0.4,
    release: 0.04,
    peak: 0.2,
  });
  scheduleUnits(events).forEach((unit, u) => {
    const step = unit.units * unit0;
    const when = start + unit.at * unit0;
    // Only the first thing scheduled in a fresh pass may clear what came
    // before; everything after chains onto it, or it would cancel the units
    // already scheduled ahead of it.
    const chained = chain || u > 0;
    if (unit.kind === 'chord') {
      // A chord is one bow on several strings: the same note, started together,
      // one playSequence call per string since each call renders a single voice.
      unit.pitches.forEach((pitch, k) => {
        cello.playSequence(pitchToMidi(pitch), [0], {
          ...voice(step),
          peak: 0.2 / Math.sqrt(unit.pitches.length),   // keep the chord level with a single note
          when,
          chain: chained || k > 0,
          onNote: k === 0 ? () => highlight(unit.index) : null,
        });
      });
      return;
    }
    const base = pitchToMidi(unit.pitches[0]);
    cello.playSequence(base, unit.pitches.map(p => pitchToMidi(p) - base), {
      ...voice(step),
      when,
      chain: chained,
      onNote: (semi, i) => highlight(unit.index + i),
    });
  });

  // Rests get lit too — an empty beat you can see coming is the difference
  // between counting the bar and guessing at it.
  const now = AudioKit.currentTime();
  events.forEach((e, i) => {
    if (e.pitches.length) return;
    const id = setTimeout(() => {
      const k = passTimers.indexOf(id); if (k >= 0) passTimers.splice(k, 1);
      if (playing) highlight(i);
    }, Math.max(0, (start + e.at * unit0 - now) * 1000));
    passTimers.push(id);
  });

  // The count runs on the same clock as everything else: one tick per beat,
  // naming the bar it belongs to. Through the rests this is the only thing
  // happening, which is the point.
  let beatIndex = 0;
  measures().slice(fromIdx, toIdx + 1).forEach(measure => {
    for (let b = 0; b < here.beatsPerMeasure; b++) {
      const at = start + (beatIndex++) * beat;
      const id = setTimeout(() => {
        const k = passTimers.indexOf(id); if (k >= 0) passTimers.splice(k, 1);
        if (playing) showCount(measure.n, b);
      }, Math.max(0, (at - now) * 1000));
      passTimers.push(id);
    }
  });
  for (let b = 0; b < leadBeats; b++) {
    const at = start - (leadBeats - b) * beat;
    const id = setTimeout(() => {
      const k = passTimers.indexOf(id); if (k >= 0) passTimers.splice(k, 1);
      if (playing) showCount('in', b);
    }, Math.max(0, (at - now) * 1000));
    passTimers.push(id);
  }

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

  const nextStart = start + totalUnits * unit0;
  if (loopOn) {
    const ahead = Math.min(0.25, totalUnits * unit0 * 0.5);
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
  movementIdx = Math.max(0, Math.min(index, PIECE.movements.length - 1));
  fromIdx = 0;
  toIdx = passageAt(0).to;
  buildRangeOptions();
  buildCounter();
  buildScore();
  buildStrip();
  syncControls();
  savePrefs();
}

function selectRange(from, to) {
  const last = measures().length - 1;
  fromIdx = Math.max(0, Math.min(from, last));
  // A range can't reach across a gap in the transcription: mm 12 and 63 sit
  // next to each other in the list but not in the music, and playing them as
  // neighbours would teach the wrong thing.
  const p = passageAt(fromIdx);
  toIdx = Math.max(fromIdx, Math.min(to, p.to));
  syncControls();
  buildScore();
  buildStrip();
  savePrefs();
  restartIfLooping();
}

function buildMovementOptions() {
  const select = control('movement');
  if (!select) return;
  select.innerHTML = '';
  PIECE.movements.forEach((m, i) => {
    const option = document.createElement('option');
    option.value = i;
    const bars = m.measures || [];
    // The state goes in the option itself: picking a movement to find nothing
    // there is a worse surprise than reading it in the list first. A movement
    // transcribed in pieces names each piece, since "1–68" would promise 56
    // bars that aren't there.
    const ranges = passages(m).map(p => `${bars[p.from].n}–${bars[p.to].n}`).join(', ');
    option.textContent = bars.length
      ? `${m.name} — mm ${ranges}`
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
    const p = passageAt(fromIdx);
    whole.disabled = !has;
    whole.classList.toggle('on', has && fromIdx === p.from && toIdx === p.to);
  }
  const play = control('play');
  if (play) play.disabled = !has;

  const strip = control('strip');
  if (strip) strip.hidden = !has;
  // Nothing to count through either: a lone dash under an empty movement reads
  // as a broken counter rather than an empty one.
  const counter = control('counter');
  if (counter) counter.hidden = !has;

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
    const ranges = passages().map(p => `${list[p.from].n}–${list[p.to].n}`).join(', ');
    const printed = here.tempo ? `printed tempo ${here.tempo}` : '';
    state.textContent = has
      ? [here.meter, printed, `mm ${ranges} transcribed`].filter(Boolean).join(', ')
      : [printed, 'no measures transcribed yet, so there is nothing to play here']
          .filter(Boolean).join(' — ');
  }
}

function initControls() {
  const play = control('play');
  if (play) play.addEventListener('click', startPlayback);

  const whole = control('whole');
  // "all" is all of the passage you're in, not all of a movement that may be
  // transcribed in pieces.
  if (whole) whole.addEventListener('click', () => {
    const p = passageAt(fromIdx);
    selectRange(p.from, p.to);
  });

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
  if (note && PIECE.sourceNote) note.innerHTML = PIECE.sourceNote;
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
  const m = PIECE.movements.findIndex(x => x.id === p.movement);
  if (m >= 0) movementIdx = m;
  // Stored as bar numbers rather than indices: measures added in front of a
  // movement would otherwise silently shift the range you left selected.
  const list = measures();
  const a = list.findIndex(x => x.n === p.from);
  const b = list.findIndex(x => x.n === p.to);
  if (a >= 0 && b >= a && passageAt(a).to >= b) { fromIdx = a; toIdx = b; }
  else { fromIdx = 0; toIdx = passageAt(0).to; }
  [['metronome', metronomeOn], ['count-in', countIn], ['loop', loopOn]].forEach(([id, v]) => {
    const el = control(id);
    if (el) el.checked = v;
  });
}

// --- starting up -------------------------------------------------------------

// Called by the piece's own script once it has its movements together. One
// engine, one page per piece: the piece file holds the music and nothing else,
// this file holds everything that isn't the music.
function start(piece) {
  PIECE = piece;
  // Each piece remembers its own movement, range and tempo. Sharing one key
  // would have a page open on a movement from a different work.
  PREFS_KEY = `measure-practice:v3:${piece.id}`;

  const title = document.getElementById('piece-title');
  if (title) title.textContent = piece.title || '';
  if (piece.title) document.title = `measure practice — ${piece.shortTitle || piece.title}`;

  const problems = checkPassage();
  if (problems.length) {
    const box = control('load-error');
    const detail = control('load-error-detail');
    if (box) box.hidden = false;
    if (detail) detail.textContent = 'passage: ' + problems.join('; ');
  }

  movementIdx = Math.max(0, PIECE.movements.findIndex(m => playable(m)));
  fromIdx = 0;
  // Start inside the first passage rather than across the whole movement: the
  // measures either side of a gap are not neighbours.
  toIdx = passageAt(0).to;

  applyPrefs();
  buildMovementOptions();
  buildRangeOptions();
  buildCounter();
  clearCount();
  buildScore();
  buildStrip();
  initControls();
  syncControls();

  // Reached only if everything above ran. The page's load handler shows a
  // visible notice when this flag is missing, which is the only way a phone can
  // tell a script that failed to fetch from a practice tool that's simply
  // broken.
  window.__measureReady = true;
}

window.Practice = {
  start,
  // The note builders, so a piece file can write its music in something close
  // to the language of the page it came off.
  eighth, sixteenth, rest, eighthRest, chord,
};
