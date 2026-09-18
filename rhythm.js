// The rhythm builder: one rhythm, built a measure at a time.
//
// A rhythm here is data — a list of measures, each a list of events — and the
// page does three things with it: engraves it on a one-line rhythm staff with
// Bravura, claps it back through the shared clock in audio.js, and lets a
// range of measures be looped at whatever speed the hands can take today.
//
// Durations are written as strings: '1' whole, '2' half, '4' quarter,
// '8' eighth, '16' sixteenth, '32' thirty-second, with '.' for a dot and a
// trailing 't' for a triplet member ('8t' is a triplet eighth). Internally
// they count in TICKS: 24 to the quarter, so eighths (12), triplet eighths (8)
// and sixteenths (6) are all whole numbers and nothing has to round.
//
// **To add the next measure**, append to a rhythm's `measures`:
//
//   { n: 2, events: [note('4'), rest('8'), note('8'), rest('2')] }
//
// `n` is the bar number the page shows. checkRhythms() refuses to let a bar
// that doesn't add up to its meter pass silently — it says so on the page.

const TICKS_PER_QUARTER = 24;
const BASE_TICKS = { '1': 96, '2': 48, '4': 24, '8': 12, '16': 6, '32': 3 };

// Anything the data gets wrong, collected rather than thrown: a bad duration
// should show up as a message on the page, not as a blank page.
const PROBLEMS = [];

function parseDur(token) {
  const m = /^(1|2|4|8|16|32)(\.*)(t?)$/.exec(String(token));
  if (!m) {
    PROBLEMS.push('bad duration "' + token + '"');
    return { base: '4', dots: 0, tuplet: 0, ticks: TICKS_PER_QUARTER };
  }
  const [, base, dots, tup] = m;
  let ticks = BASE_TICKS[base];
  let add = ticks;
  for (let i = 0; i < dots.length; i++) { add /= 2; ticks += add; }
  if (tup) ticks = ticks * 2 / 3;
  if (!Number.isInteger(ticks)) {
    PROBLEMS.push('duration "' + token + '" doesn\'t land on the tick grid');
    ticks = Math.round(ticks);
  }
  return { base, dots: dots.length, tuplet: tup ? 3 : 0, ticks };
}

const note = (d) => Object.assign(parseDur(d), { sound: true });
const rest = (d) => Object.assign(parseDur(d), { sound: false });

// --- the rhythms -------------------------------------------------------------

const RHYTHMS = [
  {
    id: 'rhythm-1',
    name: 'rhythm 1',
    meter: [4, 4],            // shown as the time signature
    beatsPerMeasure: 4,
    beatUnit: '4',            // what the metronome and the counter count
    targetBpm: 192,           // ♩ = 192 as marked
    measures: [
      // 1 — an eighth on the beat and an eighth of silence; then a triplet on
      // beat 2 sounded only on its *last* third (the first two are rests);
      // an empty beat 3; an eighth on 4 and an eighth of silence after it.
      { n: 1, events: [
        note('8'), rest('8'),
        rest('8t'), rest('8t'), note('8t'),
        rest('4'),
        note('8'), rest('8'),
      ] },
    ],
  },
];

// --- what is selected --------------------------------------------------------

const PREFS_KEY = 'rhythm:v1';

let rhythmIdx = 0;
let fromIdx = 0;
let toIdx = 0;
let tempoBpm = 96;
let metronomeOn = true;
let countIn = true;
let loopOn = true;

let playing = false;
let loopTimerId = null;
let passTimers = [];        // pending highlight callbacks, cleared on stop

const rhythm = () => RHYTHMS[rhythmIdx];
const measures = () => rhythm().measures || [];
const selected = () => measures().slice(fromIdx, toIdx + 1);

function beatTicks(r) { return parseDur(r.beatUnit || '4').ticks; }
function measureTicks(r) { return r.beatsPerMeasure * beatTicks(r); }

// A bar that doesn't add up to its meter would play, and engrave, as something
// nobody wrote. Report it instead.
function checkRhythms() {
  const out = PROBLEMS.slice();
  RHYTHMS.forEach(r => {
    const want = measureTicks(r);
    (r.measures || []).forEach(m => {
      const got = m.events.reduce((sum, e) => sum + e.ticks, 0);
      if (got !== want) {
        out.push(`${r.name} m.${m.n}: ${got}/${want} ticks — the bar doesn't add up`);
      }
    });
  });
  return out;
}

