// Thumb position: a ladder of passages, read in tenor and treble clef.
//
// The hand in thumb position is a frame: the thumb lies across two strings and
// the fingers 1, 2 and 3 fall in a line above it, a whole step, a whole step
// (or a half) and a half step apart. Every passage here is played with that
// frame, first at the half-string harmonics where the thumb finds its spot by
// ear (D and A, written in tenor clef), later a fourth higher, then at the
// three-quarter harmonics an octave up (written in treble). Each passage sounds
// as written and lights up note by note as it goes, so the eye learns where a
// pitch sits on each staff while the hand learns where it sits on the string.
//
// Everything on the page is data at the top of this file. A passage is:
//
//   { id, name, clef, key, meter, targetBpm, position, about, measures }
//
// `position` maps a pitch to the finger that plays it in that passage, so the
// fingerings don't have to be typed for every note — a note can still carry
// its own, which wins. `measures` is a list of bars, each a list of events,
// numbered from 1 in order; a bar may be `{ clef, events }` to change clef.
//
// Durations are written as strings, as on the rhythm page: '1' whole, '2'
// half, '4' quarter, '8' eighth, '16', with '.' for a dot. Internally they
// count in TICKS, 24 to the quarter. checkPassages() refuses to let a bar that
// doesn't add up to its meter pass silently — it says so on the page.
//
// The engraving is drawn here, with Bravura, rather than by LilyPond (as the
// song scores are) because every note has to be a live element: the one
// sounding lights up, a click on one sounds it, and the same notes have to be
// re-drawn in whichever clef is asked for.

const TICKS_PER_QUARTER = 24;
const BASE_TICKS = { '1': 96, '2': 48, '4': 24, '8': 12, '16': 6, '32': 3 };

// Anything the data gets wrong, collected rather than thrown: a bad pitch
// should show up as a message on the page, not as a blank page.
const PROBLEMS = [];

function parseDur(token) {
  const m = /^(1|2|4|8|16|32)(\.*)$/.exec(String(token));
  if (!m) {
    PROBLEMS.push('bad duration "' + token + '"');
    return { base: '4', dots: 0, ticks: TICKS_PER_QUARTER };
  }
  const [, base, dots] = m;
  let ticks = BASE_TICKS[base];
  let add = ticks;
  for (let i = 0; i < dots.length; i++) { add /= 2; ticks += add; }
  return { base, dots: dots.length, ticks };
}

