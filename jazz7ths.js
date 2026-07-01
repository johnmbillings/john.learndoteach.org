// Jazz 7th interval-training page. A circle-of-fifths selector picks the root;
// each of the seven 7th-chord qualities is arpeggiated up and down like a scale
// (root → 3rd → 5th → 7th → octave and back), with its degrees, a worked example
// in the current key, and the movable cello fingering shape. An optional
// root+fifth drone plays underneath. Audio helpers (pitchToMidi, playSequence,
// the drone engine) live in audio.js, shared with the scales page.

const NS = 'http://www.w3.org/2000/svg';

// Roots clockwise around the circle of fifths, starting at the top (same order
// as the scales/chords pages). `root` is the spelling used to build/label the
// chord; `alt` is the enharmonic shown beneath it. The cello shapes are movable,
// so every quality trains identically at any root — only the notes transpose.
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

// --- 7th-chord qualities ---------------------------------------------------
// intervals: semitone offsets from the root for the four chord tones.
// letterSteps: how many letter-names above the root each tone spans, so notes
// spell correctly (a 7th is 6 letters up), matching the scales/chords pages.
// degrees: the scale-degree formula (display only). cello: the movable
// left-hand shape used to finger the arpeggio on the cello.
const CHORDS = [
  {
    name: 'Major 7',
    degrees: '1 – 3 – 5 – 7',
    intervals: [0, 4, 7, 11], letterSteps: [0, 2, 4, 6],
    cello: 'Extended 1–4 fingering, followed by the same shape across one string',
  },
  {
    name: 'Minor 7',
    degrees: '1 – ♭3 – 5 – ♭7',
    intervals: [0, 3, 7, 10], letterSteps: [0, 2, 4, 6],
    cello: 'Natural 1–4 fingering, followed by the same natural shape across one string',
  },
  {
    name: 'Dominant 7',
    degrees: '1 – 3 – 5 – ♭7',
    intervals: [0, 4, 7, 10], letterSteps: [0, 2, 4, 6],
    cello: 'Extended 1–4 fingering on the first string, natural 1–4 fingering on the adjacent string',
  },
  {
    name: 'Minor 7 ♭5',
    degrees: '1 – ♭3 – ♭5 – ♭7',
    intervals: [0, 3, 6, 10], letterSteps: [0, 2, 4, 6],
    cello: 'Natural 1–4 fingering, followed by an extended 1–4 fingering backwards on the adjacent string',
  },
  {
    name: 'Minor Major 7',
    degrees: '1 – ♭3 – 5 – 7',
    intervals: [0, 3, 7, 11], letterSteps: [0, 2, 4, 6],
    cello: 'Natural 1–4 fingering, followed by an extended 1–4 fingering without shifting',
  },
  {
    name: 'Diminished 7',
    degrees: '1 – ♭3 – ♭5 – ♭♭7',
    intervals: [0, 3, 6, 9], letterSteps: [0, 2, 4, 6],
    cello: 'Natural 1–4 fingering, followed by lowering the hand on the adjacent string by a half step',
  },
  {
    name: 'Major 7 ♯5',
    degrees: '1 – 3 – ♯5 – 7',
    intervals: [0, 4, 8, 11], letterSteps: [0, 2, 4, 6],
    cello: 'Extended 1–4 fingering, move hand up one half step on the adjacent string, play natural 1–4',
  },
];

// --- note spelling (same letter-name approach as scales.js) ----------------
// Spell each chord tone by letter so accidentals read correctly for the root
// (e.g. C dim7's seventh is B𝄫, not A; C7♯5's fifth is G♯).
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

// Accidental order/positions for engraving (kept for the empty-signature staff;
// these arpeggios have no key signature, so accidentals are always explicit).
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

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

// Spell the four chord tones for a quality built on `root`.
function spellChord(root, chord) {
  const { letterIdx, pc } = parseRoot(root);
  return chord.intervals.map((iv, i) =>
    spellPc((letterIdx + chord.letterSteps[i]) % 7, (pc + iv) % 12));
}

// Map pitch-class -> spelled name across the four chord tones. The octave tone
// (offset 12) shares the root's pitch class, so it reuses the root's spelling.
function buildSpellMap(root, chord) {
  const { letterIdx, pc } = parseRoot(root);
  const map = {};
  chord.intervals.forEach((iv, i) => {
    map[(pc + iv) % 12] = spellPc((letterIdx + chord.letterSteps[i]) % 7, (pc + iv) % 12);
  });
  return map;
}