// Every event of the selection, with its tick offset from the first downbeat.
// Offsets are measured from each bar's own start, so one short bar can't drag
// everything after it out of place.
function selectedEvents() {
  const r = rhythm();
  const barTicks = measureTicks(r);
  const out = [];
  selected().forEach((m, mi) => {
    let at = 0;
    m.events.forEach(e => {
      out.push(Object.assign({}, e, { at: mi * barTicks + at, within: at, bar: m.n, index: out.length }));
      at += e.ticks;
    });
  });
  return out;
}

// --- engraving ---------------------------------------------------------------
// Drawn here rather than by LilyPond (as the song scores are) because every
// note has to be a live element: the one sounding right now lights up, and the
// measures on show change as the range does.

const SP = 10;                    // one staff space — the unit of the drawing
const GLYPH = 4 * SP;             // Bravura's em box is four staff spaces tall
const HEAD_W = 1.18 * SP;         // black notehead: where an up-stem attaches
const STEM_H = 3.5 * SP;
const STEM_W = 0.13 * SP;
const BEAM_H = 0.5 * SP;
const BEAM_PITCH = 0.75 * SP;     // beam thickness plus the gap under it
const BEAT_W = 8 * SP;            // horizontal room a quarter gets
const BAR_PAD = 1.4 * SP;         // after a barline, before the first note
const BAR_TAIL = 0.8 * SP;        // after the last note, before the next barline
const TIME_W = 4.5 * SP;          // the time signature's own column
const STAFF_Y = 8 * SP;           // the staff line, within a system
const SYSTEM_H = 11.5 * SP;       // room for stems and a tuplet bracket above
const PX_PER_UNIT = 0.78;         // how big a staff space wants to be, in px

const G = {
  headBlack: '', headHalf: '', headWhole: '',
  flag8: '', flag16: '', flag32: '',
  rest1: '', rest2: '', rest4: '',
  rest8: '', rest16: '', rest32: '',
  dot: '',
  digits: ['', '', '', '', '', '', '', '', '', ''],
  tuplets: ['', '', '', '', '', '', '', '', '', ''],
};

const REST_GLYPH = { '1': G.rest1, '2': G.rest2, '4': G.rest4, '8': G.rest8, '16': G.rest16, '32': G.rest32 };
const FLAG_GLYPH = { 1: G.flag8, 2: G.flag16, 3: G.flag32 };
const FLAGS = { '1': 0, '2': 0, '4': 0, '8': 1, '16': 2, '32': 3 };
const REST_W = { '1': 1.6 * SP, '2': 1.6 * SP, '4': 1.0 * SP, '8': 1.0 * SP, '16': 1.2 * SP, '32': 1.3 * SP };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const num = (v) => Math.round(v * 100) / 100;

function glyph(cls, x, y, ch, anchor) {
  return `<text class="${cls}" x="${num(x)}" y="${num(y)}"` +
         (anchor ? ` text-anchor="${anchor}"` : '') + `>${esc(ch)}</text>`;
}

// Consecutive flagged notes inside one beat are beamed together; a rest, a
// beat line or an unflagged value ends the group. A group of one keeps its flag.
function beamGroups(events, beat) {
  const groups = [];
  let cur = [];
  const flush = () => { if (cur.length > 1) groups.push(cur); cur = []; };
  events.forEach(e => {
    const flags = FLAGS[e.base];
    const sameBeat = cur.length && Math.floor(cur[0].within / beat) === Math.floor(e.within / beat);
    if (!e.sound || !flags) { flush(); return; }
    if (cur.length && !sameBeat) flush();
    cur.push(e);
  });
  flush();
  return groups;
}

// Runs of adjacent triplet events, bracketed and numbered together.
function tupletGroups(events) {
  const groups = [];
  let cur = [];
  events.forEach(e => {
    if (e.tuplet) { cur.push(e); return; }
    if (cur.length) { groups.push(cur); cur = []; }
  });
  if (cur.length) groups.push(cur);
  return groups;
}

