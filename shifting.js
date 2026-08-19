// Shifting practice page. A major scale plays in strict time; wherever the hand
// has to change position, the pitch *slides* down to the note the hand travels
// through and sounds it on its own beat before the next note is played.
//
// The point is ear training, not notation: in G major the hand leaves C and
// carries down to G♯ before the first finger crosses to C on the next string.
// G♯ has no business in G major, so the ear rejects it — which is exactly why
// it has to be heard, slowly and in tempo, until it stops sounding like a
// mistake and starts sounding like a landmark.
//
// Where the shifts fall is a fingering decision, not a theory one, so the page
// doesn't guess: click a gap between two notes to put a shift there, and ▾ ▴ to
// move the note the hand slides to. Each key keeps its own layout, seeded from
// whichever key you last had open — the circle of fifths is the point.
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

const { pitchToMidi } = AudioKit;
const cello = AudioKit.instruments.cello;

let selectedIndex = 1; // default G major
let octaves = 1;
let tempoBpm = 52;
let slidePct = 55;     // how much of the shift's beat the pitch spends travelling
let restate = true;    // sound the note again, on the new string, once the hand lands
let metronomeOn = true;
let countIn = true;
let loopOn = true;

// Shift layouts, one per key root: [{ after, drop }] — `after` is the index of
// the scale note you shift away from, `drop` how far the hand travels below it
// in semitones. G major starts with the C-string shift: leave C, carry down a
// major third to G♯, cross to C on the G string.
const DEFAULT_SHIFTS = [{ after: 3, drop: 4 }];
let shiftsByRoot = { G: DEFAULT_SHIFTS.map(s => ({ ...s })) };

const currentRoot = () => CIRCLE[selectedIndex].root;
const currentShifts = () => shiftsByRoot[currentRoot()] || [];

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
// The scale's notes as semitone offsets from the tonic, across `octaves`.
function scaleNotes() {
  const degrees = MAJOR.intervals.slice(0, -1);
  const out = [];
  for (let o = 0; o < octaves; o++) for (const d of degrees) out.push(d + 12 * o);
  out.push(12 * octaves);
  return out;
}

// Expand the scale into the events actually heard: every note, plus — at each
// shift — the note the hand slides through, and (optionally) the note restated
// once the hand has landed. A shift parked past the end of the scale (left over
// from a wider octave setting) is ignored rather than dropped, so narrowing the
// range and widening it again doesn't lose the layout.
function buildEvents() {
  const notes = scaleNotes();
  const shifts = currentShifts();
  const out = [];
  notes.forEach((semi, i) => {
    out.push({ semi, kind: 'note', noteIndex: i });
    const sh = shifts.find(s => s.after === i);
    if (!sh || i >= notes.length - 1) return;
    out.push({ semi: semi - sh.drop, kind: 'ghost', shift: sh });
    if (restate) out.push({ semi, kind: 'note', noteIndex: i, restated: true });
  });
  return out;
}

// Per-note shaping handed to the cello voice: the hand travels quietly and
// without re-articulating (it's one bow), and whatever follows it starts a
// fresh stroke — on the cello that note is on a new string, under a new finger.
function shapeFor(events, step) {
  return events.map((e, i) => {
    if (e.kind === 'ghost') return { slide: step * (slidePct / 100), level: 0.7, artic: 0.04 };
    if (i > 0 && events[i - 1].kind === 'ghost') return { artic: 0.8 };
    return null;
  });
}

// --- playback -------------------------------------------------------------
let playing = false;
let loopTimerId = null;
let liveEvents = [];   // the events of the pass currently sounding

function clearHighlight() {
  document.querySelectorAll('#strip .sounding').forEach(el => el.classList.remove('sounding'));
}

