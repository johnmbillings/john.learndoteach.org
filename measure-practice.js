// Measure practice. A short passage — a couple of measures at a time — played
// back exactly as printed: the notes and the rhythm, at whatever tempo the ear
// can still follow. The point isn't a performance; it's a reference you can
// check your hands against, one measure at a time, until the shape of the bar
// is memorised rather than decoded.
//
// The passage is the two "normale" measures (65–66) between the col legno bars
// at 63–64 and the col legno that resumes at 67, transcribed from a photograph
// of the printed cello part. Tenor clef, no key signature, six eighths to the
// bar: m 65 is six of them beamed as one group, m 66 four beamed plus a single
// note and a rest. Every note carries an accent — ff marcatissimo — so playback
// is short and re-articulated rather than legato.
//
// TWO SOURCES, ONE PASSAGE: the engraving comes from
// tools/scores/measure-practice.ly (built to scores/measure-practice/*.svg by
// tools/scores/build_scores.py) and the playback from the PASSAGE table below.
// They describe the same music and have to be edited together — a note changed
// in one and not the other means the page plays something it isn't showing.
//
// Audio helpers (pitchToMidi, the cello voice, the shared clock) live in audio.js.

const { pitchToMidi } = AudioKit;
const cello = AudioKit.instruments.cello;

// The passage, in printed order. `notes` holds one entry per eighth: a pitch
// name, or null for a rest of the same length. Absolute octaves (C4 = middle C)
// so a measure means the same thing wherever it sits in the list.
const PASSAGE = {
  scoreDir: 'scores/measure-practice/',
  notesPerBeat: 2,    // the printed beat is a quarter; the passage moves in eighths
  beatsPerMeasure: 3,
  measures: [
    { n: 65, notes: ['F4', 'G#4', 'C5', 'B4', 'G#4', 'B4'] },
    { n: 66, notes: ['D#5', 'D5', 'G#4', 'F4', 'B4', null] },
  ],
};

const PREFS_KEY = 'measure-practice:v1';

let tempoBpm = 60;          // ♩ = , so an eighth is 30/tempo seconds
let metronomeOn = true;
let countIn = true;
let loopOn = true;
// Which measures are selected: an index range into PASSAGE.measures, inclusive.
let fromIdx = 0;
let toIdx = PASSAGE.measures.length - 1;

let playing = false;
let loopTimerId = null;
let passTimers = [];        // pending rest highlights, cleared when playback stops

// --- the passage, flattened ------------------------------------------------

// One entry per eighth across the selected measures: { pitch, measure, index }.
// `pitch` is null on a rest. Playback, the strip and the metronome all count in
// these, so they can never drift apart.
function selectedEvents() {
  const out = [];
  PASSAGE.measures.slice(fromIdx, toIdx + 1).forEach((measure, m) => {
    measure.notes.forEach((pitch, i) => {
      out.push({ pitch, measure: m, index: i });
    });
  });
  return out;
}

// Contiguous stretches of notes, split at the rests. A rest has to be a real
// gap in the schedule — playSequence lays its notes out on an unbroken grid, so
// a rest can only be expressed as the space between two runs.
function runsOf(events) {
  const runs = [];
  let current = null;
  events.forEach((e, i) => {
    if (e.pitch == null) { current = null; return; }
    if (!current) { current = { at: i, notes: [] }; runs.push(current); }
    current.notes.push(e.pitch);
  });
  return runs;
}

// "G#4" → "G♯". The octave is left off: on the page it's the letter and the
// accidental you're reading off the staff, and the staff is right above.
function displayName(pitch) {
  return pitch.replace('#', '♯').replace('b', '♭').replace(/-?\d+$/, '');
}

// --- the score and the strip ----------------------------------------------

function scoreSrc() {
  const first = PASSAGE.measures[fromIdx].n;
  const last = PASSAGE.measures[toIdx].n;
  return PASSAGE.scoreDir + (first === last ? `mm-${first}.svg` : `mm-${first}-${last}.svg`);
}

function buildScore() {
  const img = document.getElementById('score-img');
  if (!img) return;
  const first = PASSAGE.measures[fromIdx].n;
  const last = PASSAGE.measures[toIdx].n;
  img.src = scoreSrc();
  img.alt = first === last ? `measure ${first}` : `measures ${first} to ${last}`;
}

