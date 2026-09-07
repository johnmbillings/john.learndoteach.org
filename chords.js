// Chords page — a palette you compose with.
//
// Pick a tonal centre on the circle of fifths and the page lays out every chord
// that belongs to it: the diatonic major and minor rows are always on screen
// (borrowing is just reaching across from one row to the other), and switches
// open up sevenths, further borrowed/modal colours, diminished shapes,
// secondary dominants, suspensions and chromatic chords. Clicking a chord
// sounds it and shows it on the keyboard (and, if you open the panel, on the
// guitar); "add chord to progression" drops it into the strip pinned at the
// bottom, which plays back with simple voice leading. The progression is stored
// by scale degree, so changing the tonal centre transposes it.
//
// Audio helpers (pitchToMidi, the poly synth) live in audio.js.

const NS = 'http://www.w3.org/2000/svg';
const STORE_KEY = 'chords.v2';

// Roots clockwise around the circle of fifths, starting at the top (same order
// as the scales / jazz 7ths pages). `root` is the spelling used to build and
// label chords; `alt` is the enharmonic shown beneath it.
const CIRCLE = [
  { label: 'C',  root: 'C'  },
  { label: 'G',  root: 'G'  },
  { label: 'D',  root: 'D'  },
  { label: 'A',  root: 'A'  },
  { label: 'E',  root: 'E'  },
  { label: 'B',  alt: 'C♭', root: 'B'  },
  { label: 'G♭', alt: 'F♯', root: 'Gb' },
  { label: 'D♭', alt: 'C♯', root: 'Db' },
  { label: 'A♭', root: 'Ab' },
  { label: 'E♭', root: 'Eb' },
  { label: 'B♭', root: 'Bb' },
  { label: 'F',  root: 'F'  },
];

// --- note spelling (same letter-name approach as scales.js) ----------------
// Spell each chord tone by letter so accidentals read correctly for the key
// (e.g. the ♭III of G♭ minor is B𝄫, not A).
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

function parseRoot(root) {
  const li = LETTERS.indexOf(root[0].toUpperCase());
  const acc = root[1] === 'b' || root[1] === '♭' ? -1 : (root[1] === '#' || root[1] === '♯' ? 1 : 0);
  return { letterIdx: li, pc: (LETTER_PC[li] + acc + 12) % 12 };
}

function spellPc(letterIdx, pc) {
  const diff = ((pc - LETTER_PC[letterIdx] + 6) % 12 + 12) % 12 - 6; // nearest signed offset
  const glyphs = { '-2': '𝄫', '-1': '♭', '0': '', '1': '♯', '2': '𝄪' };
  const key = String(diff);
  const glyph = Object.prototype.hasOwnProperty.call(glyphs, key) ? glyphs[key] : '?';
  return LETTERS[letterIdx] + glyph;
}

// --- chord qualities -------------------------------------------------------
// iv: semitone offsets from the root. ls: how many letter-names above the root
// each tone spans, so it spells correctly (a 7th is 6 letters up, a 9th is 1
// letter up an octave). sym: the suffix appended to the root in the chord name.
const Q = {
  maj:    { sym: '',        name: 'major',                 iv: [0, 4, 7],        ls: [0, 2, 4] },
  min:    { sym: 'm',       name: 'minor',                 iv: [0, 3, 7],        ls: [0, 2, 4] },
  dim:    { sym: '°',       name: 'diminished',            iv: [0, 3, 6],        ls: [0, 2, 4] },
  aug:    { sym: '+',       name: 'augmented',             iv: [0, 4, 8],        ls: [0, 2, 4] },
  maj7:   { sym: 'maj7',    name: 'major 7th',             iv: [0, 4, 7, 11],    ls: [0, 2, 4, 6] },
  min7:   { sym: 'm7',      name: 'minor 7th',             iv: [0, 3, 7, 10],    ls: [0, 2, 4, 6] },
  dom7:   { sym: '7',       name: 'dominant 7th',          iv: [0, 4, 7, 10],    ls: [0, 2, 4, 6] },
  m7b5:   { sym: 'ø7',      name: 'half-diminished 7th',   iv: [0, 3, 6, 10],    ls: [0, 2, 4, 6] },
  dim7:   { sym: '°7',      name: 'diminished 7th',        iv: [0, 3, 6, 9],     ls: [0, 2, 4, 6] },
  mMaj7:  { sym: 'm(maj7)', name: 'minor-major 7th',       iv: [0, 3, 7, 11],    ls: [0, 2, 4, 6] },
  aug7:   { sym: '7♯5',     name: 'augmented 7th',         iv: [0, 4, 8, 10],    ls: [0, 2, 4, 6] },
  sus2:   { sym: 'sus2',    name: 'suspended 2nd',         iv: [0, 2, 7],        ls: [0, 1, 4] },
  sus4:   { sym: 'sus4',    name: 'suspended 4th',         iv: [0, 5, 7],        ls: [0, 3, 4] },
  dom7s4: { sym: '7sus4',   name: 'dominant 7th sus4',     iv: [0, 5, 7, 10],    ls: [0, 3, 4, 6] },
  add9:   { sym: 'add9',    name: 'added 9th',             iv: [0, 4, 7, 14],    ls: [0, 2, 4, 1] },
  madd9:  { sym: 'm(add9)', name: 'minor added 9th',       iv: [0, 3, 7, 14],    ls: [0, 2, 4, 1] },
  maj6:   { sym: '6',       name: 'major 6th',             iv: [0, 4, 7, 9],     ls: [0, 2, 4, 5] },
  min6:   { sym: 'm6',      name: 'minor 6th',             iv: [0, 3, 7, 9],     ls: [0, 2, 4, 5] },
  six9:   { sym: '6/9',     name: '6/9',                   iv: [0, 4, 7, 9, 14], ls: [0, 2, 4, 5, 1] },
  maj7s11:{ sym: 'maj7♯11', name: 'major 7th ♯11 (Lydian)', iv: [0, 4, 7, 11, 18], ls: [0, 2, 4, 6, 3] },
  // Augmented sixths, spelled from the ♭6 bass: the top note is an augmented
  // 6th (10 semitones, 5 letters up) rather than a minor 7th, which is what
  // makes them resolve outwards onto the dominant.
  it6:    { sym: ' It+6',   name: 'Italian augmented 6th',  iv: [0, 4, 10],       ls: [0, 2, 5] },
  fr6:    { sym: ' Fr+6',   name: 'French augmented 6th',   iv: [0, 4, 6, 10],    ls: [0, 2, 3, 5] },
  ger6:   { sym: ' Ger+6',  name: 'German augmented 6th',   iv: [0, 4, 7, 10],    ls: [0, 2, 4, 5] },
};

