// Virtual keyboard page. Renders a piano (white keys flex-laid-out, black keys
// straddling the boundary between them) over a selectable range, and drives the
// polyphonic synth in audio.js. Plays with mouse/touch (glissando + multitouch)
// or the computer keyboard. Range, timbre (piano/cello), the tempered-fifth
// toggle, and note-name labels are all live.

const synth = AudioKit.createPolySynth();
const kbd = document.getElementById('keyboard');
const now = document.getElementById('now');

// iOS gates Web Audio behind a user gesture and suspends/"interrupts" the
// context whenever the page is backgrounded. Resume it on every interaction
// (capture phase, before play handlers) and when the tab becomes visible
// again, so sound keeps working without a refresh.
function resumeAudio() { synth.unlock(); }
['pointerdown', 'touchstart', 'mousedown', 'keydown'].forEach(ev =>
  window.addEventListener(ev, resumeAudio, true));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) synth.unlock();
});

// Low..high MIDI (inclusive), all starting/ending on C except the 88-key full
// range (A0–C8). Larger ranges grow downward then upward around middle C.
const RANGES = {
  '1': [60, 72],   // C4–C5
  '2': [48, 72],   // C3–C5
  '3': [48, 84],   // C3–C6
  '4': [36, 84],   // C2–C6
  '5': [36, 96],   // C2–C7
  '6': [24, 96],   // C1–C7
  '7': [24, 108],  // C1–C8
  'full': [21, 108], // A0–C8, 88 keys
};

const WHITE_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);
const pcOf = m => ((m % 12) + 12) % 12;

function noteLabel(midi) {
  return AudioKit.midiToName(midi, false) + (Math.floor(midi / 12) - 1);
}

let lowMidi = 48, highMidi = 72;

function build(rangeKey) {
  clearHeard(); // drop any mic highlight bound to keys we're about to replace
  [lowMidi, highMidi] = RANGES[rangeKey] || RANGES['2'];
  kbd.innerHTML = '';
  for (let m = lowMidi; m <= highMidi; m++) {
    if (!WHITE_PCS.has(pcOf(m))) continue; // black keys are added as children below
    const white = document.createElement('div');
    white.className = 'key white';
    white.dataset.midi = m;
    const label = document.createElement('span');
    label.className = 'label';
    const name = AudioKit.midiToName(m, false);
    label.textContent = name === 'C' ? noteLabel(m) : name;
    if (name === 'C') label.classList.add('tonic');
    white.appendChild(label);
    // Black key immediately to the right of this white, if any and in range.
    const bm = m + 1;
    if (bm <= highMidi && !WHITE_PCS.has(pcOf(bm))) {
      const black = document.createElement('div');
      black.className = 'key black';
      black.dataset.midi = bm;
      white.appendChild(black);
    }
    kbd.appendChild(white);
  }
}

function keyEl(midi) {
  return kbd.querySelector('.key[data-midi="' + midi + '"]');
}

function press(midi) {
  if (awaitingGuess) guess(midi); // first press during a pitch test is the answer
  synth.noteOn(midi);
  const el = keyEl(midi);
  if (el) el.classList.add('on');
  now.textContent = noteLabel(midi);
}

function lift(midi) {
  synth.noteOff(midi);
  const el = keyEl(midi);
  if (el) el.classList.remove('on');
}

// --- Pointer (mouse / touch) input -----------------------------------------
// Track the key each active pointer is currently over so dragging across keys
// glides (note-off the old, note-on the new). Capture keeps moves flowing even
// when the finger leaves the key it started on.
const pointers = new Map(); // pointerId -> midi (or null)

function midiFromPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  const key = el && el.closest('.key');
  if (!key || !kbd.contains(key)) return null;
  return parseInt(key.dataset.midi, 10);
}