// One chip per eighth, grouped by measure and numbered — so a note that lands
// wrong can be found by its bar and its place in the bar, which is how you'd
// talk about it at the stand.
function buildStrip() {
  const strip = document.getElementById('strip');
  if (!strip) return;
  strip.innerHTML = '';
  let n = 0;
  PASSAGE.measures.slice(fromIdx, toIdx + 1).forEach(measure => {
    const group = document.createElement('div');
    group.className = 'measure';

    const label = document.createElement('span');
    label.className = 'measure-no';
    label.textContent = measure.n;
    group.appendChild(label);

    const notes = document.createElement('div');
    notes.className = 'measure-notes';
    measure.notes.forEach(pitch => {
      const chip = document.createElement('span');
      chip.className = 'note' + (pitch == null ? ' rest' : '');
      chip.dataset.note = n++;
      chip.textContent = pitch == null ? 'rest' : displayName(pitch);
      if (pitch == null) chip.title = 'rest';
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

// --- playback --------------------------------------------------------------

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
  playing = true;
  const btn = document.getElementById('play');
  if (btn) { btn.classList.add('playing'); btn.textContent = 'stop'; }
  updateWakeLock();
  schedulePass(null, false, true);
}

// Re-trigger a running loop so a changed control (a new tempo, a different
// measure) takes effect at the next seam instead of only after a manual stop.
function restartIfLooping() {
  // Only a looping pass gets torn down: outside a loop the pass you're hearing
  // is the one you asked for, and restarting it from the top mid-measure is a
  // worse surprise than waiting out the four seconds it has left.
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

  const events = selectedEvents();
  if (!events.length) { finishPlayback(); return; }
  const step = 30 / tempoBpm;                    // one eighth
  const beat = step * PASSAGE.notesPerBeat;
  const leadBeats = lead && countIn ? PASSAGE.beatsPerMeasure : 0;
  const start = when != null ? when
    : AudioKit.currentTime() + 0.06 + leadBeats * beat;

  // Marcatissimo, accents on everything: a short, hard-bitten note with a
  // sliver of silence after it, not a legato line.
  runsOf(events).forEach((run, r) => {
    const base = pitchToMidi(run.notes[0]);
    cello.playSequence(base, run.notes.map(p => pitchToMidi(p) - base), {
      step,
      gate: step * 0.55,
      attack: 0.012,
      sustain: 0.4,
      release: 0.04,
      peak: 0.2,
      when: start + run.at * step,
      // Only the first run of a fresh pass may clear what came before; the rest
      // chain onto it, or they'd cancel the runs scheduled ahead of them.
      chain: chain || r > 0,
      onNote: (semi, i) => highlight(run.at + i),
    });
  });

  // Rests get lit too — an empty eighth you can see coming is the difference
  // between counting the bar and guessing at it.
  const now = AudioKit.currentTime();
  events.forEach((e, i) => {
    if (e.pitch != null) return;
    const id = setTimeout(() => {
      const k = passTimers.indexOf(id); if (k >= 0) passTimers.splice(k, 1);
      if (playing) highlight(i);
    }, Math.max(0, (start + i * step - now) * 1000));
    passTimers.push(id);
  });

  // Ticks are scheduled after the notes: a fresh playSequence silences whatever
  // was pending on the clock, which would take any tick placed before it.
  if (metronomeOn) {
    const beats = Math.round(events.length / PASSAGE.notesPerBeat);
    for (let b = 0; b < beats; b++) {
      AudioKit.click(start + b * beat, b % PASSAGE.beatsPerMeasure === 0);
    }
  }
  for (let b = 0; b < leadBeats; b++) {
    AudioKit.click(start - (leadBeats - b) * beat, b === 0);
  }

  const nextStart = start + events.length * step;
  if (loopOn) {
    const ahead = Math.min(0.25, events.length * step * 0.5);
    const delay = Math.max(0, (nextStart - ahead - AudioKit.currentTime()) * 1000);
    loopTimerId = setTimeout(() => {
      if (loopOn && playing) schedulePass(nextStart, true, false);
      else loopTimerId = setTimeout(finishPlayback, Math.max(0, (nextStart - AudioKit.currentTime()) * 1000));
    }, delay);
  } else {
    loopTimerId = setTimeout(finishPlayback, Math.max(0, (nextStart - AudioKit.currentTime()) * 1000));
  }
}

// --- the screen stays awake while it plays ---------------------------------

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

// --- controls --------------------------------------------------------------
// Every control is looked up through control(), which tolerates its absence: a
// browser can pair this script with a cached copy of the markup that predates
// it (or the reverse), and the cost of that has to be one dead control, never a
// page that stops halfway through setting itself up.
function control(id) {
  return document.getElementById(id);
}

function selectSpan(from, to) {
  fromIdx = from;
  toIdx = to;
  buildScore();
  buildStrip();
  updateSpanButtons();
  savePrefs();
  restartIfLooping();
}

// One button per measure, plus one for the whole passage. Built from the data,
// so adding a measure to PASSAGE puts a button on the page with it.
function buildSpanButtons() {
  const host = control('span');
  if (!host) return;
  host.innerHTML = '';
  const options = PASSAGE.measures.map((m, i) => ({ label: String(m.n), from: i, to: i }));
  if (PASSAGE.measures.length > 1) {
    const first = PASSAGE.measures[0].n;
    const last = PASSAGE.measures[PASSAGE.measures.length - 1].n;
    options.push({ label: `${first}–${last}`, from: 0, to: PASSAGE.measures.length - 1 });
  }
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = opt.label;
    btn.dataset.from = opt.from;
    btn.dataset.to = opt.to;
    btn.addEventListener('click', () => selectSpan(opt.from, opt.to));
    host.appendChild(btn);
  });
  updateSpanButtons();
}

function updateSpanButtons() {
  const host = control('span');
  if (!host) return;
  host.querySelectorAll('button').forEach(btn => {
    const on = Number(btn.dataset.from) === fromIdx && Number(btn.dataset.to) === toIdx;
    btn.classList.toggle('on', on);
  });
}

function initControls() {
  const play = control('play');
  if (play) play.addEventListener('click', startPlayback);

  const tempo = control('tempo');
  if (tempo) {
    tempo.value = tempoBpm;
    tempo.addEventListener('change', () => {
      const v = Math.round(Number(tempo.value));
      if (!Number.isFinite(v) || v < 20 || v > 180) { tempo.value = tempoBpm; return; }
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
    const first = PASSAGE.measures[0].n;
    const last = PASSAGE.measures[PASSAGE.measures.length - 1].n;
    note.innerHTML = `mm ${first}–${last} of the cello part, tenor clef — read off the printed page `
      + `and engraved from <code>tools/scores/measure-practice.ly</code>. `
      + `check it against your part before you trust it.`;
  }
}

// --- prefs -----------------------------------------------------------------

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      tempo: tempoBpm, metronome: metronomeOn, countIn, loop: loopOn,
      from: fromIdx, to: toIdx,
    }));
  } catch (e) { /* private mode, or a full store — the page still works */ }
}