// --- the palette -----------------------------------------------------------
// Every entry is written relative to the tonal centre: `ls` is how many letter
// names above the tonic the root sits, `semi` how many semitones. That keeps
// spelling honest in any key and lets a saved progression transpose.
const MAJOR_TRIADS = [
  { rn: 'I',    ls: 0, semi: 0,  q: 'maj', note: 'tonic — home' },
  { rn: 'ii',   ls: 1, semi: 2,  q: 'min', note: 'supertonic — the classic pre-dominant' },
  { rn: 'iii',  ls: 2, semi: 4,  q: 'min', note: 'mediant — shares two notes with I' },
  { rn: 'IV',   ls: 3, semi: 5,  q: 'maj', note: 'subdominant — the step away' },
  { rn: 'V',    ls: 4, semi: 7,  q: 'maj', note: 'dominant — pulls back to I' },
  { rn: 'vi',   ls: 5, semi: 9,  q: 'min', note: 'relative minor' },
  { rn: 'vii°', ls: 6, semi: 11, q: 'dim', note: 'leading-tone triad — dominant function' },
];
const MAJOR_SEVENTHS = [
  { rn: 'Imaj7',  ls: 0, semi: 0,  q: 'maj7', note: 'tonic, made luminous' },
  { rn: 'ii7',    ls: 1, semi: 2,  q: 'min7', note: 'the ii of a ii–V–I' },
  { rn: 'iii7',   ls: 2, semi: 4,  q: 'min7' },
  { rn: 'IVmaj7', ls: 3, semi: 5,  q: 'maj7' },
  { rn: 'V7',     ls: 4, semi: 7,  q: 'dom7', note: 'the dominant seventh — the strongest pull home' },
  { rn: 'vi7',    ls: 5, semi: 9,  q: 'min7' },
  { rn: 'viiø7',  ls: 6, semi: 11, q: 'm7b5', note: 'half-diminished — V7 without its root' },
];
const MINOR_TRIADS = [
  { rn: 'i',    ls: 0, semi: 0,  q: 'min', note: 'tonic minor' },
  { rn: 'ii°',  ls: 1, semi: 2,  q: 'dim', note: 'diminished supertonic' },
  { rn: '♭III', ls: 2, semi: 3,  q: 'maj', note: 'the relative major' },
  { rn: 'iv',   ls: 3, semi: 5,  q: 'min', note: 'minor subdominant — the great borrowed chord' },
  { rn: 'v',    ls: 4, semi: 7,  q: 'min', note: 'natural-minor dominant — softer than V' },
  { rn: '♭VI',  ls: 5, semi: 8,  q: 'maj', note: 'submediant — the deceptive resolution' },
  { rn: '♭VII', ls: 6, semi: 10, q: 'maj', note: 'subtonic — the rock cadence ♭VII–I' },
];
const MINOR_SEVENTHS = [
  { rn: 'i7',       ls: 0, semi: 0,  q: 'min7' },
  { rn: 'iiø7',     ls: 1, semi: 2,  q: 'm7b5', note: 'the ii of a minor ii–V–i' },
  { rn: '♭IIImaj7', ls: 2, semi: 3,  q: 'maj7' },
  { rn: 'iv7',      ls: 3, semi: 5,  q: 'min7' },
  { rn: 'v7',       ls: 4, semi: 7,  q: 'min7' },
  { rn: '♭VImaj7',  ls: 5, semi: 8,  q: 'maj7' },
  { rn: '♭VII7',    ls: 6, semi: 10, q: 'dom7', note: 'the backdoor dominant — ♭VII7 → I' },
];
// The harmonic and melodic minors add nothing new here: their V, vii° and IV
// are the major row's V, vii° and IV, so the two rows above already cover them.
const MINOR_EXTRA = [
  { rn: 'i(maj7)', ls: 0, semi: 0,  q: 'mMaj7', note: 'harmonic-minor tonic — the "James Bond" chord' },
  { rn: 'vii°7',   ls: 6, semi: 11, q: 'dim7',  note: 'harmonic-minor leading-tone seventh' },
];