kbd.addEventListener('pointerdown', e => {
  e.preventDefault();
  try { kbd.setPointerCapture(e.pointerId); } catch (_) {}
  const midi = midiFromPoint(e.clientX, e.clientY);
  pointers.set(e.pointerId, midi);
  if (midi != null) press(midi);
});

kbd.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  const midi = midiFromPoint(e.clientX, e.clientY);
  if (midi === prev) return;
  if (prev != null) lift(prev);
  if (midi != null) press(midi);
  pointers.set(e.pointerId, midi);
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  if (prev != null) lift(prev);
  pointers.delete(e.pointerId);
  try { kbd.releasePointerCapture(e.pointerId); } catch (_) {}
}
kbd.addEventListener('pointerup', endPointer);
kbd.addEventListener('pointercancel', endPointer);

// --- Computer keyboard input ------------------------------------------------
const KEYMAP = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65,
  t: 66, g: 67, y: 68, h: 69, u: 70, j: 71, k: 72, o: 73, l: 74,
};
let transpose = 0;
const downKeys = new Map(); // key char -> the midi that was actually sounded

window.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'z') { transpose -= 12; return; }
  if (k === 'x') { transpose += 12; return; }
  if (!(k in KEYMAP) || downKeys.has(k)) return;
  const midi = KEYMAP[k] + transpose;
  downKeys.set(k, midi);
  press(midi);
});

window.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (!downKeys.has(k)) return;
  lift(downKeys.get(k));
  downKeys.delete(k);
});

// Silence everything if the page loses focus mid-press.
window.addEventListener('blur', () => {
  pointers.clear();
  downKeys.clear();
  synth.allOff();
  kbd.querySelectorAll('.key.on').forEach(el => el.classList.remove('on'));
});

// --- Controls ---------------------------------------------------------------
document.getElementById('range').addEventListener('change', e => {
  synth.allOff();
  build(e.target.value);
});
document.getElementById('tone').addEventListener('change', e => {
  synth.allOff();
  synth.setInstrument(e.target.value);
});
document.getElementById('fifth').addEventListener('change', e => synth.setFifth(e.target.checked));
document.getElementById('labels').addEventListener('change', e => {
  kbd.classList.toggle('show-labels', e.target.checked);
});

// --- Pitch test (ear training) ----------------------------------------------
// Play a random pitch from the current range; the first key the player presses
// is their guess. Right note name (any octave) = confetti; wrong = buzzer.
const testBtn = document.getElementById('test-btn');
const replayBtn = document.getElementById('replay-btn');
const testMsg = document.getElementById('test-msg');
const testScore = document.getElementById('test-score');

let targetMidi = null;
let awaitingGuess = false;
let correct = 0, total = 0;
let playTimer = null;

function playTarget() {
  clearTimeout(playTimer);
  synth.noteOff(targetMidi);
  synth.noteOn(targetMidi);
  playTimer = setTimeout(() => synth.noteOff(targetMidi), 1300);
}

function startRound() {
  targetMidi = lowMidi + Math.floor(Math.random() * (highMidi - lowMidi + 1));
  awaitingGuess = true;
  testMsg.textContent = 'listen, then press the key you heard';
  testMsg.className = 'test-msg';
  replayBtn.hidden = false;
  testBtn.textContent = 'new note';
  playTarget();
}

function guess(midi) {
  awaitingGuess = false;
  total++;
  const answer = AudioKit.midiToName(targetMidi, false);
  if (pcOf(midi) === pcOf(targetMidi)) {
    correct++;
    testMsg.textContent = 'correct — it was ' + answer;
    testMsg.className = 'test-msg win';
    confetti();
  } else {
    testMsg.textContent = 'nope — that was ' + AudioKit.midiToName(midi, false) + ', it was ' + answer;
    testMsg.className = 'test-msg lose';
    synth.buzzer();
  }
  replayBtn.hidden = true;
  testScore.textContent = 'score: ' + Math.round(correct / total * 100) + '% (' + correct + '/' + total + ')';
}