// "C#4" → { letter, acc, octave, diatonic, midi, name }. `diatonic` counts
// letters from C0 (C4 = 28), which is what a staff position is made of; `midi`
// is what sounds. The name keeps the octave: a tenor-clef note misread by a
// third is the usual mistake, and the octave is what tells the two apart.
const LETTERS = 'CDEFGAB';
const SEMIS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function parsePitch(text) {
  const m = /^([A-G])([#b]?)(\d)$/.exec(String(text));
  if (!m) {
    PROBLEMS.push('bad pitch "' + text + '"');
    return parsePitch('C4');
  }
  const letter = m[1];
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const octave = Number(m[3]);
  return {
    letter, acc, octave,
    diatonic: octave * 7 + LETTERS.indexOf(letter),
    midi: SEMIS[letter] + acc + (octave + 1) * 12,
    name: letter + (acc > 0 ? '♯' : acc < 0 ? '♭' : '') + octave,
    text,
  };
}

// Event builders. A finger is 'T' (the thumb), '0' (open string) or '1'–'4';
// left off, it comes from the passage's position map. `harm` marks a note
// that sits on a natural harmonic (shown as a small circle); left off, a thumb
// note gets it when the position says the thumb is on one.
const n = (pitch, dur, finger, harm) => Object.assign(parseDur(dur), { sound: true, pitch: parsePitch(pitch), finger: finger != null ? String(finger) : null, harm: harm != null ? !!harm : null });
const r = (dur) => Object.assign(parseDur(dur), { sound: false });
const w = (p, f) => n(p, '1', f);
const h = (p, f) => n(p, '2', f);
const q = (p, f) => n(p, '4', f);
const qd = (p, f) => n(p, '4.', f);
const e = (p, f) => n(p, '8', f);
const clefTo = (clef, events) => ({ clef, events });

// --- the hand ----------------------------------------------------------------
// Three places the thumb goes. The pattern is the same in each: thumb, then
// 1, 2, 3 a whole step, a whole (or half) step and a half step up, on both
// strings at once.

// A position is the finger for each pitch, and which of the thumb's notes sit
// on a natural harmonic — those get a circle over them.

// The thumb at the half-string harmonics: D on the D string, A on the A. The
// first thumb position everyone learns, because the harmonic tells the thumb
// where it is.
const AT_HALF = {
  fingers: {
    D3: 'T', E3: '1', F3: '2', 'F#3': '2', G3: '3',
    A3: 'T', B3: '1', C4: '2', 'C#4': '2', D4: '3',
    A2: '0', D2: '0',
  },
  harmonics: ['D3', 'A3'],
};
// The thumb a fourth above the harmonics: G on the D string, D on the A — no
// harmonic under it; the hand has to know where it is.
const AT_FOURTH = {
  fingers: {
    G3: 'T', A3: '1', B3: '2', C4: '3',
    D4: 'T', E4: '1', F4: '2', 'F#4': '2', G4: '3',
  },
  harmonics: [],
};
// The thumb at the three-quarter harmonics, an octave above the first: the same
// notes as AT_HALF, an octave up, with the fingers closer together.
const AT_QUARTER = {
  fingers: {
    D4: 'T', E4: '1', F4: '2', 'F#4': '2', G4: '3',
    A4: 'T', B4: '1', C5: '2', 'C#5': '2', D5: '3',
    A3: '0',
  },
  harmonics: ['D4', 'A4'],
};

// --- the passages ------------------------------------------------------------
// In the order they're meant to be taken: the ones further down the list ask
// more of the thumb, the ear, or the eye.

const PASSAGES = [
  {
    id: 'harmonics',
    name: '1 · the harmonics',
    clef: 'tenor', key: 'D', meter: [4, 4], targetBpm: 72, position: AT_HALF,
    about: 'Lay the thumb flat across the D and A strings at the middle of the string, where the octave harmonics ring: D and A. Nothing else moves. Find the spot, hear it, and keep the thumb there for the whole passage.',
    measures: [
      [w('D3')], [w('A3')], [h('D3'), h('A3')], [h('A3'), h('D3')], [h('D3'), h('A3')], [w('D3')],
    ],
  },
  {
    id: 'three-fingers',
    name: '2 · three fingers on the A string',
    clef: 'tenor', key: 'D', meter: [4, 4], targetBpm: 80, position: AT_HALF,
    about: 'The thumb stays on the harmonic A and the fingers fall above it: 1 a whole step up on B, 2 another whole step on C♯, 3 a half step on D. The thumb keeps its weight on the string even while a finger plays — that is the endurance being built.',
    measures: [
      [q('A3'), q('B3'), q('C#4'), q('D4')],
      [q('D4'), q('C#4'), q('B3'), q('A3')],
      [q('A3'), q('C#4'), q('B3'), q('D4')],
      [q('C#4'), q('B3'), h('A3')],
      [q('A3'), q('B3'), q('A3'), q('C#4')],
      [q('A3'), q('D4'), q('A3'), q('C#4')],
      [q('B3'), q('D4'), q('C#4'), q('B3')],
      [w('A3')],
    ],
  },
  {
    id: 'd-major',
    name: '3 · D major, one octave',
    clef: 'tenor', key: 'D', meter: [4, 4], targetBpm: 84, position: AT_HALF,
    about: 'The same frame on both strings: thumb, 1, 2, 3 on the D string, then thumb, 1, 2, 3 on the A. One octave of D major without the hand moving at all. Listen for the octave between the two thumb notes.',
    measures: [
      [q('D3'), q('E3'), q('F#3'), q('G3')],
      [q('A3'), q('B3'), q('C#4'), q('D4')],
      [q('D4'), q('C#4'), q('B3'), q('A3')],
      [q('G3'), q('F#3'), q('E3'), q('D3')],
    ],
  },
  {
    id: 'mary',
    name: '4 · mary had a little lamb',
    clef: 'tenor', key: 'D', meter: [4, 4], targetBpm: 96, position: AT_HALF,
    about: 'A tune on the D string with one visit to the thumb on A. Read it off the staff: the tenor clef puts middle C on the fourth line, so D, E and F♯ sit on the first line, the first space and the second line.',
    measures: [
      [q('F#3'), q('E3'), q('D3'), q('E3')],
      [q('F#3'), q('F#3'), h('F#3')],
      [q('E3'), q('E3'), h('E3')],
      [q('F#3'), q('A3'), h('A3')],
      [q('F#3'), q('E3'), q('D3'), q('E3')],
      [q('F#3'), q('F#3'), q('F#3'), q('F#3')],
      [q('E3'), q('E3'), q('F#3'), q('E3')],
      [w('D3')],
    ],
  },
  {
    id: 'twinkle',
    name: '5 · twinkle',
    clef: 'tenor', key: 'D', meter: [4, 4], targetBpm: 100, position: AT_HALF,
    about: 'Both strings now, and the first real string crossings under the thumb: D to A is thumb to thumb, G to F♯ is 3 to 2 on the D string. Keep the thumb down across both strings through the crossings.',
    measures: [
      [q('D3'), q('D3'), q('A3'), q('A3')],
      [q('B3'), q('B3'), h('A3')],
      [q('G3'), q('G3'), q('F#3'), q('F#3')],
      [q('E3'), q('E3'), h('D3')],
      [q('A3'), q('A3'), q('G3'), q('G3')],
      [q('F#3'), q('F#3'), h('E3')],
      [q('A3'), q('A3'), q('G3'), q('G3')],
      [q('F#3'), q('F#3'), h('E3')],
      [q('D3'), q('D3'), q('A3'), q('A3')],
      [q('B3'), q('B3'), h('A3')],
      [q('G3'), q('G3'), q('F#3'), q('F#3')],
      [q('E3'), q('E3'), h('D3')],
    ],
  },
  {
    id: 'ode',
    name: '6 · ode to joy',
    clef: 'tenor', key: 'D', meter: [4, 4], targetBpm: 100, position: AT_HALF,
    about: 'Beethoven\'s tune in D, all of it under the one hand. The middle section has eighths and the open A string below the staff; the dotted quarter at the end of each phrase is where a steady thumb shows.',
    measures: [
      [q('F#3'), q('F#3'), q('G3'), q('A3')],
      [q('A3'), q('G3'), q('F#3'), q('E3')],
      [q('D3'), q('D3'), q('E3'), q('F#3')],
      [qd('F#3'), e('E3'), h('E3')],
      [q('F#3'), q('F#3'), q('G3'), q('A3')],
      [q('A3'), q('G3'), q('F#3'), q('E3')],
      [q('D3'), q('D3'), q('E3'), q('F#3')],
      [qd('E3'), e('D3'), h('D3')],
      [q('E3'), q('E3'), q('F#3'), q('D3')],
      [q('E3'), e('F#3'), e('G3'), q('F#3'), q('D3')],
      [q('E3'), e('F#3'), e('G3'), q('F#3'), q('E3')],
      [q('D3'), q('E3'), h('A2')],
      [q('F#3'), q('F#3'), q('G3'), q('A3')],
      [q('A3'), q('G3'), q('F#3'), q('E3')],
      [q('D3'), q('D3'), q('E3'), q('F#3')],
      [qd('E3'), e('D3'), h('D3')],
    ],
  },
  {
    id: 'frere',
    name: '7 · frère jacques',
    clef: 'tenor', key: 'D', meter: [4, 4], targetBpm: 104, position: AT_HALF,
    about: 'Eighths across the two strings, and the open A at the end, a ledger line below the staff. The round is a good one to loop: by the third pass the thumb has been down for a while.',
    measures: [
      [q('D3'), q('E3'), q('F#3'), q('D3')],
      [q('D3'), q('E3'), q('F#3'), q('D3')],
      [q('F#3'), q('G3'), h('A3')],
      [q('F#3'), q('G3'), h('A3')],
      [e('A3'), e('B3'), e('A3'), e('G3'), q('F#3'), q('D3')],
      [e('A3'), e('B3'), e('A3'), e('G3'), q('F#3'), q('D3')],
      [q('D3'), q('A2'), h('D3')],
      [q('D3'), q('A2'), h('D3')],
    ],
  },
  {
    id: 'g-major',
    name: '8 · the low second finger',
    clef: 'tenor', key: 'G', meter: [4, 4], targetBpm: 84, position: AT_HALF,
    about: 'G major from the same thumb position. On the A string the 2nd finger now sits a half step above the 1st (C natural, not C♯) while on the D string it stays a whole step up (F♯). One sharp in the signature instead of two: read the key before the notes.',
    measures: [
      [q('D3'), q('E3'), q('F#3'), q('G3')],
      [q('A3'), q('B3'), q('C4'), q('D4')],
      [q('D4'), q('C4'), q('B3'), q('A3')],
      [q('G3'), q('F#3'), q('E3'), q('D3')],
      [q('A3'), q('B3'), q('C4'), q('B3')],
      [q('A3'), q('C4'), q('B3'), q('A3')],
      [q('A3'), q('B3'), q('C4'), q('D4')],
      [q('C4'), q('B3'), h('A3')],
    ],
  },
  {
    id: 'ode-g',
    name: '9 · ode to joy in G',
    clef: 'tenor', key: 'G', meter: [4, 4], targetBpm: 100, position: AT_HALF,
    about: 'The tune again, a fourth higher, so the whole of it sits on the A string under the thumb with the low 2. The notes on the page have moved; the hand hasn\'t.',
    measures: [
      [q('B3'), q('B3'), q('C4'), q('D4')],
      [q('D4'), q('C4'), q('B3'), q('A3')],
      [q('G3'), q('G3'), q('A3'), q('B3')],
      [qd('B3'), e('A3'), h('A3')],
      [q('B3'), q('B3'), q('C4'), q('D4')],
      [q('D4'), q('C4'), q('B3'), q('A3')],
      [q('G3'), q('G3'), q('A3'), q('B3')],
      [qd('A3'), e('G3'), h('G3')],
    ],
  },
  {
    id: 'thirds',
    name: '10 · D major in broken thirds',
    clef: 'tenor', key: 'D', meter: [4, 4], targetBpm: 76, position: AT_HALF,
    about: 'Thirds are where thumb-position intonation is won or lost: thumb to 2 is a major third on each string, and the crossing pairs (G to B, 3 on D to 1 on A) have to match them. Put the drone on D and tune every third to it.',
    measures: [
      [q('D3'), q('F#3'), q('E3'), q('G3')],
      [q('F#3'), q('A3'), q('G3'), q('B3')],
      [q('A3'), q('C#4'), q('B3'), q('D4')],
      [w('D4')],
      [q('D4'), q('B3'), q('C#4'), q('A3')],
      [q('B3'), q('G3'), q('A3'), q('F#3')],
      [q('G3'), q('E3'), q('F#3'), q('D3')],
      [w('D3')],
    ],
  },
  {
    id: 'arpeggios',
    name: '11 · arpeggios across the strings',
    clef: 'tenor', key: 'D', meter: [4, 4], targetBpm: 72, position: AT_HALF,
    about: 'D and G arpeggios in eighths, crossing between the strings on every other note, with the open A below. The bow does the crossing; the thumb stays flat across both strings so the crossing never asks the hand to move.',
    measures: [
      [e('D3'), e('F#3'), e('A3'), e('D4'), e('A3'), e('F#3'), q('D3')],
      [e('D3'), e('G3'), e('B3'), e('D4'), e('B3'), e('G3'), q('D3')],
      [e('D3'), e('F#3'), e('A3'), e('D4'), e('A3'), e('F#3'), q('D3')],
      [e('A2'), e('D3'), e('F#3'), e('A3'), e('F#3'), e('D3'), q('A2')],
    ],
  },
  {
    id: 'g-fourth',
    name: '12 · thumb on G and D',
    clef: 'tenor', key: 'G', meter: [4, 4], targetBpm: 84, position: AT_FOURTH,
    about: 'The thumb leaves the harmonic for the first time: a fourth higher, on G and D, with no harmonic to find it by. The fingers keep their shape. G major from G to G, with the top G on a ledger line above the tenor staff.',
    measures: [
      [q('G3'), q('A3'), q('B3'), q('C4')],
      [q('D4'), q('E4'), q('F#4'), q('G4')],
      [q('G4'), q('F#4'), q('E4'), q('D4')],
      [q('C4'), q('B3'), q('A3'), q('G3')],
      [q('G3'), q('B3'), q('D4'), q('G4')],
      [q('G4'), q('D4'), q('B3'), q('G3')],
      [e('G3'), e('A3'), e('B3'), e('C4'), e('D4'), e('E4'), e('F#4'), e('G4')],
      [e('G4'), e('F#4'), e('E4'), e('D4'), e('C4'), e('B3'), e('A3'), e('G3')],
    ],
  },
  {
    id: 'high-harmonics',
    name: '13 · the high harmonics',
    clef: 'treble', key: 'D', meter: [4, 4], targetBpm: 72, position: AT_QUARTER,
    about: 'An octave above the first passage: the thumb at the three-quarter harmonics, D and A, an octave above the ones it started on. Written in treble clef now — D sits just under the staff, A in the second space.',
    measures: [
      [w('D4')], [w('A4')], [h('D4'), h('A4')], [h('A4'), h('D4')], [h('D4'), h('A4')], [w('D4')],
    ],
  },
  {
    id: 'd-major-high',
    name: '14 · D major, an octave up',
    clef: 'treble', key: 'D', meter: [4, 4], targetBpm: 84, position: AT_QUARTER,
    about: 'The one-octave scale again, from the high harmonics. The frame is the same, but the fingers sit closer together up here, and the ear has to hear the smaller steps.',
    measures: [
      [q('D4'), q('E4'), q('F#4'), q('G4')],
      [q('A4'), q('B4'), q('C#5'), q('D5')],
      [q('D5'), q('C#5'), q('B4'), q('A4')],
      [q('G4'), q('F#4'), q('E4'), q('D4')],
    ],
  },
  {
    id: 'twinkle-high',
    name: '15 · twinkle, an octave up',
    clef: 'treble', key: 'D', meter: [4, 4], targetBpm: 100, position: AT_QUARTER,
    about: 'The tune from passage 5, an octave higher and in treble clef. Same fingers, same crossings; only the staff has changed.',
    measures: [
      [q('D4'), q('D4'), q('A4'), q('A4')],
      [q('B4'), q('B4'), h('A4')],
      [q('G4'), q('G4'), q('F#4'), q('F#4')],
      [q('E4'), q('E4'), h('D4')],
      [q('A4'), q('A4'), q('G4'), q('G4')],
      [q('F#4'), q('F#4'), h('E4')],
      [q('A4'), q('A4'), q('G4'), q('G4')],
      [q('F#4'), q('F#4'), h('E4')],
      [q('D4'), q('D4'), q('A4'), q('A4')],
      [q('B4'), q('B4'), h('A4')],
      [q('G4'), q('G4'), q('F#4'), q('F#4')],
      [q('E4'), q('E4'), h('D4')],
    ],
  },
  {
    id: 'ode-high',
    name: '16 · ode to joy, an octave up',
    clef: 'treble', key: 'D', meter: [4, 4], targetBpm: 100, position: AT_QUARTER,
    about: 'The first half of the tune from the high harmonics. F♯ sits on the bottom space of the treble staff and the thumb\'s A in the second: the whole phrase lives in the lower half of the staff.',
    measures: [
      [q('F#4'), q('F#4'), q('G4'), q('A4')],
      [q('A4'), q('G4'), q('F#4'), q('E4')],
      [q('D4'), q('D4'), q('E4'), q('F#4')],
      [qd('F#4'), e('E4'), h('E4')],
      [q('F#4'), q('F#4'), q('G4'), q('A4')],
      [q('A4'), q('G4'), q('F#4'), q('E4')],
      [q('D4'), q('D4'), q('E4'), q('F#4')],
      [qd('E4'), e('D4'), h('D4')],
    ],
  },
  {
    id: 'thirds-high',
    name: '17 · broken thirds, an octave up',
    clef: 'treble', key: 'D', meter: [4, 4], targetBpm: 76, position: AT_QUARTER,
    about: 'The thirds from passage 10 at the high harmonics. Up here a third is a small distance for the hand and a large one for the ear: tune each one to the drone before moving on.',
    measures: [
      [q('D4'), q('F#4'), q('E4'), q('G4')],
      [q('F#4'), q('A4'), q('G4'), q('B4')],
      [q('A4'), q('C#5'), q('B4'), q('D5')],
      [w('D5')],
      [q('D5'), q('B4'), q('C#5'), q('A4')],
      [q('B4'), q('G4'), q('A4'), q('F#4')],
      [q('G4'), q('E4'), q('F#4'), q('D4')],
      [w('D4')],
    ],
  },
  {
    id: 'two-octaves',
    name: '18 · two octaves, D to D',
    clef: 'tenor', key: 'D', meter: [4, 4], targetBpm: 80, position: AT_HALF,
    about: 'Both thumb positions in one line, and both clefs. Up the D and A strings from the half-string harmonic, then the thumb slides up to D and on to the high harmonic A, each time with the 3rd finger holding the note it just played; and back down the same way. The clef changes where the music goes above the tenor staff.',
    measures: [
      [q('D3', 'T'), q('E3', '1'), q('F#3', '2'), q('G3', '3')],
      [q('A3', 'T'), q('B3', '1'), q('C#4', '2'), q('D4', '3')],
      clefTo('treble', [q('E4', '1'), q('F#4', '2'), q('G4', '3'), q('A4', 'T', true)]),
      [q('B4', '1'), q('C#5', '2'), h('D5', '3')],
      [q('D5', '3'), q('C#5', '2'), q('B4', '1'), q('A4', 'T', true)],
      [q('G4', '3'), q('F#4', '2'), q('E4', '1'), q('D4', 'T')],
      clefTo('tenor', [q('C#4', '2'), q('B3', '1'), q('A3', 'T'), q('G3', '3')]),
      [q('F#3', '2'), q('E3', '1'), h('D3', 'T')],
    ],
  },
];

// Bars are numbered from 1 in the order written, and a bare list of events is
// a bar with no clef change.
PASSAGES.forEach(p => {
  p.measures = p.measures.map((m, i) => {
    const bar = Array.isArray(m) ? { events: m } : Object.assign({}, m);
    bar.n = i + 1;
    bar.events.forEach(ev => {
      if (!ev.sound) return;
      if (ev.finger == null) ev.finger = p.position.fingers[ev.pitch.text] != null ? p.position.fingers[ev.pitch.text] : '';
      if (ev.harm == null) ev.harm = ev.finger === 'T' && p.position.harmonics.includes(ev.pitch.text);
    });
    return bar;
  });
});

// --- what is selected --------------------------------------------------------

const PREFS_KEY = 'thumb:v1';

let passageIdx = 0;
let fromIdx = 0;
let toIdx = 0;
let tempoBpm = 60;
let clefMode = 'auto';      // 'auto' (as written), or 'tenor' / 'treble' / 'bass'
let fingeringsOn = true;
let harmonicsOn = true;      // the circles over thumb notes that sit on a harmonic
let metronomeOn = true;
let countIn = true;
let loopOn = true;
const tempos = {};          // passage id → the speed it was last practised at

let playing = false;
let loopTimerId = null;
let passTimers = [];        // pending highlight callbacks, cleared on stop
let passCount = 0;
let runStartedAt = 0;
let runTimerId = null;

const passage = () => PASSAGES[passageIdx];
const measures = () => passage().measures || [];
const selected = () => measures().slice(fromIdx, toIdx + 1);

function beatTicks(p) { return Math.round(96 / p.meter[1]); }
function measureTicks(p) { return p.meter[0] * beatTicks(p); }
function beatsPerMeasure(p) { return p.meter[0]; }

// A bar that doesn't add up to its meter would play, and engrave, as something
// nobody wrote. Report it instead.
function checkPassages() {
  const out = PROBLEMS.slice();
  PASSAGES.forEach(p => {
    const want = measureTicks(p);
    (p.measures || []).forEach(m => {
      const got = m.events.reduce((sum, ev) => sum + ev.ticks, 0);
      if (got !== want) out.push(`${p.name} m.${m.n}: ${got}/${want} ticks — the bar doesn't add up`);
    });
  });
  return out;
}

// The clef each bar is read in: the one asked for, or — as written — the last
// change at or before it, which may sit in a bar outside the selection.
function clefOfBar(barIndex) {
  if (clefMode !== 'auto') return clefMode;
  const list = measures();
  let clef = passage().clef;
  for (let i = 0; i <= barIndex && i < list.length; i++) if (list[i].clef) clef = list[i].clef;
  return clef;
}

// Every event of the selection, with its tick offset from the first downbeat.
function selectedEvents() {
  const p = passage();
  const barTicks = measureTicks(p);
  const out = [];
  selected().forEach((m, mi) => {
    let at = 0;
    m.events.forEach(ev => {
      out.push(Object.assign({}, ev, { at: mi * barTicks + at, within: at, bar: m.n, barIdx: fromIdx + mi, index: out.length }));
      at += ev.ticks;
    });
  });
  return out;
}

// --- engraving ---------------------------------------------------------------
// Coordinates inside a system put the top staff line at y = 0 and count down;
// a staff position p (0 = bottom line, 8 = top line, one per line or space)
// is y = 4 SP − p SP/2. Each system is translated into place once its own
// height — ledger lines, stems, fingerings — is known.

const SP = 10;                    // one staff space — the unit of the drawing
const GLYPH = 4 * SP;             // Bravura's em box is four staff spaces tall
const HEAD_W = 1.18 * SP;         // black and half noteheads
const WHOLE_W = 1.69 * SP;
const STEM_H = 3.5 * SP;
const STEM_W = 0.13 * SP;
const BEAM_H = 0.5 * SP;
const BEAM_PITCH = 0.75 * SP;     // beam thickness plus the gap under it
const BAR_PAD = 1.2 * SP;         // after a barline, before the first note
const BAR_TAIL = 0.9 * SP;        // after the last note, before the next barline
const CLEF_W = 3.6 * SP;          // the clef's column at the start of a system
const KEY_STEP = 1.05 * SP;       // one accidental of the key signature
const TIME_W = 2.9 * SP;          // the time signature's column
const CHANGE_W = 2.6 * SP;        // a mid-line clef change, before a barline
const ACC_LEAD = 1.35 * SP;       // room for an accidental before a notehead
const FING_LINE = -2.6 * SP;      // baseline of the fingerings over the staff
const SYSTEM_GAP = 1.6 * SP;      // air between systems
const PX_PER_UNIT_WIDE = 0.86;    // how big a staff space wants to be, in px
const PX_PER_UNIT_NARROW = 0.62;  // on a phone, smaller: two bars of quarters a line

const G = {
  headBlack: '', headHalf: '', headWhole: '',
  flagUp: { 1: '', 2: '', 3: '' },
  flagDown: { 1: '', 2: '', 3: '' },
  rest: { '1': '', '2': '', '4': '', '8': '', '16': '', '32': '' },
  dot: '',
  digits: ['', '', '', '', '', '', '', '', '', ''],
  sharp: '', flat: '', natural: '',
  thumb: '',
  harmonic: '',
  fingers: { '0': '', '1': '', '2': '', '3': '', '4': '' },
  quarterNote: '',
};
const FLAGS = { '1': 0, '2': 0, '4': 0, '8': 1, '16': 2, '32': 3 };
const REST_W = { '1': 1.13 * SP, '2': 1.13 * SP, '4': 1.08 * SP, '8': 1.0 * SP, '16': 1.28 * SP, '32': 1.4 * SP };

// Where each clef puts things. `bottom` is the diatonic index of the bottom
// line; `at` the position the clef glyph's own line sits on; `sharps` and
// `flats` the positions the key signature's accidentals go, in order.
const CLEFS = {
  treble: { glyph: '', change: '', at: 2, bottom: 30, sharps: [8, 5, 9, 6, 3, 7, 4], flats: [4, 7, 3, 6, 2, 5, 1], label: 'treble' },
  tenor:  { glyph: '', change: '', at: 6, bottom: 22, sharps: [2, 6, 3, 7, 4, 8, 5], flats: [5, 8, 4, 7, 3, 6, 2], label: 'tenor' },
  bass:   { glyph: '', change: '', at: 6, bottom: 18, sharps: [6, 3, 7, 4, 1, 5, 2], flats: [2, 5, 1, 4, 0, 3, 6], label: 'bass' },
};
const SHARP_ORDER = 'FCGDAEB';
const FLAT_ORDER = 'BEADGCF';
const KEYS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6 };

// letter → the accidental the key signature gives it
function keyAccidentals(key) {
  const count = KEYS[key] || 0;
  const map = {};
  for (let i = 0; i < Math.abs(count); i++) map[(count > 0 ? SHARP_ORDER : FLAT_ORDER)[i]] = count > 0 ? 1 : -1;
  return map;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const num = (v) => Math.round(v * 100) / 100;
const yOfPos = (pos) => 4 * SP - pos * SP / 2;

function glyph(cls, x, y, ch, anchor, size) {
  return `<text class="${cls}" x="${num(x)}" y="${num(y)}"` +
         (anchor ? ` text-anchor="${anchor}"` : '') +
         (size ? ` font-size="${num(size)}"` : '') + `>${esc(ch)}</text>`;
}

// How much room a note or rest takes, by length. Not proportional to time —
// a whole note doesn't get sixteen times a sixteenth's room — but graded the
// way engraved music is, so a bar of quarters and a bar of eighths both read.
function roomFor(ticks) { return 1.95 * SP * Math.pow(ticks / 6, 0.55); }

// Consecutive flagged notes inside one beat are beamed together; a rest, a
// beat line or an unflagged value ends the group. A group of one keeps its flag.
function beamGroups(events, beat) {
  const groups = [];
  let cur = [];
  const flush = () => { if (cur.length > 1) groups.push(cur); cur = []; };
  events.forEach(ev => {
    const flags = FLAGS[ev.base];
    const sameBeat = cur.length && Math.floor(cur[0].within / beat) === Math.floor(ev.within / beat);
    if (!ev.sound || !flags) { flush(); return; }
    if (cur.length && !sameBeat) flush();
    cur.push(ev);
  });
  flush();
  return groups;
}

function pxPerUnit() {
  return (window.innerWidth || 800) < 560 ? PX_PER_UNIT_NARROW : PX_PER_UNIT_WIDE;
}

function engrave() {
  const host = document.getElementById('score');
  if (!host) return;
  const p = passage();
  const list = selected();
  if (!list.length) { host.innerHTML = ''; return; }

  const keyAcc = keyAccidentals(p.key);
  const keyCount = Math.abs(KEYS[p.key] || 0);
  const beat = beatTicks(p);
  const px = host.clientWidth || 600;
  const W = px / pxPerUnit();
  const keyW = keyCount ? keyCount * KEY_STEP + 0.6 * SP : 0;
  const prefixW = (first) => CLEF_W + keyW + (first ? TIME_W : 0) + 0.4 * SP;

  // Lay each bar out at its natural width first: the clef it's read in, which
  // notes need an accidental (one that differs from the key, or from the one
  // the bar has already shown for that note), and a slot per event.
  const events = selectedEvents();
  const bars = list.map((m, mi) => {
    const clef = clefOfBar(fromIdx + mi);
    const next = mi + 1 < list.length ? clefOfBar(fromIdx + mi + 1) : clef;
    const seen = {};
    const mine = events.filter(ev => ev.barIdx === fromIdx + mi).map(ev => {
      const out = Object.assign({}, ev, { clef });
      if (ev.sound) {
        const key = ev.pitch.letter + ev.pitch.octave;
        const shown = seen[key] != null ? seen[key] : (keyAcc[ev.pitch.letter] || 0);
        out.accidental = ev.pitch.acc !== shown ? ev.pitch.acc : null;
        seen[key] = ev.pitch.acc;
        out.pos = ev.pitch.diatonic - CLEFS[clef].bottom;
      }
      out.lead = out.accidental != null ? ACC_LEAD : 0.3 * SP;
      out.room = roomFor(ev.ticks);
      return out;
    });
    const change = next !== clef ? next : null;
    const natural = BAR_PAD + mine.reduce((s, ev) => s + ev.lead + ev.room, 0) + BAR_TAIL + (change ? CHANGE_W : 0);
    return { m, mi, clef, change, events: mine, natural: Math.max(natural, 7 * SP) };
  });

  // Pack bars into systems: as many as fit at natural width, then stretched to
  // fill the line. The last system stays loose if it's less than half full.
  const systems = [];
  let cur = null;
  bars.forEach(b => {
    const avail = W - prefixW(systems.length === 0);
    if (!cur || (cur.bars.length && cur.natural + b.natural > avail)) {
      cur = { bars: [], natural: 0 };
      systems.push(cur);
    }
    cur.bars.push(b);
    cur.natural += b.natural;
  });

  const parts = [];
  let yCursor = 0;
  let evCount = 0;
  const problems = [];

  systems.forEach((sys, si) => {
    const first = si === 0;
    const x0 = prefixW(first);
    const avail = W - x0;
    const last = si === systems.length - 1;
    const f = (last && sys.natural < 0.5 * avail) ? 1 : avail / sys.natural;
    const sysW = x0 + f * sys.natural;
    const bits = [];
    let top = FING_LINE - 2.4 * SP;           // the system's extent above the staff
    let bottom = 4 * SP + 1.8 * SP;            // and below
    const reach = (yAbove, yBelow) => { if (yAbove != null) top = Math.min(top, yAbove); if (yBelow != null) bottom = Math.max(bottom, yBelow); };

    for (let k = 0; k < 5; k++) {
      bits.push(`<line class="staff" x1="0" y1="${num(k * SP)}" x2="${num(sysW)}" y2="${num(k * SP)}"/>`);
    }

    // The clef and key the system opens in, and on the first line the meter.
    const clef0 = CLEFS[sys.bars[0].clef];
    bits.push(glyph('gl clef', 0.5 * SP, yOfPos(clef0.at), clef0.glyph));
    const keyPos = (KEYS[p.key] || 0) > 0 ? clef0.sharps : clef0.flats;
    for (let i = 0; i < keyCount; i++) {
      bits.push(glyph('gl', CLEF_W + i * KEY_STEP, yOfPos(keyPos[i]), (KEYS[p.key] || 0) > 0 ? G.sharp : G.flat));
    }
    if (first) {
      const tx = CLEF_W + keyW + TIME_W / 2 - 0.2 * SP;
      bits.push(glyph('sig', tx, yOfPos(6), G.digits[p.meter[0]] || '', 'middle'));
      bits.push(glyph('sig', tx, yOfPos(2), G.digits[p.meter[1]] || '', 'middle'));
    }

    let bx = x0;
    sys.bars.forEach((b, bi) => {
      const bw = f * b.natural;
      const mx = bx;
      bx += bw;
      // Bar number, at the top left of the bar. Every bar carries one so the
      // range pickers below have something to point at.
      bits.push(`<text class="bar-no" x="${num(mx + 0.25 * SP)}" y="${num(FING_LINE - 1.5 * SP)}">${b.m.n}</text>`);

      // Place the events: cumulative slots, scaled with the bar.
      let cx = mx + f * BAR_PAD;
      b.events.forEach(ev => {
        cx += f * ev.lead;
        ev.x = cx;
        cx += f * ev.room;
      });
      // A whole-bar rest sits in the middle of its bar.
      if (b.events.length === 1 && !b.events[0].sound) b.events[0].x = mx + bw / 2 - REST_W['1'] / 2;

      // Stem directions: a note alone goes by its position (middle line and
      // above: down); a beamed group goes by its average.
      const beamed = new Map();
      beamGroups(b.events, beat).forEach(g => {
        const avg = g.reduce((s, ev) => s + ev.pos, 0) / g.length;
        const up = avg < 4;
        g.forEach(ev => beamed.set(ev, { group: g, up }));
      });

      b.events.forEach(ev => {
        const cls = 'ev ' + (ev.sound ? 'note' : 'rest');
        const inner = [];
        let right = ev.x;
        let headTop = null, headBottom = null;
        if (ev.sound) {
          const y = yOfPos(ev.pos);
          const whole = ev.base === '1';
          const head = whole ? G.headWhole : ev.base === '2' ? G.headHalf : G.headBlack;
          const headW = whole ? WHOLE_W : HEAD_W;
          // Ledger lines, through the notehead and a little past it.
          for (let lp = -2; lp >= ev.pos; lp -= 2) inner.push(`<line class="ledger" x1="${num(ev.x - 0.4 * SP)}" y1="${num(yOfPos(lp))}" x2="${num(ev.x + headW + 0.4 * SP)}" y2="${num(yOfPos(lp))}"/>`);
          for (let lp = 10; lp <= ev.pos; lp += 2) inner.push(`<line class="ledger" x1="${num(ev.x - 0.4 * SP)}" y1="${num(yOfPos(lp))}" x2="${num(ev.x + headW + 0.4 * SP)}" y2="${num(yOfPos(lp))}"/>`);
          if (ev.accidental != null) {
            const acc = ev.accidental > 0 ? G.sharp : ev.accidental < 0 ? G.flat : G.natural;
            inner.push(glyph('gl acc', ev.x - 1.15 * SP, y, acc));
          }
          inner.push(glyph('gl', ev.x, y, head));
          right = ev.x + headW;
          headTop = y - 0.5 * SP;
          headBottom = y + 0.5 * SP;
          ev.stemUp = beamed.has(ev) ? beamed.get(ev).up : ev.pos < 4;
          ev.headW = headW;
          ev.y = y;
          if (!whole) {
            const sx = ev.stemUp ? ev.x + headW - STEM_W / 2 : ev.x + STEM_W / 2;
            ev.stemX = sx;
            let tip = ev.stemUp ? y - STEM_H : y + STEM_H;
            // A stem on a note far outside the staff reaches to the middle line.
            if (ev.stemUp && ev.pos < -4) tip = Math.min(tip, yOfPos(4));
            if (!ev.stemUp && ev.pos > 12) tip = Math.max(tip, yOfPos(4));
            ev.stemTip = tip;
            if (!beamed.has(ev)) {
              inner.push(`<line class="stem" x1="${num(sx)}" y1="${num(y)}" x2="${num(sx)}" y2="${num(tip)}"/>`);
              const flags = FLAGS[ev.base];
              if (flags) inner.push(glyph('gl', sx - STEM_W / 2, tip, (ev.stemUp ? G.flagUp : G.flagDown)[flags]));
              if (ev.stemUp) headTop = Math.min(headTop, tip); else headBottom = Math.max(headBottom, tip + (flags ? 0 : 0));
            }
          }
          for (let d = 0; d < ev.dots; d++) {
            const dy = ev.pos % 2 === 0 ? y - SP / 2 : y;   // a dot sits in a space
            inner.push(glyph('gl dot', right + 0.3 * SP + d * 0.55 * SP, dy, G.dot));
          }
          // Over the note: a circle if it sits on a harmonic, and above that
          // the fingering — the thumb's sign or a digit. They ride above
          // whatever the note reaches up to.
          let fy = Math.min(FING_LINE, headTop - 0.7 * SP);
          if (harmonicsOn && ev.harm) {
            inner.push(glyph('fing harm', ev.x + headW / 2, fy, G.harmonic, 'middle'));
            reach(fy - 1.3 * SP, null);
            fy -= 1.35 * SP;
          }
          if (fingeringsOn && ev.finger) {
            const fg = ev.finger === 'T' ? G.thumb : G.fingers[ev.finger];
            if (fg) {
              inner.push(glyph('fing', ev.x + headW / 2, fy, fg, 'middle'));
              reach(fy - 1.6 * SP, null);
            }
          }
          reach(headTop - 0.8 * SP, headBottom + 0.8 * SP);
        } else {
          // Rests: the whole hangs from the fourth line, the half sits on the
          // third, the rest are centred on the middle line.
          const ry = ev.base === '1' ? yOfPos(6) : yOfPos(4);
          inner.push(glyph('gl', ev.x, ry, G.rest[ev.base]));
          right = ev.x + REST_W[ev.base];
          for (let d = 0; d < ev.dots; d++) inner.push(glyph('gl dot', right + 0.3 * SP + d * 0.55 * SP, yOfPos(5), G.dot));
        }
        const name = ev.sound ? ev.pitch.name : 'rest';
        bits.push(`<g class="${cls}" data-ev="${ev.index}" data-name="${esc(name)}">${inner.join('')}</g>`);
        evCount++;
      });

      // Beams, drawn over the stems the group shares, flat at the furthest
      // stem tip. Secondary beams only cover the notes short enough to need
      // them, and a lone short note inside a longer group gets a stub.
      beamGroups(b.events, beat).forEach(g => {
        const up = beamed.get(g[0]).up;
        const beamY = up ? Math.min(...g.map(ev => ev.y)) - STEM_H : Math.max(...g.map(ev => ev.y)) + STEM_H;
        g.forEach(ev => {
          bits.push(`<line class="stem" data-ev="${ev.index}" x1="${num(ev.stemX)}" y1="${num(ev.y)}" x2="${num(ev.stemX)}" y2="${num(beamY)}"/>`);
        });
        reach(up ? beamY - 0.8 * SP : null, up ? null : beamY + 0.8 * SP);
        const xFrom = g[0].stemX - STEM_W / 2;
        const xTo = g[g.length - 1].stemX + STEM_W / 2;
        const rectY = (level) => up ? beamY + (level - 1) * BEAM_PITCH : beamY - BEAM_H - (level - 1) * BEAM_PITCH;
        const evs = g.map(ev => ev.index).join(' ');
        bits.push(`<rect class="beam" data-evs="${evs}" x="${num(xFrom)}" y="${num(rectY(1))}" width="${num(xTo - xFrom)}" height="${num(BEAM_H)}"/>`);
        const deepest = Math.max(...g.map(ev => FLAGS[ev.base]));
        for (let level = 2; level <= deepest; level++) {
          let run = [];
          const flushRun = () => {
            if (!run.length) return;
            if (run.length > 1) {
              bits.push(`<rect class="beam" x="${num(run[0].stemX - STEM_W / 2)}" y="${num(rectY(level))}" width="${num(run[run.length - 1].stemX - run[0].stemX + STEM_W)}" height="${num(BEAM_H)}"/>`);
            } else {
              const only = run[0];
              const isFirst = g.indexOf(only) === 0;
              const stub = 0.9 * SP;
              const x = isFirst ? only.stemX - STEM_W / 2 : only.stemX + STEM_W / 2 - stub;
              bits.push(`<rect class="beam" x="${num(x)}" y="${num(rectY(level))}" width="${num(stub)}" height="${num(BEAM_H)}"/>`);
            }
            run = [];
          };
          g.forEach(ev => { if (FLAGS[ev.base] >= level) run.push(ev); else flushRun(); });
          flushRun();
        }
      });

      // A clef change ahead is shown small, before the barline it precedes.
      if (b.change) {
        const c = CLEFS[b.change];
        bits.push(glyph('gl clef-change', bx - f * CHANGE_W + 0.2 * SP, yOfPos(c.at), c.change));
      }

      // Barline. The last bar of the last system closes the passage.
      const isLast = last && bi === sys.bars.length - 1;
      if (isLast) {
        bits.push(`<line class="barline" x1="${num(bx - 0.9 * SP)}" y1="0" x2="${num(bx - 0.9 * SP)}" y2="${num(4 * SP)}"/>`);
        bits.push(`<rect class="barline-thick" x="${num(bx - 0.5 * SP)}" y="0" width="${num(0.5 * SP)}" height="${num(4 * SP)}"/>`);
      } else {
        bits.push(`<line class="barline" x1="${num(bx)}" y1="0" x2="${num(bx)}" y2="${num(4 * SP)}"/>`);
      }
    });

    const ty = yCursor - top;
    parts.push(`<g transform="translate(0 ${num(ty)})">${bits.join('')}</g>`);
    yCursor += (bottom - top) + SYSTEM_GAP;
  });

  const H = yCursor - SYSTEM_GAP;
  host.innerHTML =
    `<svg viewBox="0 0 ${num(W)} ${num(H)}" style="font-size:${GLYPH}px" ` +
    `role="img" aria-label="${esc(passageLabel())}">${parts.join('')}</svg>`;
  if (events.length !== evCount) problems.push('engraving and playback disagree about how many events there are');
  if (problems.length) showProblems(problems);
}

function passageLabel() {
  const p = passage();
  const list = selected();
  if (!list.length) return p.name;
  const span = list.length === 1 ? `m. ${list[0].n}` : `mm. ${list[0].n}–${list[list.length - 1].n}`;
  const clef = clefMode === 'auto' ? 'as written' : `in ${CLEFS[clefMode].label} clef`;
  return `${p.name}, ${span}, ${clef}`;
}

// --- the count, the highlight and the readout -------------------------------

function buildCounter() {
  const pips = document.getElementById('count-beats');
  if (!pips) return;
  pips.innerHTML = '';
  for (let i = 0; i < beatsPerMeasure(passage()); i++) {
    const s = document.createElement('span');
    s.className = 'pip';
    pips.appendChild(s);
  }
}

function showCount(label, beat) {
  const bar = document.getElementById('count-bar');
  if (bar) bar.textContent = label;
  document.querySelectorAll('#count-beats .pip').forEach((pip, i) => pip.classList.toggle('on', i === beat));
}

function clearCount() {
  const bar = document.getElementById('count-bar');
  if (bar) bar.textContent = '–';
  document.querySelectorAll('#count-beats .pip').forEach(pip => pip.classList.remove('on'));
}

function showNote(ev) {
  const name = document.getElementById('note-name');
  const fing = document.getElementById('note-finger');
  if (name) name.textContent = ev && ev.sound ? ev.pitch.name : (ev ? 'rest' : '');
  if (fing) {
    let f = ev && ev.sound && ev.finger ? (ev.finger === 'T' ? 'thumb' : ev.finger === '0' ? 'open' : ev.finger) : '';
    if (ev && ev.sound && ev.harm) f += (f ? ', ' : '') + 'harmonic';
    fing.textContent = f;
  }
}

function clearHighlight() {
  document.querySelectorAll('#score .on').forEach(el => el.classList.remove('on'));
}

function highlight(i) {
  clearHighlight();
  document.querySelectorAll(`#score [data-ev="${i}"]`).forEach(el => el.classList.add('on'));
  document.querySelectorAll('#score .beam[data-evs]').forEach(el => {
    if (el.getAttribute('data-evs').split(' ').includes(String(i))) el.classList.add('on');
  });
  const ev = selectedEvents()[i];
  showNote(ev);
}

// --- playback ----------------------------------------------------------------

const cello = AudioKit.instruments.cello;

// Consecutive notes with no rest between them are one bowed line: a single
// voice that glides from note to note, each held for its own length. A
// repeated note is re-articulated harder, or two D's would blur into one.
function phrases(events) {
  const out = [];
  let cur = null;
  events.forEach(ev => {
    if (!ev.sound) { cur = null; return; }
    if (!cur) { cur = { at: ev.at, index: ev.index, notes: [] }; out.push(cur); }
    cur.notes.push(ev);
  });
  return out;
}

function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function showRun() {
  const el = document.getElementById('run');
  if (!el) return;
  if (!passCount) { el.textContent = ''; return; }
  const secs = (Date.now() - runStartedAt) / 1000;
  el.textContent = `${passCount} ${passCount === 1 ? 'pass' : 'passes'} · ${formatClock(secs)}`;
}

function stopPlayback() {
  const was = playing;
  playing = false;
  AudioKit.stopSequence();
  if (loopTimerId) { clearTimeout(loopTimerId); loopTimerId = null; }
  passTimers.forEach(id => clearTimeout(id));
  passTimers = [];
  if (runTimerId) { clearInterval(runTimerId); runTimerId = null; }
  clearHighlight();
  clearCount();
  showNote(null);
  if (was) {
    showRun();   // the run just finished stays on the page: how long the thumb was down
    const el = document.getElementById('run');
    if (el && passCount) el.textContent = 'last run: ' + el.textContent;
  }
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
  if (!selected().length) return;
  playing = true;
  passCount = 0;
  runStartedAt = Date.now();
  runTimerId = setInterval(showRun, 1000);
  const btn = document.getElementById('play');
  if (btn) { btn.classList.add('playing'); btn.textContent = 'stop'; }
  const counter = document.getElementById('counter');
  if (counter) counter.classList.add('running');
  updateWakeLock();
  schedulePass(null, true);
}

// A changed control takes effect at the next seam of a running loop, rather
// than only after a manual stop. Outside a loop the pass being heard is the
// one that was asked for, so it plays out.
function restartIfLooping() {
  if (!playing || !loopOn) return;
  if (loopTimerId) { clearTimeout(loopTimerId); loopTimerId = null; }
  passTimers.forEach(id => clearTimeout(id));
  passTimers = [];
  clearHighlight();
  schedulePass(null, false);   // mid-practice: no second count-in
}

// One pass of the selection, then the next chained on the audio clock (so a
// loop seam is sample-accurate) or the end. `lead` ticks out a count-in bar.
function schedulePass(when, lead) {
  if (lead) AudioKit.prepareOutput();

  const p = passage();
  const events = selectedEvents();
  if (!events.length) { finishPlayback(); return; }

  const beatT = beatTicks(p);
  const tick = (60 / tempoBpm) / beatT;                 // one tick, in seconds
  const beat = beatT * tick;
  const leadBeats = lead && countIn ? beatsPerMeasure(p) : 0;
  const start = when != null ? when : AudioKit.currentTime() + 0.08 + leadBeats * beat;
  const totalTicks = events.reduce((sum, ev) => sum + ev.ticks, 0);

  phrases(events).forEach((ph, k) => {
    const base = ph.notes[0].pitch.midi;
    const shape = ph.notes.map((ev, i) => (i > 0 && ev.pitch.midi === ph.notes[i - 1].pitch.midi) ? { artic: 0.6 } : null);
    cello.playSequence(base, ph.notes.map(ev => ev.pitch.midi - base), {
      durations: ph.notes.map(ev => ev.ticks * tick),
      legato: true,
      attack: 0.03,
      peak: 0.18,
      release: 0.06,
      gate: 0.94,
      shape,
      when: start + ph.at * tick,
      // Only the first thing scheduled in a fresh pass may clear what came
      // before; everything after chains onto it.
      chain: when != null || k > 0,
      onNote: (semi, i) => { if (playing) highlight(ph.index + i); },
    });
  });

  // Ticks are scheduled after the notes: a fresh playSequence silences whatever
  // was pending on the clock, which would take any tick placed before it.
  if (metronomeOn) {
    const beats = Math.round(totalTicks / beatT);
    for (let b = 0; b < beats; b++) AudioKit.click(start + b * beat, b % beatsPerMeasure(p) === 0);
  }
  for (let b = 0; b < leadBeats; b++) AudioKit.click(start - (leadBeats - b) * beat, b === 0);

  // The visuals run off the same clock, one timer per thing to light up.
  const now = AudioKit.currentTime();
  const soon = (at, fn) => {
    const id = setTimeout(() => {
      const k = passTimers.indexOf(id);
      if (k >= 0) passTimers.splice(k, 1);
      if (playing) fn();
    }, Math.max(0, (at - now) * 1000));
    passTimers.push(id);
  };

  // Rests light up too: an empty beat you can see coming is the difference
  // between counting the bar and guessing at it.
  events.forEach(ev => { if (!ev.sound) soon(start + ev.at * tick, () => highlight(ev.index)); });

  soon(start, () => { passCount++; showRun(); });
  let beatIndex = 0;
  selected().forEach(m => {
    for (let b = 0; b < beatsPerMeasure(p); b++) {
      const at = start + (beatIndex++) * beat;
      soon(at, () => showCount(m.n, b));
    }
  });
  for (let b = 0; b < leadBeats; b++) soon(start - (leadBeats - b) * beat, () => showCount('in', b));

  const nextStart = start + totalTicks * tick;
  if (loopOn) {
    // Keep a good stretch of audio queued ahead of the seam: a phone throttles
    // timers once the screen is off, and a late timer is a gap in the loop.
    const ahead = Math.min(2.0, totalTicks * tick * 0.5);
    const delay = Math.max(0, (nextStart - ahead - AudioKit.currentTime()) * 1000);
    loopTimerId = setTimeout(() => {
      if (loopOn && playing) schedulePass(nextStart, false);
      else loopTimerId = setTimeout(finishPlayback, Math.max(0, (nextStart - AudioKit.currentTime()) * 1000));
    }, delay);
  } else {
    loopTimerId = setTimeout(finishPlayback, Math.max(0, (nextStart - AudioKit.currentTime()) * 1000));
  }
}

// A note on the page, tapped: it sounds, and says what it is. Only while
// nothing is playing — mid-pass, the pass has the voice.
function soundNote(i) {
  if (playing) return;
  const ev = selectedEvents()[i];
  if (!ev) return;
  highlight(i);
  if (!ev.sound) return;
  AudioKit.prepareOutput();
  cello.playSequence(ev.pitch.midi, [0], {
    step: 1.1, gate: 0.95, attack: 0.04, sustain: 0.85, release: 0.1, peak: 0.18,
  });
  const id = setTimeout(() => {
    const k = passTimers.indexOf(id); if (k >= 0) passTimers.splice(k, 1);
    if (!playing) { clearHighlight(); }
  }, 1300);
  passTimers.push(id);
}

// --- the drone ---------------------------------------------------------------
// A sustained tonic, low on the cello, to tune the passage against. The
// fifth is optional; the volume is its own control.

const drone = AudioKit.createDrone();
let droneFifth = false;
let droneVolume = 0.1;

function droneMidi() {
  const root = passage().key.replace('#', '♯').replace('b', '♭');
  return AudioKit.pitchToMidi(root + '2');
}

function syncDrone() {
  drone.setRoot(droneMidi());
  drone.setFifth(droneFifth);
  drone.setVolume(droneVolume);
  const btn = document.getElementById('drone');
  if (btn) btn.textContent = drone.playing ? 'stop' : `drone on ${passage().key.replace('#', '♯').replace('b', '♭')}`;
  const fifth = document.getElementById('drone-fifth');
  if (fifth) fifth.checked = droneFifth;
  const vol = document.getElementById('drone-volume');
  if (vol) vol.value = String(droneVolume);
}

function toggleDrone() {
  if (drone.playing) drone.stop();
  else { drone.setRoot(droneMidi()); drone.start(); }
  const btn = document.getElementById('drone');
  if (btn) btn.classList.toggle('on', drone.playing);
  syncDrone();
}

// --- the screen stays awake while it plays -----------------------------------

let wakeLock = null;

async function acquireWakeLock() {
  if (wakeLock || !('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (err) { /* unsupported or blocked — the page still works */ }
}

function releaseWakeLock() {
  if (!wakeLock) return;
  const held = wakeLock;
  wakeLock = null;
  try { held.release(); } catch (err) {}
}

function updateWakeLock() {
  if (playing) acquireWakeLock(); else releaseWakeLock();
}

// --- controls ----------------------------------------------------------------

const control = (id) => document.getElementById(id);

function showProblems(list) {
  const box = control('load-error');
  const detail = control('load-error-detail');
  if (detail) detail.textContent = list.join('; ');
  if (box) box.hidden = false;
}

// The marked tempo is the goal, not the ceiling.
function tempoCeiling(p) { return Math.round(p.targetBpm * 1.25); }

function selectPassage(i) {
  passageIdx = Math.max(0, Math.min(PASSAGES.length - 1, i));
  fromIdx = 0;
  toIdx = measures().length - 1;
  if (playing) stopPlayback();
  passCount = 0;
  const run = control('run');
  if (run) run.textContent = '';
  const p = passage();
  // Each passage remembers the speed it was last taken at; a new one starts
  // under the mark, where sight-reading is possible.
  tempoBpm = Number.isFinite(tempos[p.id]) ? tempos[p.id] : Math.round(p.targetBpm * 0.7);
  tempoBpm = Math.max(30, Math.min(tempoCeiling(p), tempoBpm));
  const pick = control('passage');
  if (pick) pick.value = String(passageIdx);
  const about = control('about');
  if (about) about.textContent = p.about || '';
  buildCounter();
  buildRangePickers();
  syncTempo();
  syncDrone();
  engrave();
  savePrefs();
  setUrl();
}

function selectRange(from, to) {
  const last = measures().length - 1;
  fromIdx = Math.max(0, Math.min(last, from));
  toIdx = Math.max(fromIdx, Math.min(last, to));
  buildRangePickers();
  engrave();
  restartIfLooping();
}

function buildRangePickers() {
  const list = measures();
  [['from', fromIdx], ['to', toIdx]].forEach(([id, chosen]) => {
    const sel = control(id);
    if (!sel) return;
    sel.innerHTML = '';
    list.forEach((m, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = String(m.n);
      if (i === chosen) o.selected = true;
      sel.appendChild(o);
    });
    sel.disabled = list.length < 2;
  });
  const all = control('whole');
  if (all) all.classList.toggle('on', fromIdx === 0 && toIdx === list.length - 1);
  const range = control('range-label');
  if (range) range.textContent = passageLabel();
}

function setTempo(v) {
  const p = passage();
  tempoBpm = Math.max(30, Math.min(tempoCeiling(p), Math.round(v)));
  tempos[p.id] = tempoBpm;
  syncTempo();
  savePrefs();
  restartIfLooping();
}

function syncTempo() {
  const p = passage();
  const slider = control('speed');
  const box = control('tempo');
  const ceiling = String(tempoCeiling(p));
  if (slider) { slider.max = ceiling; slider.value = String(tempoBpm); }
  if (box) { box.max = ceiling; box.value = String(tempoBpm); }
  const pct = control('tempo-pct');
  if (pct) {
    const share = Math.round((tempoBpm / p.targetBpm) * 100);
    const note = `<span class="mus">${G.quarterNote}</span>`;
    pct.innerHTML = tempoBpm === p.targetBpm
      ? `at the mark (${note} = ${p.targetBpm})`
      : `${share}% of the marked ${note} = ${p.targetBpm}`;
  }
}

function setClefMode(mode) {
  clefMode = CLEFS[mode] ? mode : 'auto';
  const sel = control('clef');
  if (sel) sel.value = clefMode;
  buildRangePickers();
  engrave();
  savePrefs();
}

function setFingerings(on) {
  fingeringsOn = !!on;
  const el = control('fingerings');
  if (el) el.checked = fingeringsOn;
  engrave();
  savePrefs();
}

function setHarmonics(on) {
  harmonicsOn = !!on;
  const el = control('harmonics');
  if (el) el.checked = harmonicsOn;
  engrave();
  savePrefs();
}

function wireControls() {
  const pick = control('passage');
  if (pick) {
    pick.innerHTML = '';
    PASSAGES.forEach((p, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = p.name;
      if (i === passageIdx) o.selected = true;
      pick.appendChild(o);
    });
    pick.addEventListener('change', () => selectPassage(Number(pick.value)));
  }
  const prev = control('prev');
  const next = control('next');
  if (prev) prev.addEventListener('click', () => selectPassage(passageIdx - 1));
  if (next) next.addEventListener('click', () => selectPassage(passageIdx + 1));

  const clef = control('clef');
  if (clef) clef.addEventListener('change', () => setClefMode(clef.value));
  const fing = control('fingerings');
  if (fing) fing.addEventListener('change', () => setFingerings(fing.checked));
  const harm = control('harmonics');
  if (harm) harm.addEventListener('change', () => setHarmonics(harm.checked));

  const from = control('from');
  const to = control('to');
  if (from) from.addEventListener('change', () => selectRange(Number(from.value), toIdx));
  if (to) to.addEventListener('change', () => selectRange(fromIdx, Number(to.value)));
  const all = control('whole');
  if (all) all.addEventListener('click', () => selectRange(0, measures().length - 1));

  const slider = control('speed');
  if (slider) slider.addEventListener('input', () => setTempo(Number(slider.value)));
  const box = control('tempo');
  if (box) box.addEventListener('change', () => setTempo(Number(box.value)));
  const full = control('full-speed');
  if (full) full.addEventListener('click', () => setTempo(passage().targetBpm));

  const play = control('play');
  if (play) play.addEventListener('click', startPlayback);

  [['metronome', v => { metronomeOn = v; }],
   ['count-in', v => { countIn = v; }],
   ['loop', v => { loopOn = v; }]].forEach(([id, set]) => {
    const el = control(id);
    if (!el) return;
    el.addEventListener('change', () => {
      set(el.checked);
      savePrefs();
      if (id === 'metronome') restartIfLooping();
    });
  });

  const dr = control('drone');
  if (dr) dr.addEventListener('click', toggleDrone);
  const fifth = control('drone-fifth');
  if (fifth) fifth.addEventListener('change', () => { droneFifth = fifth.checked; drone.setFifth(droneFifth); savePrefs(); });
  const vol = control('drone-volume');
  if (vol) vol.addEventListener('input', () => { droneVolume = parseFloat(vol.value); drone.setVolume(droneVolume); savePrefs(); });

  // A tap on a note sounds it.
  const score = control('score');
  if (score) {
    score.addEventListener('click', (ev) => {
      const el = ev.target && ev.target.closest ? ev.target.closest('[data-ev]') : null;
      if (!el) return;
      soundNote(Number(el.getAttribute('data-ev')));
    });
  }

  // Space starts and stops; the arrow keys step through the passages — unless
  // a control has the keyboard, where the keys belong to the control. (A
  // button does nothing with an arrow, so a button keeps only space.)
  addEventListener('keydown', (ev) => {
    const t = ev.target;
    const tag = t && t.tagName;
    const field = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    if (ev.code === 'Space' || ev.key === ' ') {
      if (field || tag === 'BUTTON') return;
      ev.preventDefault(); startPlayback();
    } else if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
      if (field) return;
      ev.preventDefault(); selectPassage(passageIdx + (ev.key === 'ArrowRight' ? 1 : -1));
    }
  });

  let resizeTimer = null;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(engrave, 120);
  });
}

// --- prefs and the url -------------------------------------------------------

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      passage: passage().id,
      tempos,
      clef: clefMode,
      fingerings: fingeringsOn,
      harmonics: harmonicsOn,
      metronome: metronomeOn, countIn, loop: loopOn,
      droneFifth, droneVolume,
    }));
  } catch (err) { /* private mode, or a full store — the page still works */ }
}