// Returns a function semi -> displayed note name for the given root/chord.
function makeNamer(root, chord) {
  const base = pitchToMidi(root, 4);
  const preferFlats = /[b♭]/.test(root);
  const map = buildSpellMap(root, chord);
  return (semi) => {
    const pc = ((base + semi) % 12 + 12) % 12;
    return (map[pc] != null) ? map[pc] : AudioKit.midiToName(base + semi, preferFlats);
  };
}

let selectedIndex = 0; // default C
let octaves = 1;

const { pitchToMidi } = AudioKit;

// --- arpeggio playback ---
let autoDescend = false;
let tempoBpm = 96;
let metronomeOn = false; // audible click on each beat while an arpeggio plays
let articulation = 'legato';
let loopOn = false;
let repeatEnds = false; // when looping, repeat the turnaround (top/bottom) notes
let playingButton = null; // the play button whose arpeggio is currently sounding
let currentPlay = null; // { baseMidi, makeSeq, rowReadout } for re-triggering a loop
let loopTimerId = null; // pending timer that schedules the next loop pass

// Note value per beat: how many arpeggio notes fit in one quarter-note beat.
let subdivIndex = 0;
const SUBDIVS = [
  { label: '𝅝',  name: 'whole',     perBeat: 0.25 },
  { label: '𝅗𝅥',  name: 'half',      perBeat: 0.5  },
  { label: '♩',  name: 'quarter',   perBeat: 1 },
  { label: '♪',  name: 'eighth',    perBeat: 2 },
  { label: '♪³', name: 'triplet',   perBeat: 3 },
  { label: '♬',  name: 'sixteenth', perBeat: 4 },
];

// gate = fraction of the beat the note sounds; sustain = held level; atk/release
// = envelope edges. A smooth continuum: staccato is gently detached (not clipped),
// portato sits midway, legato fully connects.
const ARTIC = {
  staccato: { gate: 0.60, atk: 0.008, sustain: 0.50, release: 0.05 },
  portato:  { gate: 0.80, atk: 0.015, sustain: 0.70, release: 0.06 },
  legato:   { gate: 1.0,  atk: 0.025, sustain: 0.90, release: 0.06 },
};

// Expand a chord's four tones into an arpeggio across `octaves`, topping out on
// the 7th (not the octave root) so the turnaround lands on the chord's colour
// tone — e.g. maj7 over 1 octave -> 0,4,7,11; over 2 -> 0,4,7,11,12,16,19,23.
function expand(chord, n) {
  const out = [];
  for (let o = 0; o < n; o++) for (const iv of chord.intervals) out.push(iv + 12 * o);
  return out;
}

// Sequence builders (semitone offsets from the root, across `octaves`).
const seqAsc = (chord) => expand(chord, octaves);
const seqDesc = (chord) => expand(chord, octaves).reverse();
// up then back down, with the top note as a single turnaround.
const seqUpDown = (chord) => {
  const up = expand(chord, octaves);
  return up.concat(up.slice(0, -1).reverse());
};

function clearReadouts() {
  const center = document.getElementById('playing-note');
  if (center) center.textContent = '';
  document.querySelectorAll('.note-readout').forEach(el => { el.textContent = ''; });
  document.querySelectorAll('.row-staff .staff-note').forEach(g => {
    while (g.firstChild) g.removeChild(g.firstChild);
  });
}

// Reset the play-button/UI state without cancelling audio (lets the last note
// ring out naturally at the end of a pass).
function finishPlayback() {
  if (loopTimerId) { clearTimeout(loopTimerId); loopTimerId = null; }
  if (playingButton) playingButton.classList.remove('playing');
  playingButton = null;
  currentPlay = null;
  clearReadouts();
}

// User-initiated stop: silence any scheduled notes and reset.
function stopPlayback() {
  AudioKit.stopSequence();
  finishPlayback();
}

// Click handler for a play button: toggles stop if it's already this button's
// arpeggio, otherwise switches to the new one (never stacks two at once).
function togglePlay(button, baseMidi, makeSeq, rowReadout, namer, rowStaff) {
  if (playingButton === button) { stopPlayback(); return; }
  if (playingButton) playingButton.classList.remove('playing');
  if (loopTimerId) { clearTimeout(loopTimerId); loopTimerId = null; }
  playingButton = button;
  button.classList.add('playing');
  currentPlay = { baseMidi, makeSeq, rowReadout, namer, rowStaff };
  clearReadouts();
  schedulePass(baseMidi, makeSeq, rowReadout, namer, null, false, rowStaff);
}