function confetti() {
  const colors = ['#9cd8ff', '#ffd86f', '#ff7a9c', '#8cff9c', '#c89cff', '#ffffff'];
  const box = document.createElement('div');
  box.className = 'confetti';
  for (let i = 0; i < 80; i++) {
    const p = document.createElement('i');
    p.style.setProperty('--c', colors[i % colors.length]);
    p.style.setProperty('--dx', (Math.random() * 2 - 1) * 30 + 'vw');
    p.style.setProperty('--rot', Math.round(Math.random() * 720 - 360) + 'deg');
    p.style.left = Math.random() * 100 + 'vw';
    p.style.animationDelay = Math.random() * 0.2 + 's';
    p.style.animationDuration = 1.2 + Math.random() * 0.9 + 's';
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 2400);
}

testBtn.addEventListener('click', startRound);
replayBtn.addEventListener('click', playTarget);

// --- Microphone tuner ("listen" mode) ---------------------------------------
// Listen to the mic, detect the sung/played pitch by autocorrelation, light up
// the nearest key, and drive a vertical strobe whose drift encodes how far off
// it is: up = sharp, down = flat, frozen = in tune. Monophonic (one pitch at a
// time), so exactly one key ever animates. Uses its own AudioContext, separate
// from the synth's, and only runs while the toggle is on.
const micToggle = document.getElementById('mic');
let micStream = null, micCtx = null, analyser = null, micBuf = null, rafId = null;
let litKey = null;       // the key element currently highlighted by the mic
let curMidi = null;      // its MIDI number (null = nothing heard right now)
let strobeOffset = 0;    // accumulated strobe background-position (px)
let smoothedCents = 0;   // low-passed cents, so the drift glides
let lastFrameTs = 0, lastDetectTs = 0, lastGoodTs = 0;
let micGen = 0;          // bumped on each start/stop to abandon stale async starts

// px/sec of strobe drift per cent of error. 50¢ (max) ≈ 300 px/s over an 18px
// stripe — a fast blur; a few cents is a slow, readable crawl; 0¢ is frozen.
const STROBE_GAIN = 6;
const IN_TUNE_CENTS = 4;
const DETECT_MS = 30;    // run the O(n²) detector ~33×/s, not once per frame
const HOLD_MS = 250;     // keep the last key lit through brief detection dropouts

function clearHeard() {
  if (litKey) {
    litKey.classList.remove('hear', 'in-tune');
    litKey.style.removeProperty('--strobe');
    litKey = null;
  }
  curMidi = null;
}

// Autocorrelation pitch detector: returns the fundamental in Hz, or -1 when the
// signal is too quiet or too noisy to call. Rejects on low RMS, trims near-
// silent edges, takes the first strong correlation peak, then parabolic-
// interpolates for sub-sample (sub-cent) precision.
function autoCorrelate(buf, sampleRate) {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1; // too quiet to be a real note

  let r1 = 0, r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
  for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
  const b = buf.slice(r1, r2);
  const n = b.length;
  if (n < 8) return -1;

  const c = new Float32Array(n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n - i; j++)
      c[i] += b[j] * b[j + i];

  let d = 0;
  while (d < n - 1 && c[d] > c[d + 1]) d++; // skip the zero-lag descent
  let maxval = -1, maxpos = -1;
  for (let i = d; i < n; i++) if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
  if (maxpos <= 0 || maxpos >= n - 1) return -1;

  let T0 = maxpos;
  const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
  const a = (x1 + x3 - 2 * x2) / 2;
  const bb = (x3 - x1) / 2;
  if (a) T0 = T0 - bb / (2 * a);

  return sampleRate / T0;
}