const BORROWED = [
  { rn: '♭II',  ls: 1, semi: 1,  q: 'maj', note: 'the Neapolitan — Phrygian ♭2, usually heard in first inversion' },
  { rn: 'II',   ls: 1, semi: 2,  q: 'maj', note: 'major II — Lydian / Dorian colour, and the triad of V/V' },
  { rn: 'III',  ls: 2, semi: 4,  q: 'maj', note: 'major III — from the harmonic minor, the triad of V/vi' },
  { rn: 'VI',   ls: 5, semi: 9,  q: 'maj', note: 'major VI — Dorian brightness, the triad of V/ii' },
  { rn: 'VII',  ls: 6, semi: 11, q: 'maj', note: 'major VII — the triad of V/iii' },
  { rn: 'I',    ls: 0, semi: 0,  q: 'maj', note: 'the Picardy third — a major tonic ending a minor piece' },
  { rn: 'iv',   ls: 3, semi: 5,  q: 'min', note: 'minor iv in a major key — the classic mixture chord' },
  { rn: '♭VI',  ls: 5, semi: 8,  q: 'maj', note: 'borrowed ♭VI — the "Aeolian" lift' },
  { rn: '♭VII', ls: 6, semi: 10, q: 'maj', note: 'borrowed ♭VII — Mixolydian' },
  { rn: 'IVmaj7♯11', ls: 3, semi: 5, q: 'maj7s11', note: 'the Lydian subdominant — IVmaj7 with a raised 4th on top' },
];

const DIMINISHED = [
  { rn: 'vii°',   ls: 6, semi: 11, q: 'dim',  note: 'leading-tone triad' },
  { rn: 'ii°',    ls: 1, semi: 2,  q: 'dim',  note: 'diminished supertonic (minor key)' },
  { rn: 'vii°7',  ls: 6, semi: 11, q: 'dim7', note: 'fully diminished — resolves to I' },
  { rn: '♯i°7',   ls: 0, semi: 1,  q: 'dim7', note: 'chromatic passing chord between I and ii' },
  { rn: '♯ii°7',  ls: 1, semi: 3,  q: 'dim7', note: 'chromatic passing chord between ii and iii' },
  { rn: '♯iv°7',  ls: 3, semi: 6,  q: 'dim7', note: 'the diminished approach to V (vii°7 of V)' },
  { rn: 'viiø7',  ls: 6, semi: 11, q: 'm7b5', note: 'half-diminished leading-tone seventh' },
  { rn: 'iiø7',   ls: 1, semi: 2,  q: 'm7b5', note: 'the ii of a minor ii–V–i' },
  { rn: '♯ivø7',  ls: 3, semi: 6,  q: 'm7b5', note: 'Lydian ♯iv — a softer approach to V' },
];

const SECONDARY = [
  { rn: 'V7/ii',  ls: 5, semi: 9,  q: 'dom7', note: 'dominant of ii' },
  { rn: 'V7/iii', ls: 6, semi: 11, q: 'dom7', note: 'dominant of iii' },
  { rn: 'V7/IV',  ls: 0, semi: 0,  q: 'dom7', note: 'dominant of IV — the tonic turned into a seventh' },
  { rn: 'V7/V',   ls: 1, semi: 2,  q: 'dom7', note: 'dominant of the dominant' },
  { rn: 'V7/vi',  ls: 2, semi: 4,  q: 'dom7', note: 'dominant of vi' },
  { rn: 'V7/♭VII', ls: 3, semi: 5, q: 'dom7', note: 'dominant of ♭VII — IV7, the blues subdominant' },
];

const SUS_ADDED = [
  { rn: 'Isus4',  ls: 0, semi: 0, q: 'sus4',   note: 'suspension over the tonic' },
  { rn: 'Isus2',  ls: 0, semi: 0, q: 'sus2' },
  { rn: 'Iadd9',  ls: 0, semi: 0, q: 'add9' },
  { rn: 'I6',     ls: 0, semi: 0, q: 'maj6' },
  { rn: 'I6/9',   ls: 0, semi: 0, q: 'six9' },
  { rn: 'i(add9)', ls: 0, semi: 0, q: 'madd9' },
  { rn: 'i6',     ls: 0, semi: 0, q: 'min6',   note: 'melodic-minor tonic 6th' },
  { rn: 'IVsus2', ls: 3, semi: 5, q: 'sus2' },
  { rn: 'Vsus4',  ls: 4, semi: 7, q: 'sus4',   note: 'the delayed dominant — resolves to V' },
  { rn: 'V7sus4', ls: 4, semi: 7, q: 'dom7s4' },
  { rn: 'vi7',    ls: 5, semi: 9, q: 'min7' },
];

const CHROMATIC = [
  { rn: 'I+',     ls: 0, semi: 0, q: 'aug',  note: 'augmented tonic — the ♯5 leads up to vi' },
  { rn: 'V+',     ls: 4, semi: 7, q: 'aug',  note: 'augmented dominant — extra pull into I' },
  { rn: 'V7♯5',   ls: 4, semi: 7, q: 'aug7', note: 'altered dominant' },
  { rn: '♭II7',   ls: 1, semi: 1, q: 'dom7', note: 'tritone substitution — stands in for V7' },
  { rn: 'It+6',   ls: 5, semi: 8, q: 'it6',  note: 'Italian augmented 6th — resolves outwards onto V' },
  { rn: 'Fr+6',   ls: 5, semi: 8, q: 'fr6',  note: 'French augmented 6th' },
  { rn: 'Ger+6',  ls: 5, semi: 8, q: 'ger6', note: 'German augmented 6th — sounds like ♭VI7' },
  { rn: '♭VImaj7', ls: 5, semi: 8, q: 'maj7', note: 'the cinematic ♭VImaj7' },
];