// Re-trigger the current looping arpeggio so a toggled option takes effect now
// instead of only after a manual stop/restart.
function restartIfLooping() {
  if (playingButton && loopOn && currentPlay) {
    if (loopTimerId) { clearTimeout(loopTimerId); loopTimerId = null; }
    clearReadouts();
    schedulePass(currentPlay.baseMidi, currentPlay.makeSeq, currentPlay.rowReadout, currentPlay.namer, null, false, currentPlay.rowStaff);
  }
}

// Play one pass, then either schedule the next pass exactly on the audio clock
// (gapless loop) or finish. `when` is the absolute start time (null = default
// lead-in); `chain` keeps the previous pass's tail so the seam is seamless.
function schedulePass(baseMidi, makeSeq, rowReadout, namer, when, chain, rowStaff) {
  const seq = makeSeq();
  const step = (60 / tempoBpm) / SUBDIVS[subdivIndex].perBeat;
  const art = ARTIC[articulation] || ARTIC.legato;
  const center = document.getElementById('playing-note');
  const trebleEl = document.getElementById('toggle-treble');
  // When looping without repeating the turnaround, drop a trailing note that
  // duplicates the first (e.g. up-then-down) so the bottom isn't struck twice.
  const noRepeat = loopOn && !repeatEnds && seq.length > 1 && seq[0] === seq[seq.length - 1];
  const toPlay = noRepeat ? seq.slice(0, -1) : seq;
  const nextStart = AudioKit.playSequence(baseMidi, toPlay, {
    step,
    gate: step * art.gate,
    attack: art.atk,
    sustain: art.sustain,
    release: art.release,
    when,
    chain,
    clickInterval: metronomeOn ? 60 / tempoBpm : 0,
    clickAccent: true, // accent each pass's first beat (the root downbeat)
    onNote: (semi) => {
      const name = namer(semi);
      if (center) center.textContent = name;
      if (rowReadout) rowReadout.textContent = name;
      if (rowStaff) {
        highlightOnStaff(rowStaff, baseMidi + semi, name, 0, trebleEl.checked);
      }
    },
  });
  if (loopOn) {
    // Set up the next pass a touch before the seam so its notes are scheduled
    // ahead of time and the loop stays perfectly continuous.
    const lead = Math.min(0.1, toPlay.length * step * 0.5);
    const delay = Math.max(0, (nextStart - lead - AudioKit.currentTime()) * 1000);
    loopTimerId = setTimeout(() => {
      if (loopOn && playingButton) {
        schedulePass(baseMidi, makeSeq, rowReadout, namer, nextStart, true, rowStaff);
      } else {
        loopTimerId = setTimeout(finishPlayback, Math.max(0, (nextStart - AudioKit.currentTime()) * 1000));
      }
    }, delay);
  } else {
    loopTimerId = setTimeout(finishPlayback, Math.max(0, (nextStart - AudioKit.currentTime()) * 1000));
  }
}

// --- drone (root + optional fifth), shared engine in audio.js ---
// Root is set by select() during startup and on every root change.
const drone = AudioKit.createDrone();

// --- UI ---
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
    t.setAttribute('y', entry.alt ? y - 6 : y); // shift up to make room for the enharmonic
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
    g.addEventListener('click', () => select(i));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); }
    });
    svg.appendChild(g);
    entry.el = g;
  });

  // Center readout for the note currently sounding during playback.
  const playing = document.createElementNS(NS, 'text');
  playing.setAttribute('id', 'playing-note');
  playing.setAttribute('x', cx);
  playing.setAttribute('y', cy);
  playing.setAttribute('text-anchor', 'middle');
  playing.setAttribute('dominant-baseline', 'central');
  svg.appendChild(playing);
}

function select(i) {
  selectedIndex = i;
  CIRCLE.forEach((e, j) => e.el.classList.toggle('selected', j === i));
  const c = CIRCLE[i];
  document.getElementById('center-label').textContent = c.alt ? `${c.label} / ${c.alt}` : c.label;
  drone.setRoot(pitchToMidi(CIRCLE[i].root, 3));
  buildChords();
  persist();
}