function finishPlayback() {
  if (loopTimerId) { clearTimeout(loopTimerId); loopTimerId = null; }
  playing = false;
  document.getElementById('play').classList.remove('playing');
  document.getElementById('play').textContent = 'play';
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
  const events = buildEvents();
  liveEvents = events;
  const step = 60 / tempoBpm; // one event per beat — this is slow practice
  const startWhen = lead && countIn ? AudioKit.currentTime() + 0.05 + step : when;
  const nextStart = cello.playSequence(baseMidi, events.map(e => e.semi), {
    step,
    gate: step,
    attack: 0.025,
    sustain: 0.9,
    release: 0.06,
    when: startWhen,
    chain,
    legato: true,
    shape: shapeFor(events, step),
    clickInterval: metronomeOn ? step : 0,
    clickAccent: true,
    onNote: (semi, i) => {
      clearHighlight();
      const el = document.querySelector(`#strip [data-ev="${i}"]`);
      if (el) el.classList.add('sounding');
    },
  });
  // Scheduled after playSequence, whose fresh-start stopSequence() would
  // otherwise cancel a tick placed before it.
  if (lead && countIn) AudioKit.click(startWhen - step, false);
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

// --- the scale strip ------------------------------------------------------
// Rendered from the same events as the pass, so what you see is what sounds:
// each element carries its event index, which playback highlights as it goes.
function buildStrip() {
  const strip = document.getElementById('strip');
  strip.innerHTML = '';
  const center = CIRCLE[selectedIndex];
  const namer = makeNamer(center.root, center.sig);
  const events = buildEvents();
  const shifts = currentShifts();
  const lastNote = scaleNotes().length - 1;

  events.forEach((e, i) => {
    if (e.kind === 'ghost') {
      strip.appendChild(makeGhost(e, i, namer));
      return;
    }
    const chip = document.createElement('span');
    chip.className = 'note' + (e.restated ? ' restated' : '');
    chip.dataset.ev = i;
    chip.textContent = namer(e.semi);
    strip.appendChild(chip);
    // A gap after this note, unless a shift already lives there (or it's the
    // last note, where there's nothing left to shift into). The restated copy
    // never gets one: it's the same scale note, and a second shift on the same
    // note would be unreachable — buildEvents only honors the first.
    const free = !e.restated && !shifts.some(s => s.after === e.noteIndex);
    if (free && e.noteIndex < lastNote) strip.appendChild(makeGap(e.noteIndex));
  });
}

function makeGap(afterIndex) {
  const b = document.createElement('button');
  b.className = 'gap';
  b.type = 'button';
  b.textContent = '+';
  b.title = 'add a shift here';
  b.setAttribute('aria-label', 'add a shift after this note');
  b.addEventListener('click', () => {
    const list = shiftsByRoot[currentRoot()] || (shiftsByRoot[currentRoot()] = []);
    list.push({ after: afterIndex, drop: 4 });
    afterEdit();
  });
  return b;
}

function makeGhost(event, evIndex, namer) {
  const wrap = document.createElement('span');
  wrap.className = 'ghost';
  wrap.dataset.ev = evIndex;

  const down = document.createElement('button');
  down.type = 'button';
  down.textContent = '▾';
  down.setAttribute('aria-label', 'slide further down');
  down.addEventListener('click', () => nudge(event.shift, 1));

  const name = document.createElement('span');
  name.className = 'ghost-name';
  name.textContent = namer(event.semi);

  const up = document.createElement('button');
  up.type = 'button';
  up.textContent = '▴';
  up.setAttribute('aria-label', 'slide less far down');
  up.addEventListener('click', () => nudge(event.shift, -1));

  const drop = document.createElement('span');
  drop.className = 'drop-label';
  drop.textContent = `−${event.shift.drop}`;

  const kill = document.createElement('button');
  kill.type = 'button';
  kill.textContent = '×';
  kill.setAttribute('aria-label', 'remove this shift');
  kill.addEventListener('click', () => {
    const list = shiftsByRoot[currentRoot()] || [];
    const k = list.indexOf(event.shift);
    if (k >= 0) list.splice(k, 1);
    afterEdit();
  });

  wrap.append(down, name, up, drop, kill);
  return wrap;
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
    shiftsByRoot[root] = seed.map(s => ({ after: s.after, drop: s.drop }));
  }
  CIRCLE.forEach((e, j) => e.el.classList.toggle('selected', j === i));
  document.getElementById('center-label').textContent = CIRCLE[i].label + ' major';
  drone.setRoot(pitchToMidi(root, 3));
  buildStrip();
  persist();
  restartIfLooping();
}

// --- drone ----------------------------------------------------------------
const drone = AudioKit.createDrone();