// Optional palettes, in the order their switches appear.
const OPTIONAL_GROUPS = [
  { id: 'borrowed',  label: 'borrowed & modal',    caption: 'colours from the other modes of this tonic', entries: BORROWED },
  { id: 'dim',       label: 'diminished',          caption: 'leading-tone and chromatic passing chords',  entries: DIMINISHED },
  { id: 'secondary', label: 'secondary dominants', caption: 'a V7 aimed at a chord other than I',         entries: SECONDARY },
  { id: 'sus',       label: 'suspended & added',   caption: 'triads with a note swapped in or added',      entries: SUS_ADDED },
  { id: 'chromatic', label: 'augmented & chromatic', caption: 'augmented triads, tritone subs, +6 chords', entries: CHROMATIC },
];

const SIZES = [
  { id: 'triads',   label: 'triads' },
  { id: 'sevenths', label: 'sevenths' },
  { id: 'both',     label: 'both' },
];

// --- state -----------------------------------------------------------------
let rootIndex = 0;                      // index into CIRCLE
let size = 'triads';                    // triads | sevenths | both
const shownGroups = new Set();          // ids from OPTIONAL_GROUPS
let selected = null;                    // the entry currently in the detail panel
let progression = [];                   // entries, in order

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      rootIndex, size, groups: [...shownGroups], progression,
    }));
  } catch (e) {}
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!s) return;
    if (Number.isInteger(s.rootIndex) && CIRCLE[s.rootIndex]) rootIndex = s.rootIndex;
    if (SIZES.some(x => x.id === s.size)) size = s.size;
    if (Array.isArray(s.groups)) s.groups.forEach(g => {
      if (OPTIONAL_GROUPS.some(x => x.id === g)) shownGroups.add(g);
    });
    if (Array.isArray(s.progression)) {
      progression = s.progression.filter(e =>
        e && Q[e.q] && Number.isInteger(e.ls) && Number.isInteger(e.semi));
    }
  } catch (e) {}
}

// --- building a chord from an entry ---------------------------------------
function tonic() { return parseRoot(CIRCLE[rootIndex].root); }

function buildChord(entry) {
  const t = tonic();
  const letterIdx = (t.letterIdx + entry.ls) % 7;
  const rootPc = (t.pc + entry.semi) % 12;
  const q = Q[entry.q];
  const rootName = spellPc(letterIdx, rootPc);
  const tones = q.iv.map((iv, i) => ({
    iv,
    pc: (rootPc + iv) % 12,
    name: spellPc((letterIdx + q.ls[i]) % 7, (rootPc + iv) % 12),
  }));
  return { entry, q, rootName, rootPc, tones, symbol: rootName + q.sym };
}

// The palette rows for the current settings, as { label, caption, entries }.
function paletteGroups() {
  const key = spellPc(tonic().letterIdx, tonic().pc);
  const rows = [];
  const diatonic = (triads, sevenths) => {
    if (size === 'triads') return triads;
    if (size === 'sevenths') return sevenths;
    // "both" interleaves so each degree's triad and seventh sit together.
    return triads.flatMap((t, i) => [t, sevenths[i]]);
  };
  rows.push({
    id: 'major',
    label: key + ' major',
    caption: 'the diatonic chords of the major scale',
    entries: diatonic(MAJOR_TRIADS, MAJOR_SEVENTHS),
  });
  rows.push({
    id: 'minor',
    label: key + ' minor',
    caption: 'the natural minor, plus its harmonic-minor colours',
    entries: diatonic(MINOR_TRIADS, MINOR_SEVENTHS).concat(MINOR_EXTRA),
  });
  OPTIONAL_GROUPS.forEach(g => {
    if (shownGroups.has(g.id)) rows.push(g);
  });
  return rows;
}

// --- playback --------------------------------------------------------------
const synth = AudioKit.createPolySynth();
// AudioKit installs global resume handlers on visibilitychange + first gesture;
// iOS additionally needs the silent-buffer kickstart on the first gesture.
['pointerdown', 'touchstart', 'mousedown', 'keydown'].forEach(ev =>
  window.addEventListener(ev, () => synth.unlock(), true));

let timers = [];
let activeBtn = null;

function stopSound() {
  timers.forEach(id => clearTimeout(id));
  timers = [];
  synth.allOff();
  document.querySelectorAll('.sounding').forEach(el => el.classList.remove('sounding'));
  if (activeBtn) { activeBtn.classList.remove('playing'); activeBtn = null; }
  document.getElementById('prog-play').textContent = 'play';
  showSelectedOnKeyboard(); // fall back to the selected chord, drawn but silent
}

// Voice a chord for playback: a bass root low down, and the chord itself in
// close position, choosing the inversion whose top note sits nearest the
// previous chord's — plain voice leading, so a progression doesn't leap about.
const VOICE_TOP = 84;   // highest note we'll voice (E6-ish)
const VOICE_HOME = 76;  // where the top voice likes to sit when starting out

function voiceChord(chord, prevTop) {
  const base = 60 + chord.rootPc;              // root position, C4–B4
  const rooted = chord.q.iv.map(iv => base + iv);
  let best = null;
  for (let inv = 0; inv < rooted.length; inv++) {
    const notes = rooted.slice();
    for (let i = 0; i < inv; i++) notes.push(notes.shift() + 12);
    let shift = 0;
    while (Math.max(...notes) + shift > VOICE_TOP) shift -= 12;
    const voiced = notes.map(n => n + shift).sort((a, b) => a - b);
    const top = voiced[voiced.length - 1];
    const cost = Math.abs(top - (prevTop == null ? VOICE_HOME : prevTop));
    if (!best || cost < best.cost) best = { notes: voiced, top, cost };
  }
  return { notes: [48 + chord.rootPc, ...best.notes], top: best.top };
}