function applyPrefs() {
  let p;
  try { p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); } catch (err) { return; }
  if (!p || typeof p !== 'object') return;
  const i = PASSAGES.findIndex(x => x.id === p.passage);
  if (i >= 0) passageIdx = i;
  if (p.tempos && typeof p.tempos === 'object') {
    Object.keys(p.tempos).forEach(id => { if (Number.isFinite(p.tempos[id])) tempos[id] = p.tempos[id]; });
  }
  if (CLEFS[p.clef]) clefMode = p.clef;
  if (typeof p.fingerings === 'boolean') fingeringsOn = p.fingerings;
  if (typeof p.harmonics === 'boolean') harmonicsOn = p.harmonics;
  if (typeof p.metronome === 'boolean') metronomeOn = p.metronome;
  if (typeof p.countIn === 'boolean') countIn = p.countIn;
  if (typeof p.loop === 'boolean') loopOn = p.loop;
  if (typeof p.droneFifth === 'boolean') droneFifth = p.droneFifth;
  if (Number.isFinite(p.droneVolume)) droneVolume = Math.max(0, Math.min(0.4, p.droneVolume));
  [['metronome', metronomeOn], ['count-in', countIn], ['loop', loopOn], ['fingerings', fingeringsOn], ['harmonics', harmonicsOn]].forEach(([id, v]) => {
    const el = control(id);
    if (el) el.checked = v;
  });
  const clef = control('clef');
  if (clef) clef.value = clefMode;
}

// A link can name a passage: thumb.html?p=twinkle
function applyUrl() {
  const id = new URLSearchParams(location.search).get('p');
  if (!id) return;
  const i = PASSAGES.findIndex(x => x.id === id);
  if (i >= 0) passageIdx = i;
}

function setUrl() {
  try {
    const url = new URL(location.href);
    url.searchParams.set('p', passage().id);
    history.replaceState(null, '', url);
  } catch (err) {}
}

// --- starting up -------------------------------------------------------------

function init() {
  applyPrefs();
  applyUrl();

  const problems = checkPassages();
  if (problems.length) showProblems(problems);

  wireControls();
  selectPassage(passageIdx);
  clearCount();
  // Bravura arrives after the first paint; the glyph widths the layout is
  // drawn with are the font's, so draw once more when it's really there.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(engrave);
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init);
else init();

window.__thumbReady = true;