function engrave() {
  const host = document.getElementById('score');
  if (!host) return;
  const r = rhythm();
  const list = selected();
  if (!list.length) { host.innerHTML = ''; return; }

  const barTicks = measureTicks(r);
  const beat = beatTicks(r);
  const mWant = r.beatsPerMeasure * BEAT_W;
  const px = host.clientWidth || 600;
  // How many bars fit on a line before the notes get too small to read.
  const perSystem = Math.max(1, Math.min(list.length,
    Math.floor((px / PX_PER_UNIT - TIME_W) / mWant)));
  const W = TIME_W + perSystem * mWant;
  const systems = Math.ceil(list.length / perSystem);
  const H = systems * SYSTEM_H;

  const parts = [];
  const events = selectedEvents();
  let evIdx = 0;

  for (let s = 0; s < systems; s++) {
    const bars = list.slice(s * perSystem, (s + 1) * perSystem);
    const top = s * SYSTEM_H;
    const y = top + STAFF_Y;
    const x0 = s === 0 ? TIME_W : 0;
    const mW = (W - x0) / bars.length;

    parts.push(`<line class="staff" x1="0" y1="${num(y)}" x2="${num(W)}" y2="${num(y)}"/>`);

    if (s === 0) {
      // On a one-line staff the two numerals straddle the line, two staff
      // spaces apart — the same gap they'd have on lines 2 and 4 of a stave.
      parts.push(glyph('sig', TIME_W / 2 - 0.4 * SP, y - SP, G.digits[r.meter[0]] || '', 'middle'));
      parts.push(glyph('sig', TIME_W / 2 - 0.4 * SP, y + SP, G.digits[r.meter[1]] || '', 'middle'));
    }

    bars.forEach((m, bi) => {
      const mx = x0 + bi * mW;
      const perTick = (mW - BAR_PAD - BAR_TAIL) / barTicks;
      const xOf = (at) => mx + BAR_PAD + at * perTick;
      const mine = [];
      let at = 0;
      m.events.forEach(e => {
        mine.push(Object.assign({}, e, { within: at, x: xOf(at), gi: evIdx++ }));
        at += e.ticks;
      });

      parts.push(`<text class="bar-no" x="${num(mx + 0.2 * SP)}" y="${num(y - 6.2 * SP)}">${m.n}</text>`);

      const beamed = new Set();
      beamGroups(mine, beat).forEach(g => g.forEach(e => beamed.add(e)));

      mine.forEach(e => {
        const cls = 'ev ' + (e.sound ? 'note' : 'rest');
        const bits = [];
        let right = e.x;
        if (e.sound) {
          const head = e.base === '1' ? G.headWhole : e.base === '2' ? G.headHalf : G.headBlack;
          bits.push(glyph('gl', e.x, y, head));
          right = e.x + HEAD_W;
          if (e.base !== '1') {
            const sx = e.x + HEAD_W - STEM_W / 2;
            bits.push(`<line class="stem" x1="${num(sx)}" y1="${num(y)}" x2="${num(sx)}" y2="${num(y - STEM_H)}"/>`);
            const flags = FLAGS[e.base];
            if (flags && !beamed.has(e)) bits.push(glyph('gl', sx - STEM_W / 2, y - STEM_H, FLAG_GLYPH[flags]));
          }
        } else {
          bits.push(glyph('gl', e.x, y, REST_GLYPH[e.base]));
          right = e.x + REST_W[e.base];
        }
        for (let d = 0; d < e.dots; d++) {
          bits.push(glyph('gl dot', right + 0.35 * SP + d * 0.55 * SP, y - 0.5 * SP, G.dot));
        }
        parts.push(`<g class="${cls}" data-ev="${e.gi}">${bits.join('')}</g>`);
      });

      // Beams, drawn over the stems the group shares. Secondary beams only
      // cover the notes short enough to need them.
      beamGroups(mine, beat).forEach(g => {
        const sx = (e) => e.x + HEAD_W - STEM_W / 2;
        const yTop = y - STEM_H;
        parts.push(`<rect class="beam" x="${num(sx(g[0]) - STEM_W / 2)}" y="${num(yTop)}" ` +
                   `width="${num(sx(g[g.length - 1]) - sx(g[0]) + STEM_W)}" height="${num(BEAM_H)}"/>`);
        const deepest = Math.max(...g.map(e => FLAGS[e.base]));
        for (let level = 2; level <= deepest; level++) {
          const by = yTop + (level - 1) * BEAM_PITCH;
          let run = [];
          const flushRun = () => {
            if (!run.length) return;
            if (run.length > 1) {
              parts.push(`<rect class="beam" x="${num(sx(run[0]) - STEM_W / 2)}" y="${num(by)}" ` +
                         `width="${num(sx(run[run.length - 1]) - sx(run[0]) + STEM_W)}" height="${num(BEAM_H)}"/>`);
            } else {
              // A lone short note inside a longer group gets a stub, pointing
              // back toward the note it belongs with.
              const only = run[0];
              const first = g.indexOf(only) === 0;
              const stub = 0.9 * SP;
              const x = first ? sx(only) - STEM_W / 2 : sx(only) - stub;
              parts.push(`<rect class="beam" x="${num(x)}" y="${num(by)}" width="${num(stub)}" height="${num(BEAM_H)}"/>`);
            }
            run = [];
          };
          g.forEach(e => { if (FLAGS[e.base] >= level) run.push(e); else flushRun(); });
          flushRun();
        }
      });

      // Triplet brackets: a hooked line above the group with the 3 in the gap.
      tupletGroups(mine).forEach(g => {
        const a = g[0];
        const z = g[g.length - 1];
        const x1 = a.x - 0.2 * SP;
        const x2 = (z.sound ? z.x + HEAD_W : z.x + REST_W[z.base]) + 0.2 * SP;
        const by = y - STEM_H - 1.8 * SP;
        const mid = (x1 + x2) / 2;
        const gap = 0.9 * SP;
        const hook = 0.7 * SP;
        parts.push(
          `<path class="tuplet" d="M${num(x1)} ${num(by + hook)} L${num(x1)} ${num(by)} L${num(mid - gap)} ${num(by)}"/>` +
          `<path class="tuplet" d="M${num(mid + gap)} ${num(by)} L${num(x2)} ${num(by)} L${num(x2)} ${num(by + hook)}"/>` +
          glyph('tuplet-no', mid, by + 0.55 * SP, G.tuplets[g[0].tuplet] || G.tuplets[3], 'middle'));
      });

      // Barline. The last bar of the last system closes the rhythm.
      const bx = mx + mW;
      const last = s === systems - 1 && bi === bars.length - 1;
      if (last) {
        parts.push(`<line class="barline" x1="${num(bx - 0.9 * SP)}" y1="${num(y - 1.6 * SP)}" x2="${num(bx - 0.9 * SP)}" y2="${num(y + 1.6 * SP)}"/>`);
        parts.push(`<rect class="barline-thick" x="${num(bx - 0.5 * SP)}" y="${num(y - 1.6 * SP)}" width="${num(0.5 * SP)}" height="${num(3.2 * SP)}"/>`);
      } else {
        parts.push(`<line class="barline" x1="${num(bx)}" y1="${num(y - 1.6 * SP)}" x2="${num(bx)}" y2="${num(y + 1.6 * SP)}"/>`);
      }
    });
  }

  host.innerHTML =
    `<svg viewBox="0 0 ${num(W)} ${num(H)}" style="font-size:${GLYPH}px" ` +
    `role="img" aria-label="${esc(rhythmLabel())}">${parts.join('')}</svg>`;
  if (events.length !== evIdx) PROBLEMS.push('engraving and playback disagree about how many events there are');
}