function tick(ts) {
  rafId = requestAnimationFrame(tick);
  const dt = Math.min((ts - lastFrameTs) / 1000, 0.05);
  lastFrameTs = ts;

  // Detection is O(n²) per call, so throttle it well below the frame rate; the
  // strobe still animates every frame from the last good reading (below).
  if (ts - lastDetectTs >= DETECT_MS) {
    lastDetectTs = ts;
    analyser.getFloatTimeDomainData(micBuf);
    const freq = autoCorrelate(micBuf, micCtx.sampleRate);
    if (freq > 0) {
      const midiFloat = 69 + 12 * Math.log2(freq / 440);
      const midi = Math.round(midiFloat);
      const cents = (midiFloat - midi) * 100; // -50..+50 from the nearest key
      const el = keyEl(midi);                 // null if outside the current range
      if (el) {
        if (midi !== curMidi) {               // new note: snap rather than smooth across
          clearHeard();
          litKey = el;
          curMidi = midi;
          el.classList.add('hear');
          smoothedCents = cents;
          strobeOffset = 0;
        } else {
          smoothedCents += (cents - smoothedCents) * 0.25;
        }
        lastGoodTs = ts;
      }
    }
  }

  if (curMidi == null) return;
  // A key the user is actually pressing owns the `now` readout; the tuner only
  // writes it when nothing is held, so the two don't clobber each other.
  const free = pointers.size === 0 && downKeys.size === 0;
  // Drop the highlight only after a short hold, so the momentary detection
  // dropouts between and within notes don't make the key flicker.
  if (ts - lastGoodTs > HOLD_MS) { clearHeard(); if (free) now.textContent = ' '; return; }

  // Up = sharp, down = flat. CSS background-position-y grows downward, so a
  // positive (sharp) reading must subtract to drift the stripes upward.
  strobeOffset -= smoothedCents * STROBE_GAIN * dt;
  litKey.style.setProperty('--strobe', strobeOffset.toFixed(1) + 'px');
  const inTune = Math.abs(smoothedCents) < IN_TUNE_CENTS;
  litKey.classList.toggle('in-tune', inTune);
  if (free) now.textContent = noteLabel(curMidi) + (inTune ? ' · in tune'
    : ' · ' + (smoothedCents > 0 ? '+' : '') + Math.round(smoothedCents) + '¢');
}

async function startMic() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    micToggle.checked = false;
    now.textContent = 'mic unavailable';
    return;
  }
  const gen = ++micGen;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (e) {
    if (gen === micGen) { micToggle.checked = false; now.textContent = 'mic blocked'; }
    return;
  }
  if (gen !== micGen) { stream.getTracks().forEach(t => t.stop()); return; } // toggled off while awaiting
  micStream = stream;
  micCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = micCtx.createAnalyser();
  // getFloatTimeDomainData arrived in Safari 14.1; bail clearly on anything older
  // rather than throwing every frame inside the loop.
  if (typeof analyser.getFloatTimeDomainData !== 'function') {
    stopMic();
    micToggle.checked = false;
    now.textContent = 'listen needs a newer browser';
    return;
  }
  analyser.fftSize = 2048;
  micBuf = new Float32Array(analyser.fftSize);
  micCtx.createMediaStreamSource(micStream).connect(analyser);
  lastFrameTs = performance.now();
  lastDetectTs = 0;
  lastGoodTs = 0;
  curMidi = null;
  strobeOffset = 0;
  if (rafId) cancelAnimationFrame(rafId); // never run two loops at once
  rafId = requestAnimationFrame(tick);
}

function stopMic() {
  micGen++;
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  if (micCtx) { try { micCtx.close(); } catch (e) {} micCtx = null; }
  analyser = null; micBuf = null;
  clearHeard();
  now.textContent = ' ';
}

micToggle.addEventListener('change', e => {
  if (e.target.checked) startMic(); else stopMic();
});

// iOS suspends/interrupts the mic context when the tab is backgrounded; resume
// it on return (the synth has its own resume in audio.js, but this context
// isn't registered there). Reset the frame clock so the strobe doesn't lurch.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && micCtx && micCtx.state !== 'running') {
    micCtx.resume().catch(() => {});
    lastFrameTs = performance.now();
  }
});

build('2');
