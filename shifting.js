// Shifting practice page. A major scale plays in strict time; on the note
// before a string crossing, the pitch leaves that note partway through its own
// beat and slides down to the note the hand passes through on its way to the
// new position. One note, one beat, two pitches — the shift is part of the note
// you are leaving, not an extra note of its own.
//
// The point is ear training, not notation: in G major you play B with the
// fourth finger and slide down to G♯, which is where the hand has to sit for the
// first finger to cross to C on the next string. G♯ has no business in G major,
// so the ear rejects it — which is exactly why it has to be heard, slowly and
// in tempo, until it stops sounding like a mistake and starts sounding like a
// landmark.
//
// Where the shifts fall is a fingering decision, not a theory one, so the page
// doesn't guess: click a note to put a shift on it, and ▾ ▴ to move the note the
// hand slides to. Each key keeps its own layout, seeded from whichever key you
// last had open — the circle of fifths is the point.
//
// Audio helpers (pitchToMidi, the cello voice, the drone) live in audio.js.

const NS = 'http://www.w3.org/2000/svg';

// Tonal centers clockwise around the circle, starting at the top. Mirrors the
// table in scales.js (sig = major-key signature: + sharps, − flats).
const CIRCLE = [
  { label: 'C',  root: 'C',  sig: 0 },
  { label: 'G',  root: 'G',  sig: 1 },
  { label: 'D',  root: 'D',  sig: 2 },
  { label: 'A',  root: 'A',  sig: 3 },
  { label: 'E',  root: 'E',  sig: 4 },
  { label: 'B',  alt: 'C♭', root: 'B',  sig: 5 },
  { label: 'G♭', alt: 'F♯', root: 'Gb', sig: -6 },
  { label: 'D♭', alt: 'C♯', root: 'Db', sig: -5 },
  { label: 'A♭', root: 'Ab', sig: -4 },
  { label: 'E♭', root: 'Eb', sig: -3 },
  { label: 'B♭', root: 'Bb', sig: -2 },
  { label: 'F',  root: 'F',  sig: -1 },
];

const MAJOR = { intervals: [0, 2, 4, 5, 7, 9, 11, 12], letterSteps: [0, 1, 2, 3, 4, 5, 6, 7] };

// How a shift is laid out inside its beat. The pitch holds, travels, and then
// sits on the note the hand landed on for the last sliver of the beat — that
// sliver is what the ear actually takes away, so it's fixed rather than tunable.
const GHOST_SIT = 0.15;

const { pitchToMidi } = AudioKit;
const cello = AudioKit.instruments.cello;

let selectedIndex = 1; // default G major
let octaves = 1;
let tempoBpm = 52;
let slidePct = 35;   // share of the beat the pitch spends travelling
let metronomeOn = true;
let countIn = true;
let loopOn = true;

// Shift layouts, one per key root: [{ on, drop }] — `on` is the index of the
// scale note the hand shifts during, `drop` how far it travels below that note
// in semitones. G major starts with the C-string shift: the fourth finger plays
// B and carries down a minor third to G♯, where the first finger can cross to C
// on the G string.
const DEFAULT_SHIFTS = [{ on: 2, drop: 3 }];
let shiftsByRoot = { G: DEFAULT_SHIFTS.map(s => ({ ...s })) };

const currentRoot = () => CIRCLE[selectedIndex].root;
const currentShifts = () => shiftsByRoot[currentRoot()] || [];
const shiftOn = (i) => currentShifts().find(s => s.on === i) || null;

// --- note spelling (same approach as scales.js) ---------------------------
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

function parseTonic(root) {
  const li = LETTERS.indexOf(root[0].toUpperCase());
  const acc = root[1] === 'b' || root[1] === '♭' ? -1 : (root[1] === '#' || root[1] === '♯' ? 1 : 0);
  return { letterIdx: li, pc: (LETTER_PC[li] + acc + 12) % 12 };
}

function spellPc(letterIdx, pc) {
  const diff = ((pc - LETTER_PC[letterIdx] + 6) % 12 + 12) % 12 - 6;
  const glyphs = { '-2': '𝄫', '-1': '♭', '0': '', '1': '♯', '2': '𝄪' };
  const key = String(diff);
  // hasOwnProperty, not `||` — a natural's glyph is the empty string.
  return LETTERS[letterIdx] + (Object.prototype.hasOwnProperty.call(glyphs, key) ? glyphs[key] : '?');
}