// --- per-row mini staff ---------------------------------------------------
// Each chord row gets a small SVG staff (clef only; the arpeggios have no key
// signature, so accidentals are drawn on the noteheads). When that row is
// playing, the current note is highlighted so the user learns where each pitch
// sits on the page. Static parts (lines, clef) are drawn once when the row is
// created; only the .staff-note group is re-drawn on each note.
const ROW_STAFF = {
  width: 80, height: 32,
  topY: 8, lineGap: 4, stepY: 2,
  clefX: 4, sigStartX: 22, sigSpacing: 5,
  noteX: 64,
};

// Derived staff geometry — one source of truth shared by renderStaff,
// highlightOnStaff, staffPosFor and baseOctaveFor so they can't drift.
// Positions count half-line steps up from the bottom line (pos 0 = bottom line,
// 8 = top); posY maps a position to its y. STAFF_HEIGHT (4 spaces) is the SMuFL
// em used to size clef/accidental glyphs. CLEF_LINE is the line a clef registers
// on (treble G = 2, bass F = 6). CLEF_BOTTOM_POS is the letter-position of the
// bottom line per clef (E4 / G2), used to map a pitch to a staff position.
const STAFF_BASE_Y = ROW_STAFF.topY + 4 * ROW_STAFF.lineGap;
const STAFF_HEIGHT = 4 * ROW_STAFF.lineGap;
const posY = (p) => STAFF_BASE_Y - p * ROW_STAFF.stepY;
const CLEF_LINE = { treble: 2, bass: 6 };
const CLEF_BOTTOM_POS = { treble: 30, bass: 18 };

// SMuFL (Bravura) glyph codepoints. Clefs register on a staff line; accidentals
// register on the staff position they modify (alphabetic baseline = centre).
const CLEF_G = ''; // gClef (treble)
const CLEF_F = ''; // fClef (bass)
const ACC_GLYPHS = { '-2': '', '-1': '', '0': '', '1': '', '2': '' };

// Pick the octave so the natural letter pitch is closest to `midi`; lets
// enharmonic spellings (B♯ vs C, C♭ vs B) land on the right staff letter.
function staffPosFor(midi, letterIdx, treble) {
  const naturalPc = LETTER_PC[letterIdx];
  const octave = Math.round((midi - naturalPc) / 12) - 1;
  return (letterIdx + 7 * octave) - CLEF_BOTTOM_POS[treble ? 'treble' : 'bass'];
}

function parseSpelled(name) {
  if (!name) return null;
  const li = LETTERS.indexOf(name[0].toUpperCase());
  if (li < 0) return null;
  const accMap = { '': 0, '♯': 1, '♭': -1, '𝄪': 2, '𝄫': -2 };
  const acc = accMap[name.slice(1)];
  if (acc == null) return null;
  return { letterIdx: li, acc };
}

function makeRowStaff(treble) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'row-staff');
  svg.setAttribute('viewBox', `0 0 ${ROW_STAFF.width} ${ROW_STAFF.height}`);
  svg.setAttribute('aria-hidden', 'true');
  renderStaff(svg, treble);
  return svg;
}

function renderStaff(svg, treble) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const { topY, lineGap, clefX, width } = ROW_STAFF;

  for (let i = 0; i < 5; i++) {
    const ln = document.createElementNS(NS, 'line');
    ln.setAttribute('class', 'staff-line');
    ln.setAttribute('x1', 2); ln.setAttribute('x2', width - 2);
    ln.setAttribute('y1', topY + i * lineGap); ln.setAttribute('y2', topY + i * lineGap);
    svg.appendChild(ln);
  }

  const clef = document.createElementNS(NS, 'text');
  clef.setAttribute('class', 'clef');
  clef.setAttribute('x', clefX);
  // SMuFL clefs register on a staff line at their baseline; font-size = staff
  // height (1 SMuFL em), so the glyph scales to the staff with no fudge factor.
  clef.setAttribute('y', posY(CLEF_LINE[treble ? 'treble' : 'bass']));
  clef.setAttribute('font-size', STAFF_HEIGHT);
  clef.textContent = treble ? CLEF_G : CLEF_F;
  svg.appendChild(clef);

  // Empty target group for the highlighted notehead + any ledger lines.
  const noteG = document.createElementNS(NS, 'g');
  noteG.setAttribute('class', 'staff-note');
  svg.appendChild(noteG);
}