// Sound an explicit list of MIDI notes. 'block' strikes them together, 'arp'
// rolls them low-to-high `step` ms apart and lets them ring.
function playMidis(midis, mode, btn, step) {
  const wasActive = btn && activeBtn === btn;
  stopSound();
  if (wasActive) return;                       // clicking the lit button stops
  if (btn) { activeBtn = btn; btn.classList.add('playing'); }
  clearHighlights();                           // the keys now follow what sounds
  if (mode === 'block') {
    midis.forEach(m => { synth.noteOn(m); highlightKey(m, true); });
    timers.push(setTimeout(stopSound, 1900));
  } else {
    const s = step || 170;
    midis.forEach((m, i) => timers.push(setTimeout(() => {
      synth.noteOn(m);
      highlightKey(m, true);
    }, i * s)));
    timers.push(setTimeout(stopSound, midis.length * s + 1400));
  }
}

function playChord(entry, mode, btn) {
  if (!entry) return;
  playMidis(voiceChord(buildChord(entry), null).notes, mode, btn);
}

// --- mini keyboard ---------------------------------------------------------
// Three octaves, C3–D6: wide enough for the bass root plus the voicing above it.
const KBD_LOW = 48, KBD_HIGH = 86;
const WHITE_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);
const pcOf = m => ((m % 12) + 12) % 12;

function buildMiniKeyboard() {
  const k = document.getElementById('mini-kbd');
  for (let m = KBD_LOW; m <= KBD_HIGH; m++) {
    if (!WHITE_PCS.has(pcOf(m))) continue;
    const w = document.createElement('div');
    w.className = 'mini-key white';
    w.dataset.midi = m;
    // The black key (if any) hangs off the white key to its left so it
    // straddles the boundary cleanly — same trick as the keyboard page.
    const bm = m + 1;
    if (bm <= KBD_HIGH && !WHITE_PCS.has(pcOf(bm))) {
      const b = document.createElement('div');
      b.className = 'mini-key black';
      b.dataset.midi = bm;
      w.appendChild(b);
    }
    k.appendChild(w);
  }
}

function highlightKey(midi, on) {
  const el = document.querySelector(`.mini-key[data-midi="${midi}"]`);
  if (el) el.classList.toggle('on', on);
}

function clearHighlights() {
  document.querySelectorAll('.mini-key.on').forEach(el => el.classList.remove('on'));
}

// With nothing playing the keyboard still draws the selected chord, so you can
// read its shape as well as hear it.
function showSelectedOnKeyboard() {
  clearHighlights();
  if (!selected) return;
  voiceChord(buildChord(selected), null).notes.forEach(m => highlightKey(m, true));
}

// --- guitar voicings -------------------------------------------------------
// Rather than ship a hand-typed chord dictionary, we search the fretboard for
// the selected chord. Standard tuning, open-string MIDI low→high (E2 A2 D3 G3
// B3 E4). For each string a candidate is either muted or a fret whose pitch
// class belongs to the chord; we keep the shapes that are actually playable
// (root in the bass, a contiguous run of sounding strings, a ≤3-fret hand
// span) and then present the best shape at each neck position.
const GUITAR_STRINGS = [40, 45, 50, 55, 59, 64];
const GUITAR_MAX_FRET = 12;
const MAX_SPAN = 3;          // frets a hand can reach (a 4-fret window)
const OPEN_WINDOW = 4;       // highest fret an open-position shape may reach

function guitarVoicings(rootPc, allPcs, essentialPcs) {
  const found = [];

  // Candidate frets per string: mute (-1), or any fret that is a chord tone.
  const candidates = GUITAR_STRINGS.map(open => {
    const cands = [-1];
    for (let f = 0; f <= GUITAR_MAX_FRET; f++) {
      if (allPcs.has((open + f) % 12)) cands.push(f);
    }
    return cands;
  });

  const frets = new Array(6);
  function recurse(s, minFret, maxFret) {
    if (s === 6) { consider(frets.slice()); return; }
    for (const f of candidates[s]) {
      let nMin = minFret, nMax = maxFret;
      if (f > 0) {
        nMin = Math.min(minFret, f);
        nMax = Math.max(maxFret, f);
        if (nMax - nMin > MAX_SPAN) continue; // out of reach
      }
      frets[s] = f;
      recurse(s + 1, nMin, nMax);
    }
  }

  function consider(f) {
    const sounding = [];
    for (let i = 0; i < 6; i++) if (f[i] >= 0) sounding.push(i);
    if (sounding.length < 4) return;                      // too thin
    // Sounding strings must be one contiguous block (no awkward inner mutes).
    for (let i = 1; i < sounding.length; i++) {
      if (sounding[i] !== sounding[i - 1] + 1) return;
    }
    const bass = sounding[0];
    if ((GUITAR_STRINGS[bass] + f[bass]) % 12 !== rootPc) return; // root in bass
    const pcs = new Set(sounding.map(i => (GUITAR_STRINGS[i] + f[i]) % 12));
    for (const pc of essentialPcs) if (!pcs.has(pc)) return;      // needs the colour tones

    const fretted = sounding.map(i => f[i]).filter(v => v > 0);
    const hasOpen = sounding.some(i => f[i] === 0);
    const minFret = fretted.length ? Math.min(...fretted) : 1;
    const maxFret = fretted.length ? Math.max(...fretted) : 0;
    // An open-string shape reads from the nut (frets 1–5, nut drawn); a closed
    // shape is movable and starts at its lowest fretted note.
    let startFret;
    if (hasOpen) {
      if (maxFret > OPEN_WINDOW) return;
      startFret = 1;
    } else {
      startFret = minFret <= 1 ? 1 : minFret;
    }
    const span = fretted.length ? maxFret - minFret : 0;

    let score = sounding.length * 3 - startFret * 2 - span;
    if (pcs.size === allPcs.size) score += 4;                     // complete voicing
    if (hasOpen) score += 1;

    found.push({ frets: f, startFret, hasOpen, score });
  }

  recurse(0, 99, 0);

  // Keep the single best shape at each neck position, low-to-high up the neck.
  const bestAt = new Map();
  for (const v of found) {
    const cur = bestAt.get(v.startFret);
    if (!cur || v.score > cur.score) bestAt.set(v.startFret, v);
  }
  return [...bestAt.values()]
    .sort((a, b) => a.startFret - b.startFret)
    .slice(0, 6);
}