function rhythmLabel() {
  const r = rhythm();
  const list = selected();
  if (!list.length) return r.name;
  const span = list.length === 1 ? `m. ${list[0].n}` : `mm. ${list[0].n}–${list[list.length - 1].n}`;
  return `${r.name}, ${span}, ${r.meter[0]}/${r.meter[1]}`;
}

// --- the count and the highlight --------------------------------------------

function buildCounter() {
  const pips = document.getElementById('count-beats');
  if (!pips) return;
  pips.innerHTML = '';
  for (let i = 0; i < rhythm().beatsPerMeasure; i++) {
    const s = document.createElement('span');
    s.className = 'pip';
    pips.appendChild(s);
  }
}

function showCount(label, beat) {
  const bar = document.getElementById('count-bar');
  if (bar) bar.textContent = label;
  document.querySelectorAll('#count-beats .pip').forEach((p, i) => {
    p.classList.toggle('on', i === beat);
  });
}

function clearCount() {
  const bar = document.getElementById('count-bar');
  if (bar) bar.textContent = '–';
  document.querySelectorAll('#count-beats .pip').forEach(p => p.classList.remove('on'));
}

function clearHighlight() {
  document.querySelectorAll('#score .ev.on').forEach(el => el.classList.remove('on'));
}

function highlight(i) {
  clearHighlight();
  const el = document.querySelector(`#score [data-ev="${i}"]`);
  if (el) el.classList.add('on');
}

