// Giant Steps page.
//
// Walks the ending cadence of Coltrane's "Giant Steps" (transposed to land on
// C, as in the textbook figure): a ii–V–I whose middle is stretched through
// three tonic keys a major third apart, each preceded by its own dominant 7th.
// Reuses the shared audio engine (audio.js): the poly synth voices each chord,
// and pitchToMidi turns spelled note names into pitches.

const { pitchToMidi } = AudioKit;

// The progression, left to right. `notes` are spelled by letter so accidentals
// read correctly for each chord. `roman` is the structural function shown above
// the card; `func` is the plain-language role. `iv` is the root-motion interval
// to the NEXT chord (matches the wedges in the figure). `tonic` marks the three
// key centres (A♭, E, C) that the "giant steps" leap between.
const PROG = [
  { sym: 'Dm7', roman: 'ii7', func: 'ii of C',    notes: ['D', 'F', 'A', 'C'],        iv: 'm2', tonic: false },
  { sym: 'E♭7', roman: 'V7',  func: 'V of A♭',    notes: ['E♭', 'G', 'B♭', 'D♭'],     iv: 'P4', tonic: false },
  { sym: 'A♭',  roman: 'I',   func: 'key centre', notes: ['A♭', 'C', 'E♭'],           iv: 'm3', tonic: true  },
  { sym: 'B7',  roman: 'V7',  func: 'V of E',     notes: ['B', 'D♯', 'F♯', 'A'],      iv: 'P4', tonic: false },
  { sym: 'E',   roman: 'I',   func: 'key centre', notes: ['E', 'G♯', 'B'],            iv: 'm3', tonic: true  },
  { sym: 'G7',  roman: 'V7',  func: 'V of C',     notes: ['G', 'B', 'D', 'F'],        iv: 'P4', tonic: false },
  { sym: 'C',   roman: 'I',   func: 'key centre', notes: ['C', 'E', 'G'],             iv: null, tonic: true  },
];

// Voice each chord as a close-position stack rising from octave 3: the root
// sits at the bottom and every following tone is pushed up until it clears the
// one before it. Keeps the whole progression in a comfortable, even register.
function voice(notes, baseOct = 3) {
  let prev = -Infinity;
  return notes.map(n => {
    let m = pitchToMidi(n, baseOct);
    while (m <= prev) m += 12;
    prev = m;
    return m;
  });
}
PROG.forEach(ch => { ch.midis = voice(ch.notes); });

// --- audio ------------------------------------------------------------------
const synth = AudioKit.createPolySynth();
// iOS needs the silent-buffer kickstart on the first gesture for any sound.
['pointerdown', 'touchstart', 'mousedown', 'keydown'].forEach(ev =>
  window.addEventListener(ev, () => synth.unlock(), true));

let timers = [];
let playing = false;

const playBtn = document.getElementById('play');
const tempoInput = document.getElementById('tempo');
const tempoVal = document.getElementById('tempo-val');
const toneSel = document.getElementById('tone');
const loopChk = document.getElementById('loop');

function tempoBpm() { return parseInt(tempoInput.value, 10); }

function clearActive() {
  document.querySelectorAll('.chord.active').forEach(e => e.classList.remove('active'));
}
function clearKeys() {
  document.querySelectorAll('.mini-key.on').forEach(e => e.classList.remove('on'));
}

function stopAll() {
  timers.forEach(id => clearTimeout(id));
  timers = [];
  synth.allOff();
  clearActive();
  clearKeys();
  playing = false;
  playBtn.classList.remove('playing');
  playBtn.textContent = 'play';
}

// Sound one chord: silence the previous, light its card + keys, strike it and
// let it ring until the next chord (or the end) cuts it off.
function soundChord(i) {
  synth.allOff();
  clearActive();
  clearKeys();
  const ch = PROG[i];
  ch.el.classList.add('active');
  ch.midis.forEach(m => {
    synth.noteOn(m);
    const k = document.querySelector(`.mini-key[data-midi="${m}"]`);
    if (k) k.classList.add('on');
  });
}

// Schedule the whole progression, one chord per beat. On the final beat, either
// loop back to the top or fade to a stop.
function schedule() {
  const step = 60000 / tempoBpm();
  PROG.forEach((ch, i) => {
    timers.push(setTimeout(() => soundChord(i), i * step));
  });
  const total = PROG.length * step;
  timers.push(setTimeout(() => {
    if (loopChk.checked && playing) {
      timers = [];
      schedule();
    } else {
      stopAll();
    }
  }, total));
}

function togglePlay() {
  if (playing) { stopAll(); return; }
  playing = true;
  playBtn.classList.add('playing');
  playBtn.textContent = 'stop';
  schedule();
}

// Click a single card to hear just that chord (block, ~1.6s), without starting
// the sequence.
function playSingle(i) {
  stopAll();
  soundChord(i);
  timers.push(setTimeout(stopAll, 1600));
}

// --- build the strip --------------------------------------------------------
function buildStrip() {
  const strip = document.getElementById('strip');
  PROG.forEach((ch, i) => {
    const card = document.createElement('div');
    card.className = 'chord' + (ch.tonic ? ' tonic' : '');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `${ch.sym}, ${ch.notes.join(' ')}`);
    card.innerHTML =
      `<div class="roman">${ch.roman}</div>` +
      `<div class="sym">${ch.sym}</div>` +
      `<div class="func">${ch.func}</div>` +
      `<div class="notes">${ch.notes.join('&nbsp;')}</div>`;
    card.addEventListener('click', () => playSingle(i));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playSingle(i); }
    });
    ch.el = card;
    strip.appendChild(card);

    if (ch.iv) {
      const link = document.createElement('div');
      link.className = 'link';
      link.innerHTML = `<span class="wedge">&#x2228;</span><span class="iv">${ch.iv}</span>`;
      strip.appendChild(link);
    }
  });
}

// --- mini keyboard ----------------------------------------------------------
// Two octaves, C3–C5, covering every voiced tone in the progression.
const KBD_LOW = 48, KBD_HIGH = 72;
const WHITE_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);
const pcOf = m => ((m % 12) + 12) % 12;

function buildMiniKeyboard() {
  const k = document.getElementById('mini-kbd');
  for (let m = KBD_LOW; m <= KBD_HIGH; m++) {
    if (!WHITE_PCS.has(pcOf(m))) continue;
    const w = document.createElement('div');
    w.className = 'mini-key white';
    w.dataset.midi = m;
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

// --- wiring -----------------------------------------------------------------
playBtn.addEventListener('click', togglePlay);
tempoInput.addEventListener('input', () => { tempoVal.textContent = tempoInput.value; });
toneSel.addEventListener('change', () => { stopAll(); synth.setInstrument(toneSel.value); });

buildStrip();
buildMiniKeyboard();
tempoVal.textContent = tempoInput.value;