// semi (offset from the tonic) -> spelled name. Scale tones are spelled by
// letter so the key reads correctly; the note under a travelling hand is
// chromatic, so it falls back to the key's preferred accidental.
function makeNamer(root, sig) {
  const base = pitchToMidi(root, 4);
  const { letterIdx, pc: tonicPc } = parseTonic(root);
  const map = {};
  MAJOR.intervals.forEach((iv, d) => {
    const li = (letterIdx + MAJOR.letterSteps[d]) % 7;
    map[(tonicPc + iv) % 12] = spellPc(li, (tonicPc + iv) % 12);
  });
  return (semi) => {
    const pc = ((base + semi) % 12 + 12) % 12;
    return map[pc] != null ? map[pc] : AudioKit.midiToName(base + semi, sig < 0);
  };
}

// --- the played pass ------------------------------------------------------
// The scale's notes as semitone offsets from the tonic, across `octaves`. These
// are the only notes played: a shift adds no note, it bends one that's already
// there.
function scaleNotes() {
  const degrees = MAJOR.intervals.slice(0, -1);
  const out = [];
  for (let o = 0; o < octaves; o++) for (const d of degrees) out.push(d + 12 * o);
  out.push(12 * octaves);
  return out;
}

// Where inside a beat the slide happens: hold, travel, then sit on the note the
// hand landed on for the last GHOST_SIT of the beat.
function slideTiming(step) {
  const over = Math.max(0.03, step * (slidePct / 100));
  const at = Math.max(step * 0.08, step * (1 - GHOST_SIT) - over);
  return { at, over };
}

// Per-note shaping handed to the cello voice: the shifting note carries the
// slide in its tail, and the note after it starts a fresh stroke — on the cello
// that note is on a new string, under a new finger.
function shapeFor(notes, step) {
  const { at, over } = slideTiming(step);
  return notes.map((semi, i) => {
    const sh = shiftOn(i);
    if (sh && i < notes.length - 1) return { tail: { semis: -sh.drop, at, over, level: 0.72 } };
    if (shiftOn(i - 1) && i - 1 < notes.length - 1) return { artic: 0.8 };
    return null;
  });
}

// --- playback -------------------------------------------------------------
let playing = false;
let loopTimerId = null;
let ghostTimers = [];  // pending "the hand is moving now" highlights

function clearHighlight() {
  ghostTimers.forEach(clearTimeout);
  ghostTimers = [];
  document.querySelectorAll('#strip .sounding').forEach(el => el.classList.remove('sounding'));
}

function finishPlayback() {
  if (loopTimerId) { clearTimeout(loopTimerId); loopTimerId = null; }
  playing = false;
  const btn = document.getElementById('play');
  btn.classList.remove('playing');
  btn.textContent = 'play';
  clearHighlight();
  updateWakeLock();
}

function stopPlayback() {
  AudioKit.stopSequence();
  finishPlayback();
}

function togglePlay() {
  if (playing) { stopPlayback(); return; }
  playing = true;
  const btn = document.getElementById('play');
  btn.classList.add('playing');
  btn.textContent = 'stop';
  updateWakeLock();
  schedulePass(null, false, true);
}

// Re-trigger a running loop so a changed option (a new shift, a wider range)
// takes effect at the next seam instead of only after a manual stop.
function restartIfLooping() {
  if (playing && loopOn) {
    if (loopTimerId) { clearTimeout(loopTimerId); loopTimerId = null; }
    clearHighlight();
    schedulePass(null, false, false); // already mid-practice: no second count-in
  }
}