// --- playback ----------------------------------------------------------------

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
  if (!selected().length) return;
  playing = true;
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

  const r = rhythm();
  const events = selectedEvents();
  if (!events.length) { finishPlayback(); return; }

  const barTicks = measureTicks(r);
  const beatT = beatTicks(r);
  const tick = (60 / tempoBpm) / TICKS_PER_QUARTER;   // one tick, in seconds
  const beat = beatT * tick;
  const leadBeats = lead && countIn ? r.beatsPerMeasure : 0;
  const start = when != null ? when : AudioKit.currentTime() + 0.08 + leadBeats * beat;
  const bars = selected();
  const totalTicks = bars.length * barTicks;

  events.forEach(e => { if (e.sound) AudioKit.hit(start + e.at * tick); });

  if (metronomeOn) {
    for (let b = 0; b < bars.length * r.beatsPerMeasure; b++) {
      AudioKit.click(start + b * beat, b % r.beatsPerMeasure === 0);
    }
  }
  for (let b = 0; b < leadBeats; b++) {
    AudioKit.click(start - (leadBeats - b) * beat, b === 0);
  }

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
  events.forEach(e => soon(start + e.at * tick, () => highlight(e.index)));

  let beatIndex = 0;
  bars.forEach(m => {
    for (let b = 0; b < r.beatsPerMeasure; b++) {
      const at = start + (beatIndex++) * beat;
      soon(at, () => showCount(m.n, b));
    }
  });
  for (let b = 0; b < leadBeats; b++) {
    soon(start - (leadBeats - b) * beat, () => showCount('in', b));
  }

  const nextStart = start + totalTicks * tick;
  if (loopOn) {
    const ahead = Math.min(0.25, totalTicks * tick * 0.5);
    const delay = Math.max(0, (nextStart - ahead - AudioKit.currentTime()) * 1000);
    loopTimerId = setTimeout(() => {
      if (loopOn && playing) schedulePass(nextStart, false);
      else loopTimerId = setTimeout(finishPlayback, Math.max(0, (nextStart - AudioKit.currentTime()) * 1000));
    }, delay);
  } else {
    loopTimerId = setTimeout(finishPlayback, Math.max(0, (nextStart - AudioKit.currentTime()) * 1000));
  }
}

// --- the screen stays awake while it plays -----------------------------------

let wakeLock = null;