let guitarShapes = [];
let voicingIndex = 0;

function voicingLabel(v) {
  return v.startFret <= 1 && v.hasOpen ? 'open' : v.startFret + 'fr';
}

function el(tag, attrs, text) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  return e;
}

const FB = { padX: 18, padTop: 26, colW: 16, rowH: 20, frets: 5 };

function renderFretboard(v) {
  const svg = document.getElementById('fretboard');
  svg.textContent = '';
  const { padX, padTop, colW, rowH, frets } = FB;
  const xs = i => padX + i * colW;
  const ys = r => padTop + r * rowH;
  const right = xs(5), bottom = ys(frets);

  if (!v) {
    svg.appendChild(el('text', {
      x: (padX + right) / 2, y: padTop + 40, 'text-anchor': 'middle',
      fill: 'rgba(255,255,255,0.5)', 'font-size': 11, 'font-style': 'italic',
    }, 'no standard shape'));
    return;
  }

  for (let i = 0; i < 6; i++) {
    svg.appendChild(el('line', { x1: xs(i), y1: padTop, x2: xs(i), y2: bottom, stroke: '#888', 'stroke-width': 1 }));
  }
  for (let r = 0; r <= frets; r++) {
    const nut = r === 0 && v.startFret === 1;
    svg.appendChild(el('line', {
      x1: padX, y1: ys(r), x2: right, y2: ys(r),
      stroke: nut ? '#e6e6e6' : '#888', 'stroke-width': nut ? 3.5 : 1,
    }));
  }

  if (v.startFret > 1) {
    svg.appendChild(el('text', {
      x: padX - 6, y: ys(0) + rowH * 0.5, 'text-anchor': 'end',
      'dominant-baseline': 'central', fill: '#bbb', 'font-size': 11,
    }, v.startFret + 'fr'));
  }

  // Markers per string: dot on the fret, or o / × above the nut.
  for (let i = 0; i < 6; i++) {
    const f = v.frets[i];
    if (f > 0) {
      const row = f - v.startFret;
      svg.appendChild(el('circle', {
        cx: xs(i), cy: padTop + (row + 0.5) * rowH, r: 5.2, fill: '#9cd8ff',
      }));
    } else if (f === 0) {
      svg.appendChild(el('circle', {
        cx: xs(i), cy: padTop - 10, r: 4, fill: 'none', stroke: '#cfcfcf', 'stroke-width': 1.3,
      }));
    } else {
      svg.appendChild(el('text', {
        x: xs(i), y: padTop - 6, 'text-anchor': 'middle', fill: '#7a7a7a', 'font-size': 12,
      }, '×'));
    }
  }
}

function voicingCaption(v) {
  return v ? v.frets.map(f => (f < 0 ? '×' : f)).join('  ') : ' ';
}

function selectVoicing(i) {
  voicingIndex = i;
  document.querySelectorAll('.voicing-tab').forEach((t, j) =>
    t.classList.toggle('active', j === i));
  const v = guitarShapes[i];
  renderFretboard(v);
  document.getElementById('guitar-caption').textContent = voicingCaption(v);
}

function renderGuitar(chord) {
  const all = new Set(chord.tones.map(t => t.pc));
  // The perfect 5th is the one tone guitarists routinely drop; everything else
  // (root, 3rd/sus, 6th/7th/9th, and any altered 5th) is essential.
  const essential = new Set(all);
  if (chord.q.iv.includes(7)) essential.delete((chord.rootPc + 7) % 12);
  guitarShapes = guitarVoicings(chord.rootPc, all, essential);
  voicingIndex = 0;

  const tabs = document.getElementById('voicing-tabs');
  tabs.textContent = '';
  if (!guitarShapes.length) {
    renderFretboard(null);
    document.getElementById('guitar-caption').textContent = ' ';
    return;
  }
  guitarShapes.forEach((v, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'voicing-tab';
    b.setAttribute('role', 'tab');
    b.textContent = voicingLabel(v);
    b.addEventListener('click', () => selectVoicing(i));
    tabs.appendChild(b);
  });
  selectVoicing(0);
}