// Play one pass, then schedule the next on the audio clock (gapless) or finish.
// `lead` delays the first note by a beat and ticks a count-in on it.
function schedulePass(when, chain, lead) {
  if (lead) AudioKit.prepareOutput();
  const center = CIRCLE[selectedIndex];
  const baseMidi = pitchToMidi(center.root, 2); // the bottom octave, in cello register
  const notes = scaleNotes();
  const step = 60 / tempoBpm; // one note per beat — this is slow practice
  const { at } = slideTiming(step);
  const startWhen = lead && countIn ? AudioKit.currentTime() + 0.05 + step : when;
  const nextStart = cello.playSequence(baseMidi, notes, {
    step,
    gate: step,
    attack: 0.025,
    sustain: 0.9,
    release: 0.06,
    when: startWhen,
    chain,
    legato: true,
    shape: shapeFor(notes, step),
    clickInterval: metronomeOn ? step : 0,
    clickAccent: true,
    onNote: (semi, i) => {
      clearHighlight();
      const el = document.querySelector(`#strip [data-note="${i}"]`);
      if (el) el.classList.add('sounding');
      // Light the ghost at the moment the hand actually starts moving, so what
      // you see tracks what you hear inside the beat.
      const ghost = el && el.querySelector('.ghost-name');
      if (ghost) ghostTimers.push(setTimeout(() => ghost.classList.add('sounding'), at * 1000));
    },
  });
  // Scheduled after playSequence, whose fresh-start stopSequence() would
  // otherwise cancel a tick placed before it.
  if (lead && countIn) AudioKit.click(startWhen - step, false);
  if (loopOn) {
    const ahead = Math.min(0.25, notes.length * step * 0.5);
    const delay = Math.max(0, (nextStart - ahead - AudioKit.currentTime()) * 1000);
    loopTimerId = setTimeout(() => {
      if (loopOn && playing) schedulePass(nextStart, true, false);
      else loopTimerId = setTimeout(finishPlayback, Math.max(0, (nextStart - AudioKit.currentTime()) * 1000));
    }, delay);
  } else {
    loopTimerId = setTimeout(finishPlayback, Math.max(0, (nextStart - AudioKit.currentTime()) * 1000));
  }
}

// --- the scale strip ------------------------------------------------------
// One chip per note — the same notes the pass plays. A chip carrying a shift
// shows the note the hand slides to underneath it, inside the same chip,
// because it happens inside the same beat.
function buildStrip() {
  const strip = document.getElementById('strip');
  if (!strip) return;
  strip.innerHTML = '';
  const center = CIRCLE[selectedIndex];
  const namer = makeNamer(center.root, center.sig);
  const notes = scaleNotes();

  notes.forEach((semi, i) => {
    const shift = i < notes.length - 1 ? shiftOn(i) : null;
    const chip = document.createElement('span');
    chip.className = 'note' + (shift ? ' has-shift' : '');
    chip.dataset.note = i;

    const name = document.createElement('span');
    name.className = 'note-name';
    name.textContent = namer(semi);
    chip.appendChild(name);

    if (shift) {
      chip.appendChild(makeShiftRow(shift, semi, namer));
    } else if (i < notes.length - 1) {
      // The last note has nothing to cross into, so it can't carry a shift.
      chip.classList.add('addable');
      chip.tabIndex = 0;
      chip.setAttribute('role', 'button');
      chip.title = 'add a shift on this note';
      chip.setAttribute('aria-label', `add a shift on ${namer(semi)}`);
      const add = () => {
        const list = shiftsByRoot[currentRoot()] || (shiftsByRoot[currentRoot()] = []);
        list.push({ on: i, drop: 3 });
        afterEdit();
      };
      chip.addEventListener('click', add);
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); add(); }
      });
    }
    strip.appendChild(chip);
  });
}

function makeShiftRow(shift, semi, namer) {
  const row = document.createElement('span');
  row.className = 'shift-row';

  const down = document.createElement('button');
  down.type = 'button';
  down.textContent = '▾';
  down.setAttribute('aria-label', 'slide further down');
  down.addEventListener('click', () => nudge(shift, 1));

  const name = document.createElement('span');
  name.className = 'ghost-name';
  name.textContent = '⟍ ' + namer(semi - shift.drop);

  const up = document.createElement('button');
  up.type = 'button';
  up.textContent = '▴';
  up.setAttribute('aria-label', 'slide less far down');
  up.addEventListener('click', () => nudge(shift, -1));

  const kill = document.createElement('button');
  kill.type = 'button';
  kill.textContent = '×';
  kill.setAttribute('aria-label', 'remove this shift');
  kill.addEventListener('click', () => {
    const list = shiftsByRoot[currentRoot()] || [];
    const k = list.indexOf(shift);
    if (k >= 0) list.splice(k, 1);
    afterEdit();
  });

  row.append(down, name, up, kill);
  return row;
}

// A shift travels at least a semitone and at most an octave — past that it's a
// different position, not a shift.
function nudge(shift, by) {
  shift.drop = Math.min(12, Math.max(1, shift.drop + by));
  afterEdit();
}

// Every edit redraws the strip, saves, and re-syncs a running loop.
function afterEdit() {
  buildStrip();
  persist();
  restartIfLooping();
}