async function acquireWakeLock() {
  if (wakeLock || !('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (e) { /* unsupported or blocked — the page still works */ }
}

function releaseWakeLock() {
  if (!wakeLock) return;
  const held = wakeLock;
  wakeLock = null;
  try { held.release(); } catch (e) {}
}

function updateWakeLock() {
  if (playing) acquireWakeLock(); else releaseWakeLock();
}

// --- controls ----------------------------------------------------------------

const control = (id) => document.getElementById(id);

function selectRhythm(i) {
  rhythmIdx = Math.max(0, Math.min(RHYTHMS.length - 1, i));
  fromIdx = 0;
  toIdx = measures().length - 1;
  if (playing) stopPlayback();
  tempoBpm = Math.min(tempoBpm, tempoCeiling(rhythm()));
  buildCounter();
  buildRangePickers();
  syncTempo();
  engrave();
  savePrefs();
}

function selectRange(from, to) {
  const last = measures().length - 1;
  fromIdx = Math.max(0, Math.min(last, from));
  toIdx = Math.max(fromIdx, Math.min(last, to));
  buildRangePickers();
  engrave();
  savePrefs();
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
  if (range) range.textContent = rhythmLabel();
}

// The marked tempo is the goal, not the ceiling: a rhythm you can only just
// hold at the mark is easier to keep there after a few passes above it.
function tempoCeiling(r) { return Math.round(r.targetBpm * 1.25); }

function setTempo(v) {
  const r = rhythm();
  tempoBpm = Math.max(30, Math.min(tempoCeiling(r), Math.round(v)));
  syncTempo();
  savePrefs();
  restartIfLooping();
}

function syncTempo() {
  const r = rhythm();
  const slider = control('speed');
  const box = control('tempo');
  const ceiling = String(tempoCeiling(r));
  if (slider) { slider.max = ceiling; slider.value = String(tempoBpm); }
  if (box) { box.max = ceiling; box.value = String(tempoBpm); }
  const pct = control('tempo-pct');
  if (pct) {
    const share = Math.round((tempoBpm / r.targetBpm) * 100);
    const q = '<span class="mus">\uE1D5</span>';   // Bravura's quarter note
    pct.innerHTML = tempoBpm === r.targetBpm
      ? `at the mark (${q} = ${r.targetBpm})`
      : `${share}% of the marked ${q} = ${r.targetBpm}`;
  }
}

function wireControls() {
  const pick = control('rhythm');
  if (pick) {
    pick.innerHTML = '';
    RHYTHMS.forEach((r, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = r.name;
      if (i === rhythmIdx) o.selected = true;
      pick.appendChild(o);
    });
    pick.disabled = RHYTHMS.length < 2;
    pick.addEventListener('change', () => selectRhythm(Number(pick.value)));
  }

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
  if (full) full.addEventListener('click', () => setTempo(rhythm().targetBpm));

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

  // Space starts and stops, as on the metronome page — unless a control has
  // the keyboard, where space belongs to the control.
  addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.key !== ' ') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'BUTTON')) return;
    e.preventDefault();
    startPlayback();
  });

  let resizeTimer = null;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { engrave(); }, 120);
  });
}

// --- prefs -------------------------------------------------------------------

function savePrefs() {
  try {
    const list = measures();
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      rhythm: rhythm().id,
      tempo: tempoBpm,
      metronome: metronomeOn, countIn, loop: loopOn,
      from: list.length ? list[fromIdx].n : null,
      to: list.length ? list[toIdx].n : null,
    }));
  } catch (e) { /* private mode, or a full store — the page still works */ }
}

function applyPrefs() {
  let p;
  try { p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); } catch (e) { return; }
  if (!p || typeof p !== 'object') return;
  const i = RHYTHMS.findIndex(r => r.id === p.rhythm);
  if (i >= 0) rhythmIdx = i;
  if (Number.isFinite(p.tempo)) tempoBpm = Math.max(30, Math.min(tempoCeiling(rhythm()), Math.round(p.tempo)));
  if (typeof p.metronome === 'boolean') metronomeOn = p.metronome;
  if (typeof p.countIn === 'boolean') countIn = p.countIn;
  if (typeof p.loop === 'boolean') loopOn = p.loop;
  // Stored as bar numbers, not indices: bars added in front of a rhythm would
  // otherwise silently shift the range left selected.
  const list = measures();
  const a = list.findIndex(m => m.n === p.from);
  const b = list.findIndex(m => m.n === p.to);
  if (a >= 0 && b >= a) { fromIdx = a; toIdx = b; }
  [['metronome', metronomeOn], ['count-in', countIn], ['loop', loopOn]].forEach(([id, v]) => {
    const el = control(id);
    if (el) el.checked = v;
  });
}

// --- starting up -------------------------------------------------------------

function init() {
  toIdx = measures().length - 1;
  tempoBpm = Math.round(rhythm().targetBpm / 2);   // half speed until told otherwise
  applyPrefs();

  const problems = checkRhythms();
  if (problems.length) {
    const box = control('load-error');
    const detail = control('load-error-detail');
    if (detail) detail.textContent = problems.join('; ');
    if (box) box.hidden = false;
  }

  wireControls();
  buildCounter();
  buildRangePickers();
  syncTempo();
  engrave();
  clearCount();
  // Bravura arrives after the first paint; the glyph widths the layout is
  // drawn with are the font's, so draw once more when it's really there.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(engrave);
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init);
else init();

window.__rhythmReady = true;