function highlightOnStaff(svg, midi, name, sig, treble) {
  const noteG = svg.querySelector('.staff-note');
  if (!noteG) return;
  while (noteG.firstChild) noteG.removeChild(noteG.firstChild);
  const parsed = parseSpelled(name);
  if (!parsed) return;
  const { letterIdx, acc } = parsed;
  const pos = staffPosFor(midi, letterIdx, treble);

  const { noteX } = ROW_STAFF;
  const y = posY(pos);

  // Ledger lines (every even pos outside the staff lines 0..8).
  if (pos < 0) {
    for (let p = -2; p >= pos; p -= 2) addLedger(noteG, noteX, posY(p));
  } else if (pos > 8) {
    for (let p = 10; p <= pos; p += 2) addLedger(noteG, noteX, posY(p));
  }

  // No key signature here, so every accidental (including naturals-by-default)
  // is drawn explicitly whenever the tone isn't natural.
  if (acc !== 0) {
    const a = document.createElementNS(NS, 'text');
    a.setAttribute('class', 'note-acc');
    a.setAttribute('x', noteX - 8);
    a.setAttribute('y', y); // alphabetic baseline = SMuFL accidental centre
    a.setAttribute('text-anchor', 'middle');
    a.setAttribute('font-size', STAFF_HEIGHT);
    a.textContent = ACC_GLYPHS[String(acc)] || '';
    noteG.appendChild(a);
  }

  const head = document.createElementNS(NS, 'ellipse');
  head.setAttribute('class', 'notehead');
  head.setAttribute('cx', noteX);
  head.setAttribute('cy', y);
  head.setAttribute('rx', 3.4);
  head.setAttribute('ry', 2.5);
  head.setAttribute('transform', `rotate(-20 ${noteX} ${y})`);
  noteG.appendChild(head);
}

function addLedger(parent, x, y) {
  const ll = document.createElementNS(NS, 'line');
  ll.setAttribute('class', 'staff-line ledger');
  ll.setAttribute('x1', x - 5); ll.setAttribute('x2', x + 5);
  ll.setAttribute('y1', y); ll.setAttribute('y2', y);
  parent.appendChild(ll);
}

// Choose the starting octave so the played range sits centered on the staff for
// the active clef. staffPosFor places pitch 0 at staff position
// (letterIdx + 7*octave - offset), offset 30 treble / 18 bass; lines span
// positions 0..8 (centre 4). The range root..root+`octaves` octaves spans
// ~7*octaves positions, so aim its midpoint (root + 3.5*octaves) at the centre.
function baseOctaveFor(root, treble) {
  const { letterIdx } = parseRoot(root);
  const offset = CLEF_BOTTOM_POS[treble ? 'treble' : 'bass'];
  return Math.round((4 - 3.5 * octaves + offset - letterIdx) / 7);
}

function buildChords() {
  stopPlayback(); // rebuilding replaces the buttons; don't leave an orphan arpeggio
  const treble = document.getElementById('toggle-treble').checked;
  const wrap = document.getElementById('chords');
  wrap.innerHTML = '';
  const root = CIRCLE[selectedIndex].root;
  const rootLabel = CIRCLE[selectedIndex].label;
  const base = pitchToMidi(root, baseOctaveFor(root, treble));

  CHORDS.forEach(chord => {
    const row = document.createElement('div');
    row.className = 'chord-row';

    // --- head line: name + staff/readout + play buttons ---
    const head = document.createElement('div');
    head.className = 'chord-head';
    const name = document.createElement('span');
    name.className = 'chord-name';
    const labelEl = document.createElement('span');
    labelEl.className = 'chord-label';
    labelEl.textContent = `${rootLabel} ${chord.name}`;
    const staffNote = document.createElement('span');
    staffNote.className = 'staff-and-note';
    const staff = makeRowStaff(treble);
    const readout = document.createElement('span');
    readout.className = 'note-readout';
    staffNote.append(staff, readout);
    name.append(labelEl, staffNote);

    const namer = makeNamer(root, chord); // spells this chord's notes correctly
    const asc = document.createElement('button');
    asc.type = 'button';
    asc.setAttribute('aria-label', `play ${rootLabel} ${chord.name} ${autoDescend ? 'up and down' : 'ascending'}`);
    asc.append(makeArrow(autoDescend ? '▲▼' : '▲'), makeLabel(autoDescend ? 'up + down' : 'ascending'));
    asc.addEventListener('click', () =>
      togglePlay(asc, base, () => (autoDescend ? seqUpDown(chord) : seqAsc(chord)), readout, namer, staff));
    const desc = document.createElement('button');
    desc.type = 'button';
    desc.setAttribute('aria-label', `play ${rootLabel} ${chord.name} descending`);
    desc.append(makeArrow('▼'), makeLabel('descending'));
    desc.addEventListener('click', () => togglePlay(desc, base, () => seqDesc(chord), readout, namer, staff));
    head.append(name, asc, desc);

    // --- detail: degrees + worked example, then the cello shape ---
    const detail = document.createElement('div');
    detail.className = 'chord-detail';
    const formula = document.createElement('div');
    formula.className = 'chord-formula';
    const deg = document.createElement('span');
    deg.className = 'deg';
    deg.textContent = chord.degrees;
    const sep = document.createElement('span');
    sep.className = 'sep';
    sep.textContent = '·';
    const ex = document.createElement('span');
    ex.className = 'ex';
    ex.textContent = spellChord(root, chord).join(' – ');
    formula.append(deg, sep, ex);
    const cello = document.createElement('div');
    cello.className = 'chord-cello';
    const lead = document.createElement('span');
    lead.className = 'lead';
    lead.textContent = 'cello';
    cello.append(lead, document.createTextNode(chord.cello));
    detail.append(formula, cello);

    row.append(head, detail);
    wrap.appendChild(row);
  });
}