// Strum the selected guitar shape — its actual fretted pitches, rolled fast
// low-to-high the way a downstroke sounds.
function strum(btn) {
  const v = guitarShapes[voicingIndex];
  if (!v) return;
  const midis = [];
  for (let i = 0; i < 6; i++) {
    if (v.frets[i] >= 0) midis.push(GUITAR_STRINGS[i] + v.frets[i]);
  }
  playMidis(midis, 'arp', btn, 45);
}

// --- circle of fifths ------------------------------------------------------
function buildCircle() {
  const svg = document.getElementById('circle');
  const cx = 180, cy = 180, ringR = 118;
  CIRCLE.forEach((entry, i) => {
    const ang = (-90 + i * 30) * Math.PI / 180;
    const x = cx + ringR * Math.cos(ang);
    const y = cy + ringR * Math.sin(ang);
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'node');
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `${entry.label}${entry.alt ? ' or ' + entry.alt : ''}`);
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 24);
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', x);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'central');
    t.setAttribute('y', entry.alt ? y - 6 : y);
    t.textContent = entry.label;
    g.append(c, t);
    if (entry.alt) {
      const a = document.createElementNS(NS, 'text');
      a.setAttribute('class', 'alt');
      a.setAttribute('x', x); a.setAttribute('y', y + 9);
      a.setAttribute('text-anchor', 'middle');
      a.setAttribute('dominant-baseline', 'central');
      a.textContent = entry.alt;
      g.appendChild(a);
    }
    g.addEventListener('click', () => selectRoot(i));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectRoot(i); }
    });
    svg.appendChild(g);
    entry.el = g;
  });
}

function selectRoot(i) {
  rootIndex = i;
  CIRCLE.forEach((e, j) => e.el.classList.toggle('selected', j === i));
  const t = tonic();
  const name = spellPc(t.letterIdx, t.pc);
  document.getElementById('key-name').innerHTML =
    `tonal centre <strong>${name}</strong> <em>— major and minor</em>`;
  renderPalette();
  renderProgression();
  save();
}

// --- control pills ---------------------------------------------------------
function buildPills() {
  const sizeBox = document.getElementById('size-pills');
  SIZES.forEach(s => {
    const label = document.createElement('label');
    label.className = 'pill' + (size === s.id ? ' on' : '');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'size';
    input.value = s.id;
    input.checked = size === s.id;
    input.addEventListener('change', () => {
      size = s.id;
      [...sizeBox.children].forEach(p => p.classList.toggle('on', p === label));
      renderPalette();
      save();
    });
    label.append(input, document.createTextNode(s.label));
    sizeBox.appendChild(label);
  });

  const groupBox = document.getElementById('group-pills');
  OPTIONAL_GROUPS.forEach(g => {
    const label = document.createElement('label');
    label.className = 'pill' + (shownGroups.has(g.id) ? ' on' : '');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = shownGroups.has(g.id);
    input.addEventListener('change', () => {
      if (input.checked) shownGroups.add(g.id); else shownGroups.delete(g.id);
      label.classList.toggle('on', input.checked);
      renderPalette();
      save();
    });
    label.append(input, document.createTextNode(g.label));
    groupBox.appendChild(label);
  });

  const loop = document.getElementById('prog-loop');
  loop.addEventListener('change', () =>
    document.getElementById('loop-pill').classList.toggle('on', loop.checked));
}

// --- palette ---------------------------------------------------------------
// Entries are compared by what they actually are (degree + quality), so the
// selection survives re-renders and shows up wherever the chord appears.
function sameEntry(a, b) {
  return !!a && !!b && a.ls === b.ls && a.semi === b.semi && a.q === b.q;
}

function renderPalette() {
  const palette = document.getElementById('palette');
  palette.textContent = '';
  paletteGroups().forEach(group => {
    const block = document.createElement('div');
    const title = document.createElement('h2');
    title.className = 'group-title';
    title.append(document.createTextNode(group.label));
    if (group.caption) {
      const cap = document.createElement('span');
      cap.textContent = group.caption;
      title.appendChild(cap);
    }
    const chips = document.createElement('div');
    chips.className = 'chips';
    group.entries.forEach(entry => chips.appendChild(makeChip(entry)));
    block.append(title, chips);
    palette.appendChild(block);
  });
  if (!selected) selectChord(MAJOR_TRIADS[0]);
  else renderDetail();
}

function makeChip(entry) {
  const chord = buildChord(entry);
  const chip = document.createElement('div');
  chip.className = 'chip' + (sameEntry(selected, entry) ? ' selected' : '');
  chip.setAttribute('role', 'button');
  chip.setAttribute('tabindex', '0');
  chip.setAttribute('aria-label', `${chord.symbol}, ${entry.rn}`);

  const rn = document.createElement('div');
  rn.className = 'rn';
  rn.textContent = entry.rn;
  const sym = document.createElement('div');
  sym.className = 'sym';
  sym.textContent = chord.symbol;
  const tones = document.createElement('div');
  tones.className = 'tones';
  tones.textContent = chord.tones.map(t => t.name).join(' ');

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'add';
  add.title = 'add to progression';
  add.setAttribute('aria-label', `add ${chord.symbol} to the progression`);
  add.textContent = '+';
  add.addEventListener('click', e => { e.stopPropagation(); addToProgression(entry); });

  chip.append(rn, sym, tones, add);
  chip.addEventListener('click', () => { selectChord(entry); playChord(entry, 'block', null); });
  chip.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectChord(entry);
      playChord(entry, 'block', null);
    }
  });
  return chip;
}

function selectChord(entry) {
  selected = entry;
  // A degree can appear in more than one palette row, so every chip that is
  // this same chord lights up.
  renderDetail(true);
}