// --- circle of fifths -----------------------------------------------------
function buildCircle() {
  const svg = document.getElementById('circle');
  if (!svg) return;
  const cx = 180, cy = 180, ringR = 122;
  CIRCLE.forEach((entry, i) => {
    const ang = (-90 + i * 30) * Math.PI / 180;
    const x = cx + ringR * Math.cos(ang);
    const y = cy + ringR * Math.sin(ang);
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'node');
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `${entry.label} major${entry.alt ? ' or ' + entry.alt + ' major' : ''}`);
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 26);
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', x);
    t.setAttribute('y', entry.alt ? y - 6 : y);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'central');
    t.textContent = entry.label;
    if (entry.alt) {
      const alt = document.createElementNS(NS, 'tspan');
      alt.setAttribute('class', 'alt');
      alt.setAttribute('x', x);
      alt.setAttribute('dy', '15');
      alt.textContent = entry.alt;
      t.appendChild(alt);
    }
    g.append(c, t);
    g.addEventListener('click', () => select(i));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); }
    });
    svg.appendChild(g);
    entry.el = g;
  });
}

function select(i) {
  const from = CIRCLE[selectedIndex].root;
  selectedIndex = i;
  const root = currentRoot();
  // A key you haven't set up yet inherits the shape you were just working in —
  // the same shifts, transposed — rather than starting blank.
  if (!shiftsByRoot[root]) {
    const seed = shiftsByRoot[from] || DEFAULT_SHIFTS;
    shiftsByRoot[root] = seed.map(s => ({ on: s.on, drop: s.drop }));
  }
  CIRCLE.forEach((e, j) => { if (e.el) e.el.classList.toggle('selected', j === i); });
  const label = document.getElementById('center-label');
  if (label) label.textContent = CIRCLE[i].label + ' major';
  drone.setRoot(pitchToMidi(root, 3));
  buildStrip();
  persist();
  restartIfLooping();
}

// --- drone ----------------------------------------------------------------
const drone = AudioKit.createDrone();

function initDroneControls() {
  const btn = control('drone-btn');
  if (btn) btn.addEventListener('click', () => {
    if (drone.playing) {
      drone.stop();
      btn.textContent = 'drone';
      btn.classList.remove('on');
    } else {
      drone.start();
      btn.textContent = 'stop drone';
      btn.classList.add('on');
    }
    updateWakeLock();
  });
  const fifth = control('drone-fifth');
  if (fifth) {
    drone.setFifth(fifth.checked);
    fifth.addEventListener('change', () => drone.setFifth(fifth.checked));
  }
  const vol = control('drone-volume');
  if (vol) {
    drone.setVolume(parseFloat(vol.value));
    vol.addEventListener('input', () => drone.setVolume(parseFloat(vol.value)));
  }
}

// --- screen wake lock -----------------------------------------------------
// Phones sleep on their idle timer even while audio plays, cutting practice off
// mid-pass. Hold the lock whenever something is sounding, and re-acquire it when
// the tab becomes visible again (the OS drops it while the page is hidden).
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
  if (playing || drone.playing) acquireWakeLock();
  else releaseWakeLock();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') updateWakeLock();
});

// --- controls -------------------------------------------------------------
// Every control is looked up through control(), which tolerates its absence.
// A browser can serve this script against a cached copy of the markup that
// predates it (or the reverse): the cost of a control the other side doesn't
// know about has to be one dead control, never a half-initialized page with no
// scale and no key selected.
function control(id) {
  const el = document.getElementById(id);
  if (!el) console.warn(`shifting: no #${id} in this page — control skipped`);
  return el;
}

function initControls() {
  const play = control('play');
  if (play) play.addEventListener('click', togglePlay);

  const tempo = control('tempo');
  if (tempo) {
    tempoBpm = Number(tempo.value);
    tempo.addEventListener('input', () => {
      const n = Number(tempo.value);
      if (Number.isFinite(n) && n >= 30 && n <= 200) { tempoBpm = n; restartIfLooping(); }
    });
  }

  const oct = control('octaves');
  const octVal = document.getElementById('octaves-val');
  if (oct) {
    const applyOct = () => {
      octaves = Number(oct.value);
      if (octVal) octVal.textContent = oct.value;
      buildStrip();
      restartIfLooping();
    };
    applyOct();
    oct.addEventListener('input', applyOct);
  }

  const slide = control('slide');
  const slideVal = document.getElementById('slide-val');
  if (slide) {
    const applySlide = () => {
      slidePct = Number(slide.value);
      if (slideVal) slideVal.textContent = slide.value + '%';
      restartIfLooping();
    };
    applySlide();
    slide.addEventListener('input', applySlide);
  }

  const toggles = [
    ['metronome', (v) => { metronomeOn = v; }],
    ['count-in',  (v) => { countIn = v; }],
    ['loop',      (v) => { loopOn = v; }],
  ];
  toggles.forEach(([id, apply]) => {
    const el = control(id);
    if (!el) return;
    apply(el.checked);
    el.addEventListener('change', () => { apply(el.checked); restartIfLooping(); });
  });
}