// Build a play button's parts: the arrow always shows; the word label is hidden
// on narrow screens (via CSS) so the row fits on one line on mobile.
function makeArrow(glyph) {
  const s = document.createElement('span');
  s.className = 'btn-arrow';
  s.setAttribute('aria-hidden', 'true'); // decorative; the button carries an aria-label
  s.textContent = glyph;
  return s;
}
function makeLabel(text) {
  const s = document.createElement('span');
  s.className = 'btn-label';
  s.textContent = text;
  return s;
}

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
  });
  const fifth = document.getElementById('drone-fifth');
  drone.setFifth(fifth.checked); // honor a restored value
  fifth.addEventListener('change', () => drone.setFifth(fifth.checked));
  const vol = document.getElementById('drone-volume');
  drone.setVolume(parseFloat(vol.value));
  vol.addEventListener('input', () => drone.setVolume(parseFloat(vol.value)));
}

function initPlayOptions() {
  const ad = document.getElementById('auto-descend');
  autoDescend = ad.checked; // honor a restored value
  ad.addEventListener('change', () => {
    autoDescend = ad.checked;
    buildChords();
  });

  const oct = document.getElementById('octaves');
  const octVal = document.getElementById('octaves-val');
  octaves = parseInt(oct.value, 10);
  octVal.textContent = octaves;
  oct.addEventListener('input', () => {
    octaves = parseInt(oct.value, 10);
    octVal.textContent = octaves;
    buildChords(); // base octave is range-dependent, so re-pick it for centering
  });

  const tempo = document.getElementById('tempo');
  tempoBpm = parseInt(tempo.value, 10);
  tempo.addEventListener('input', () => {
    const v = parseInt(tempo.value, 10);
    if (Number.isFinite(v) && v > 0) tempoBpm = v;
  });

  const metro = document.getElementById('metronome');
  metronomeOn = metro.checked; // honor a restored value
  metro.addEventListener('change', () => {
    metronomeOn = metro.checked;
    restartIfLooping(); // start/stop ticks immediately on a running loop
  });

  const subdiv = document.getElementById('subdiv');
  const subdivVal = document.getElementById('subdiv-val');
  const showSubdiv = () => {
    const s = SUBDIVS[subdivIndex];
    subdivVal.textContent = `${s.label} ${s.name}`;
  };
  subdivIndex = parseInt(subdiv.value, 10);
  showSubdiv();
  subdiv.addEventListener('input', () => {
    subdivIndex = parseInt(subdiv.value, 10);
    showSubdiv();
  });

  const loop = document.getElementById('loop');
  loopOn = loop.checked;
  loop.addEventListener('change', () => { loopOn = loop.checked; });

  const repeat = document.getElementById('repeat-ends');
  repeatEnds = repeat.checked;
  repeat.addEventListener('change', () => {
    repeatEnds = repeat.checked;
    restartIfLooping(); // apply immediately to a running loop
  });

  const artic = document.getElementById('articulation');
  articulation = artic.value;
  artic.addEventListener('change', () => { articulation = artic.value; });
}