function applyPrefs() {
  let p;
  try { p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); } catch (e) { return; }
  if (!p || typeof p !== 'object') return;
  if (Number.isFinite(p.tempo) && p.tempo >= 20 && p.tempo <= 180) tempoBpm = Math.round(p.tempo);
  if (typeof p.metronome === 'boolean') metronomeOn = p.metronome;
  if (typeof p.countIn === 'boolean') countIn = p.countIn;
  if (typeof p.loop === 'boolean') loopOn = p.loop;
  // A stored range from an older, shorter passage must never select a measure
  // that no longer exists.
  const last = PASSAGE.measures.length - 1;
  if (Number.isInteger(p.from) && Number.isInteger(p.to)
      && p.from >= 0 && p.to <= last && p.from <= p.to) {
    fromIdx = p.from;
    toIdx = p.to;
  }
  [['metronome', metronomeOn], ['count-in', countIn], ['loop', loopOn]].forEach(([id, v]) => {
    const el = control(id);
    if (el) el.checked = v;
  });
}

applyPrefs();
buildSpanButtons();
buildScore();
buildStrip();
initControls();

// Reached only if everything above ran. The page's load handler shows a visible
// notice when this flag is missing, which is the only way a phone can tell a
// script that failed to fetch from a practice tool that's simply broken.
window.__measureReady = true;