// --- settings persistence -------------------------------------------------
// One JSON blob, same shape as the other practice pages, plus the per-key shift
// layouts — those are the page's real content, so losing them on reload would
// make it useless. `v` guards the layout format: v1 hung a shift between two
// notes, v2 puts it on one, so a v1 blob is ignored rather than misread.
const PREFS_KEY = 'shifting:prefs';
const PREFS_VERSION = 2;
const PREFS = [
  { id: 'tempo',        key: 'tempo',      kind: 'num', min: 30, max: 200, ev: 'input' },
  { id: 'octaves',      key: 'octaves',    kind: 'num', min: 1,  max: 2,   ev: 'input' },
  { id: 'slide',        key: 'slide',      kind: 'num', min: 10, max: 70,  ev: 'input' },
  { id: 'metronome',    key: 'metronome',  kind: 'bool', ev: 'change' },
  { id: 'count-in',     key: 'countIn',    kind: 'bool', ev: 'change' },
  { id: 'loop',         key: 'loop',       kind: 'bool', ev: 'change' },
  { id: 'drone-fifth',  key: 'droneFifth', kind: 'bool', ev: 'change' },
  { id: 'drone-volume', key: 'droneVol',   kind: 'num', min: 0, max: 0.4, ev: 'input' },
];

const prefEl = (p) => document.getElementById(p.id);

function readPref(p) {
  const el = prefEl(p);
  if (!el) return undefined; // control absent — leave the stored value alone
  return p.kind === 'bool' ? el.checked : Number(el.value);
}

function writePref(p, v) {
  const el = prefEl(p);
  if (!el) return;
  if (p.kind === 'bool') { if (typeof v === 'boolean') el.checked = v; }
  else { const n = Number(v); if (Number.isFinite(n)) el.value = Math.min(p.max, Math.max(p.min, n)); }
}

// Persist on any control change (the tonal center and the shift layouts persist
// through select()/afterEdit()).
function initPersistence() {
  PREFS.forEach(p => { const el = prefEl(p); if (el) el.addEventListener(p.ev, persist); });
}

function persist() {
  try {
    const data = { v: PREFS_VERSION, center: selectedIndex, shifts: shiftsByRoot };
    PREFS.forEach(p => { const v = readPref(p); if (v !== undefined) data[p.key] = v; });
    localStorage.setItem(PREFS_KEY, JSON.stringify(data));
  } catch (e) { /* storage unavailable (private mode, etc.) — silently skip */ }
}

// Validate on the way in: a stale or hand-edited blob must not be able to
// produce a shift on a note that doesn't exist, or a NaN drop.
function applyPrefs() {
  let p;
  try { p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); } catch (e) { return; }
  if (!p || typeof p !== 'object') return;
  if (Number.isInteger(p.center) && p.center >= 0 && p.center < CIRCLE.length) selectedIndex = p.center;
  PREFS.forEach(entry => writePref(entry, p[entry.key]));
  if (p.v === PREFS_VERSION && p.shifts && typeof p.shifts === 'object') {
    const clean = {};
    CIRCLE.forEach(({ root }) => {
      const list = p.shifts[root];
      if (!Array.isArray(list)) return;
      clean[root] = list
        .filter(s => s && Number.isInteger(s.on) && s.on >= 0 && s.on < 15
                     && Number.isFinite(s.drop) && s.drop >= 1 && s.drop <= 12)
        .map(s => ({ on: s.on, drop: Math.round(s.drop) }));
    });
    if (Object.keys(clean).length) shiftsByRoot = clean;
  }
}

applyPrefs();
buildCircle();
initControls();
initDroneControls();
initPersistence();
select(selectedIndex);