function initViewToggles() {
  const keysig = document.getElementById('toggle-keysig');
  const clefToggle = document.getElementById('clef-toggle');
  const applyKeysig = () => {
    document.body.classList.toggle('show-staves', keysig.checked);
    clefToggle.style.display = keysig.checked ? 'inline-flex' : 'none';
  };
  applyKeysig();
  keysig.addEventListener('change', applyKeysig);

  // Rebuild rows on clef change: the base octave is clef-dependent (so the
  // arpeggio stays centered on whichever staff), so we re-pick it, not just redraw.
  document.getElementById('toggle-treble').addEventListener('change', buildChords);
}

// --- settings persistence -------------------------------------------------
// Save the user's configuration so a reload (or the occasional iOS audio-
// recovery refresh) doesn't reset everything. One JSON blob in localStorage,
// driven by a single table so reading, restoring (with validation), and change-
// wiring stay in sync. The root (selectedIndex, not a DOM control) is handled
// alongside.
const PREFS_KEY = 'jazz7ths:prefs';
const PREFS = [
  { id: 'octaves',       key: 'octaves',     kind: 'num', min: 1,  max: 2,   ev: 'input' },
  { id: 'tempo',         key: 'tempo',       kind: 'num', min: 40, max: 300, ev: 'input' },
  { id: 'metronome',     key: 'metronome',   kind: 'bool',   ev: 'change' },
  { id: 'subdiv',        key: 'subdiv',      kind: 'num', min: 0,  max: SUBDIVS.length - 1, ev: 'input' },
  { id: 'loop',          key: 'loop',        kind: 'bool',   ev: 'change' },
  { id: 'repeat-ends',   key: 'repeatEnds',  kind: 'bool',   ev: 'change' },
  { id: 'auto-descend',  key: 'autoDescend', kind: 'bool',   ev: 'change' },
  { id: 'articulation',  key: 'articulation',kind: 'option', ev: 'change' },
  { id: 'toggle-keysig', key: 'keysig',      kind: 'bool',   ev: 'change' },
  { id: 'toggle-treble', key: 'treble',      kind: 'bool',   ev: 'change' },
  { id: 'drone-fifth',   key: 'droneFifth',  kind: 'bool',   ev: 'change' },
  { id: 'drone-volume',  key: 'droneVol',    kind: 'num', min: 0,  max: 0.4, ev: 'input' },
];

const prefEl = (p) => document.getElementById(p.id);

// Read a control's current value for storage.
function readPref(p) {
  const el = prefEl(p);
  if (p.kind === 'bool') return el.checked;
  if (p.kind === 'num') return Number(el.value);
  return el.value;
}

// Restore a stored value to its control, validating so a stale/hand-edited blob
// can never produce NaN or an unknown <select> option.
function writePref(p, v) {
  const el = prefEl(p);
  if (p.kind === 'bool') { if (typeof v === 'boolean') el.checked = v; }
  else if (p.kind === 'num') { const n = Number(v); if (Number.isFinite(n)) el.value = Math.min(p.max, Math.max(p.min, n)); }
  else if (typeof v === 'string' && [...el.options].some(o => o.value === v)) el.value = v;
}

function persist() {
  try {
    const data = { center: selectedIndex };
    PREFS.forEach(p => { data[p.key] = readPref(p); });
    localStorage.setItem(PREFS_KEY, JSON.stringify(data));
  } catch (e) { /* storage unavailable (private mode, etc.) — silently skip */ }
}

// Apply saved settings to the DOM controls (and selectedIndex) BEFORE the init
// functions read them, so the restored values take effect on load.
function applyPrefs() {
  let p;
  try { p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); } catch (e) { return; }
  if (!p || typeof p !== 'object') return;
  if (Number.isInteger(p.center) && p.center >= 0 && p.center < CIRCLE.length) selectedIndex = p.center;
  PREFS.forEach(entry => writePref(entry, p[entry.key]));
}

// Persist on any control change (the root persists via select()).
function initPersistence() {
  PREFS.forEach(p => prefEl(p).addEventListener(p.ev, persist));
}

applyPrefs();
buildCircle();
initDroneControls();
initPlayOptions();
initViewToggles();
initPersistence();
select(selectedIndex);