function initDroneControls() {
  const btn = document.getElementById('drone-btn');
  btn.addEventListener('click', () => {
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
  const fifth = document.getElementById('drone-fifth');
  drone.setFifth(fifth.checked);
  fifth.addEventListener('change', () => drone.setFifth(fifth.checked));
  const vol = document.getElementById('drone-volume');
  drone.setVolume(parseFloat(vol.value));
  vol.addEventListener('input', () => drone.setVolume(parseFloat(vol.value)));
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
function initControls() {
  document.getElementById('play').addEventListener('click', togglePlay);

  const tempo = document.getElementById('tempo');
  tempoBpm = Number(tempo.value);
  tempo.addEventListener('input', () => {
    const n = Number(tempo.value);
    if (Number.isFinite(n) && n >= 30 && n <= 200) { tempoBpm = n; restartIfLooping(); }
  });

  const oct = document.getElementById('octaves');
  const octVal = document.getElementById('octaves-val');
  const applyOct = () => {
    octaves = Number(oct.value);
    octVal.textContent = oct.value;
    buildStrip();
    restartIfLooping();
  };
  applyOct();
  oct.addEventListener('input', applyOct);

  const slide = document.getElementById('slide');
  const slideVal = document.getElementById('slide-val');
  const applySlide = () => {
    slidePct = Number(slide.value);
    slideVal.textContent = slide.value + '%';
    restartIfLooping();
  };
  applySlide();
  slide.addEventListener('input', applySlide);

  const toggles = [
    ['restate',    (v) => { restate = v; buildStrip(); }],
    ['metronome',  (v) => { metronomeOn = v; }],
    ['count-in',   (v) => { countIn = v; }],
    ['loop',       (v) => { loopOn = v; }],
  ];
  toggles.forEach(([id, apply]) => {
    const el = document.getElementById(id);
    apply(el.checked);
    el.addEventListener('change', () => { apply(el.checked); restartIfLooping(); });
  });
}

// --- settings persistence -------------------------------------------------
// One JSON blob, same shape as the other practice pages, plus the per-key shift
// layouts — those are the page's real content, so losing them on reload would
// make it useless.
const PREFS_KEY = 'shifting:prefs';
const PREFS = [
  { id: 'tempo',        key: 'tempo',      kind: 'num', min: 30, max: 200, ev: 'input' },
  { id: 'octaves',      key: 'octaves',    kind: 'num', min: 1,  max: 2,   ev: 'input' },
  { id: 'slide',        key: 'slide',      kind: 'num', min: 15, max: 90,  ev: 'input' },
  { id: 'restate',      key: 'restate',    kind: 'bool', ev: 'change' },
  { id: 'metronome',    key: 'metronome',  kind: 'bool', ev: 'change' },
  { id: 'count-in',     key: 'countIn',    kind: 'bool', ev: 'change' },
  { id: 'loop',         key: 'loop',       kind: 'bool', ev: 'change' },
  { id: 'drone-fifth',  key: 'droneFifth', kind: 'bool', ev: 'change' },
  { id: 'drone-volume', key: 'droneVol',   kind: 'num', min: 0, max: 0.4, ev: 'input' },
];

const prefEl = (p) => document.getElementById(p.id);

function readPref(p) {
  const el = prefEl(p);
  return p.kind === 'bool' ? el.checked : Number(el.value);
}

function writePref(p, v) {
  const el = prefEl(p);
  if (p.kind === 'bool') { if (typeof v === 'boolean') el.checked = v; }
  else { const n = Number(v); if (Number.isFinite(n)) el.value = Math.min(p.max, Math.max(p.min, n)); }
}

// Persist on any control change (the tonal center and the shift layouts persist
// through select()/afterEdit()).
function initPersistence() {
  PREFS.forEach(p => prefEl(p).addEventListener(p.ev, persist));
}

function persist() {
  try {
    const data = { center: selectedIndex, shifts: shiftsByRoot };
    PREFS.forEach(p => { data[p.key] = readPref(p); });
    localStorage.setItem(PREFS_KEY, JSON.stringify(data));
  } catch (e) { /* storage unavailable (private mode, etc.) — silently skip */ }
}

// Validate on the way in: a stale or hand-edited blob must not be able to
// produce a shift pointing at a note that doesn't exist, or a NaN drop.
function applyPrefs() {
  let p;
  try { p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); } catch (e) { return; }
  if (!p || typeof p !== 'object') return;
  if (Number.isInteger(p.center) && p.center >= 0 && p.center < CIRCLE.length) selectedIndex = p.center;
  PREFS.forEach(entry => writePref(entry, p[entry.key]));
  if (p.shifts && typeof p.shifts === 'object') {
    const clean = {};
    CIRCLE.forEach(({ root }) => {
      const list = p.shifts[root];
      if (!Array.isArray(list)) return;
      clean[root] = list
        .filter(s => s && Number.isInteger(s.after) && s.after >= 0 && s.after < 15
                     && Number.isFinite(s.drop) && s.drop >= 1 && s.drop <= 12)
        .map(s => ({ after: s.after, drop: Math.round(s.drop) }));
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