// Re-tag the selected chips by re-rendering just the chip classes.
function markSelectedChips() {
  const groups = paletteGroups();
  const chips = document.querySelectorAll('.chip');
  let i = 0;
  groups.forEach(g => g.entries.forEach(entry => {
    const chip = chips[i++];
    if (chip) chip.classList.toggle('selected', sameEntry(selected, entry));
  }));
}

function renderDetail(marks) {
  if (!selected) return;
  const chord = buildChord(selected);
  document.getElementById('chord-name').textContent = chord.symbol;
  document.getElementById('chord-quality').textContent = `${selected.rn} — ${chord.q.name}`;
  document.getElementById('chord-notes').textContent = chord.tones.map(t => t.name).join(' – ');
  document.getElementById('chord-role').textContent = selected.note || ' ';
  renderGuitar(chord);
  showSelectedOnKeyboard();
  if (marks) markSelectedChips();
}

// --- progression -----------------------------------------------------------
function addToProgression(entry) {
  progression.push({ rn: entry.rn, ls: entry.ls, semi: entry.semi, q: entry.q, note: entry.note });
  renderProgression();
  save();
  const cards = document.getElementById('prog-cards');
  cards.scrollLeft = cards.scrollWidth;
}

function moveChord(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= progression.length) return;
  const [item] = progression.splice(i, 1);
  progression.splice(j, 0, item);
  renderProgression();
  save();
}

function removeChord(i) {
  progression.splice(i, 1);
  renderProgression();
  save();
}

function renderProgression() {
  const cards = document.getElementById('prog-cards');
  cards.textContent = '';
  const play = document.getElementById('prog-play');
  const clear = document.getElementById('prog-clear');
  play.disabled = clear.disabled = progression.length === 0;

  if (!progression.length) {
    const empty = document.createElement('div');
    empty.className = 'prog-empty';
    empty.textContent = 'nothing yet — pick a chord above and add it';
    cards.appendChild(empty);
    document.getElementById('prog-roman').innerHTML = '&nbsp;';
    return;
  }

  progression.forEach((entry, i) => {
    const chord = buildChord(entry);
    const card = document.createElement('div');
    card.className = 'prog-card';
    card.dataset.index = i;
    card.title = 'click to inspect this chord';

    const rn = document.createElement('div');
    rn.className = 'rn';
    rn.textContent = entry.rn;
    const sym = document.createElement('div');
    sym.className = 'sym';
    sym.textContent = chord.symbol;

    const tools = document.createElement('div');
    tools.className = 'card-tools';
    [['‹', -1], ['×', 0], ['›', 1]].forEach(([glyph, delta]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = glyph;
      b.setAttribute('aria-label',
        delta === 0 ? `remove ${chord.symbol}` : `move ${chord.symbol} ${delta < 0 ? 'earlier' : 'later'}`);
      b.addEventListener('click', e => {
        e.stopPropagation();
        if (delta === 0) removeChord(i); else moveChord(i, delta);
      });
      tools.appendChild(b);
    });

    card.append(rn, sym, tools);
    card.addEventListener('click', () => { selectChord(entry); playChord(entry, 'block', null); });
    cards.appendChild(card);
  });

  document.getElementById('prog-roman').textContent =
    progression.map(e => e.rn).join('  –  ') + '     ·     ' +
    progression.map(e => buildChord(e).symbol).join('  –  ');
}

function playProgression(btn) {
  const wasPlaying = activeBtn === btn;
  stopSound();
  if (wasPlaying || !progression.length) return;
  activeBtn = btn;
  btn.textContent = 'stop';
  btn.classList.add('playing');
  const step = parseInt(document.getElementById('pace').value, 10);
  const cards = [...document.querySelectorAll('.prog-card')];

  let prevTop = null;
  const voiced = progression.map(entry => {
    const v = voiceChord(buildChord(entry), prevTop);
    prevTop = v.top;
    return v;
  });

  voiced.forEach((v, i) => timers.push(setTimeout(() => {
    synth.allOff();
    clearHighlights();
    cards.forEach((c, j) => c.classList.toggle('sounding', j === i));
    v.notes.forEach(m => { synth.noteOn(m); highlightKey(m, true); });
  }, i * step)));

  timers.push(setTimeout(() => {
    if (document.getElementById('prog-loop').checked) playProgressionAgain(btn);
    else stopSound();
  }, voiced.length * step));
}

// Looping restarts the same run without the "click again to stop" toggle.
function playProgressionAgain(btn) {
  activeBtn = null;
  playProgression(btn);
}

// --- wiring ----------------------------------------------------------------
document.getElementById('tone').addEventListener('change', e => {
  stopSound();
  synth.setInstrument(e.target.value);
});
document.getElementById('pace').addEventListener('change', stopSound);
document.getElementById('play-block').addEventListener('click', e => playChord(selected, 'block', e.currentTarget));
document.getElementById('play-arp').addEventListener('click', e => playChord(selected, 'arp', e.currentTarget));
document.getElementById('add-chord').addEventListener('click', () => { if (selected) addToProgression(selected); });
document.getElementById('strum').addEventListener('click', e => strum(e.currentTarget));
document.getElementById('prog-play').addEventListener('click', e => playProgression(e.currentTarget));
document.getElementById('prog-clear').addEventListener('click', () => {
  stopSound();
  progression = [];
  renderProgression();
  save();
});

load();
buildCircle();
buildPills();
buildMiniKeyboard();
document.getElementById('prog-loop').checked = false;
selectRoot(rootIndex);
