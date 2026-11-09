// A metronome that clicks in time with the recording on a song page.
//
// The page cannot hear the track (YouTube's audio never leaves its iframe),
// so nothing here listens. Instead the song's entry in songs.json carries a
// beat grid — a tempo and the time of one downbeat, optionally with
// `anchors` (downbeat times every few bars) for a performance whose tempo
// wanders — and the metronome keeps the grid lined up with the player's
// clock: it polls the playing position, predicts where the next beats fall
// on the audio clock, and schedules clicks a tenth of a second ahead.
// Pausing, seeking, looping and the speed slider all show up as the
// position straying from the prediction, and the grid is re-seated.
//
// Everything about the grid can be set from the page — tap along, stamp
// the downbeat, nudge the tempo by 0.1 bpm, trim where the clicks start and
// stop — and copied back out as the JSON for songs.json. Edits are kept per
// song in localStorage until "reset".
//
// Exposed as window.Beat = { Grid, createMetronome, setup, parseTime,
// formatTime }. song.js calls Beat.setup() once the song is known.

const Beat = (() => {
  'use strict';

  const LOOKAHEAD = 0.12;   // seconds of clicks scheduled ahead of the clock
  const TICK_MS = 25;       // scheduler wake interval
  const JUMP = 0.2;         // a prediction error beyond this is a seek, not jitter
  const SMOOTH = 0.15;      // fraction of a small error corrected per tick

  function parseTime(t) {
    if (typeof t === 'number') return t;
    const parts = String(t).trim().split(':');
    if (parts.length === 1) return parseFloat(parts[0]) || 0;
    if (parts.length === 3) return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
    return parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
  }

  // M:SS.ss — a beat is half a second, so a tenth is too coarse to place one.
  function formatTime(sec) {
    const h = Math.max(0, Math.round(sec * 100));
    const m = Math.floor(h / 6000);
    const s = String(Math.floor(h / 100) % 60).padStart(2, '0');
    return `${m}:${s}.${String(h % 100).padStart(2, '0')}`;
  }

  // ---- the grid: beat index <-> track time --------------------------------
  //
  // Beat 0 is the downbeat at `offset`. With anchors, each anchor is a
  // downbeat; the number of bars between two neighbours is whatever the bpm
  // says it should be, rounded, and the beats between them are spread evenly
  // — so a performance that drifts by a few hundred ms over a chorus is
  // followed, while the bar count stays honest. Outside the anchors the
  // nominal tempo carries on.
  class Grid {
    constructor({ bpm, offset, beatsPerBar, anchors }) {
      this.bpm = Math.max(20, Math.min(400, Number(bpm) || 120));
      this.beatsPerBar = Math.max(1, Math.min(12, parseInt(beatsPerBar, 10) || 4));
      const spb = 60 / this.bpm;
      let times = (anchors || []).map(parseTime).filter(Number.isFinite).sort((a, b) => a - b);
      const off = parseTime(offset == null ? 0 : offset);
      if (!times.length) times = [Number.isFinite(off) ? off : 0];
      this.times = times;
      this.index = [0];
      for (let k = 1; k < times.length; k++) {
        const bars = Math.max(1, Math.round((times[k] - times[k - 1]) / (spb * this.beatsPerBar)));
        this.index.push(this.index[k - 1] + bars * this.beatsPerBar);
      }
      this.spb = spb;
    }

    get offset() { return this.times[0]; }

    timeOfBeat(n) {
      const t = this.times, ix = this.index, last = t.length - 1;
      if (n <= ix[0]) return t[0] + (n - ix[0]) * this.spb;
      if (n >= ix[last]) return t[last] + (n - ix[last]) * this.spb;
      let k = 0;
      while (ix[k + 1] <= n) k++;
      return t[k] + (n - ix[k]) * (t[k + 1] - t[k]) / (ix[k + 1] - ix[k]);
    }

    beatAtTime(time) {
      const t = this.times, ix = this.index, last = t.length - 1;
      if (time <= t[0]) return ix[0] + (time - t[0]) / this.spb;
      if (time >= t[last]) return ix[last] + (time - t[last]) / this.spb;
      let k = 0;
      while (t[k + 1] <= time) k++;
      return ix[k] + (time - t[k]) * (ix[k + 1] - ix[k]) / (t[k + 1] - t[k]);
    }

    // The data this grid came from, for songs.json.
    toJSON() {
      const o = { bpm: Math.round(this.bpm * 100) / 100, offset: formatTime(this.times[0]), beatsPerBar: this.beatsPerBar };
      if (this.times.length > 1) o.anchors = this.times.map(formatTime);
      return o;
    }
  }

  // ---- the metronome --------------------------------------------------------

  function createMetronome({ getTime, getRate, isPlaying, onBeat, onIdle }) {
    const AC = window.AudioContext || window.webkitAudioContext;
    let ctx = null;
    let master = null;
    let timer = null;
    let enabled = false;
    let grid = new Grid({ bpm: 120, offset: 0, beatsPerBar: 4 });
    let from = -Infinity;
    let to = Infinity;
    let volume = 0.8;
    let sound = 'click';

    // The seat of the grid on the audio clock: at ctx time `at`, the track
    // was at `pos`, moving at `rate` track-seconds per second.
    let seat = null;
    let nextBeat = 0;
    const pending = [];   // { n, at, nodes } scheduled but not yet sounded

    function ensureCtx() {
      if (!ctx) {
        try { ctx = new AC({ latencyHint: 'interactive' }); }
        catch (e) { ctx = new AC(); }
        master = ctx.createGain();
        master.gain.value = volume;
        master.connect(ctx.destination);
      }
      if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} }
      return ctx;
    }

    function scheduleClick(t, accent) {
      const gain = ctx.createGain();
      gain.connect(master);
      const nodes = { gain, oscs: [] };
      if (sound === 'wood') {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(accent ? 1750 : 1300, t);
        osc.frequency.exponentialRampToValueAtTime(accent ? 900 : 700, t + 0.02);
        osc.connect(gain);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(accent ? 0.7 : 0.5, t + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
        osc.start(t); osc.stop(t + 0.06);
        nodes.oscs.push(osc);
      } else if (sound === 'beep') {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = accent ? 1320 : 880;
        osc.connect(gain);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.34, t + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        osc.start(t); osc.stop(t + 0.1);
        nodes.oscs.push(osc);
      } else {
        // 'click': a bright square burst that cuts through a mix
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = accent ? 2000 : 1500;
        osc.connect(gain);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(accent ? 0.34 : 0.22, t + 0.001);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
        osc.start(t); osc.stop(t + 0.04);
        nodes.oscs.push(osc);
      }
      return nodes;
    }

    // Silence clicks scheduled for a future that just changed (a seek, a
    // loop seam, a pause).
    function cancelPending() {
      if (!ctx) { pending.length = 0; return; }
      const now = ctx.currentTime;
      pending.forEach(p => {
        if (!p.nodes || p.at <= now) return;
        try {
          p.nodes.gain.gain.cancelScheduledValues(now);
          p.nodes.gain.gain.setValueAtTime(0, now);
          p.nodes.oscs.forEach(o => o.stop(now));
        } catch (e) {}
      });
      pending.length = 0;
    }

    function reseat(now, pos, rate) {
      cancelPending();
      seat = { at: now, pos, rate };
      nextBeat = Math.ceil(grid.beatAtTime(pos) - 1e-6);
    }

    function tick() {
      if (!ctx) return;
      const playing = enabled && isPlaying();
      if (!playing) {
        if (seat) { cancelPending(); seat = null; if (onIdle) onIdle(); }
        return;
      }
      const now = ctx.currentTime;
      const pos = getTime();
      const rate = Math.max(0.05, Number(getRate()) || 1);
      if (!Number.isFinite(pos)) return;

      if (!seat) {
        reseat(now, pos, rate);
      } else {
        const predicted = seat.pos + (now - seat.at) * seat.rate;
        const err = pos - predicted;
        if (Math.abs(err) > JUMP || rate !== seat.rate) {
          reseat(now, pos, rate);
        } else {
          // Nudge the seat toward the reported position. The YouTube API
          // reports time in quarter-second lumps smoothed on the host side,
          // so a small error is more likely noise than truth.
          seat.pos += err * SMOOTH;
        }
      }

      const horizon = now + LOOKAHEAD;
      for (let guard = 0; guard < 64; guard++) {
        const tb = grid.timeOfBeat(nextBeat);
        const at = seat.at + (tb - seat.pos) / seat.rate;
        if (at > horizon) break;
        const n = nextBeat++;
        if (at < now - 0.03) continue;           // already behind us
        const audible = tb >= from - 1e-6 && tb <= to + 1e-6;
        const accent = ((n % grid.beatsPerBar) + grid.beatsPerBar) % grid.beatsPerBar === 0;
        const nodes = audible ? scheduleClick(Math.max(at, now), accent) : null;
        pending.push({ n, at: Math.max(at, now), nodes, audible });
      }

      // Visuals fire as each scheduled beat's time passes.
      while (pending.length && pending[0].at <= now) {
        const p = pending.shift();
        if (onBeat) onBeat(p.n, p.audible);
      }
    }

    function start() {
      ensureCtx();
      if (!timer) timer = setInterval(tick, TICK_MS);
    }

    return {
      get enabled() { return enabled; },
      get grid() { return grid; },
      get from() { return from; },
      get to() { return to; },
      get sound() { return sound; },
      get volume() { return volume; },
      enable(on) {
        enabled = !!on;
        if (enabled) start();
        else { cancelPending(); seat = null; if (onIdle) onIdle(); }
      },
      setGrid(g) { grid = g; cancelPending(); seat = null; },
      setRange(f, t) {
        from = Number.isFinite(f) ? f : -Infinity;
        to = Number.isFinite(t) ? t : Infinity;
      },
      setVolume(v) { volume = v; if (master) master.gain.value = v; },
      setSound(s) { sound = s; },
      // The track's current position, read the same way the scheduler reads
      // it — what a tap means.
      now() { return getTime(); },
      // Pre-warm the context from a user gesture, so the first click is on time.
      prime() { ensureCtx(); },
    };
  }

  // ---- the panel ------------------------------------------------------------

  function setup({ root, slug, song, getTime, getRate, isPlaying }) {
    if (!root || !song || !song.beat) return null;

    const q = (sel) => root.querySelector(sel);
    const els = {
      toggle: q('.beat-toggle'), bpm: q('.beat-bpm'), bpmDown: q('.beat-bpm-down'), bpmUp: q('.beat-bpm-up'),
      offset: q('.beat-offset'), offsetSet: q('.beat-offset-set'), offsetDown: q('.beat-offset-down'), offsetUp: q('.beat-offset-up'),
      one: q('.beat-one'), tap: q('.beat-tap'), from: q('.beat-from'), fromSet: q('.beat-from-set'),
      to: q('.beat-to'), toSet: q('.beat-to-set'), volume: q('.beat-volume'), sound: q('.beat-sound'),
      dots: q('.beat-dots'), readout: q('.beat-readout'), copy: q('.beat-copy'), reset: q('.beat-reset'),
      anchors: q('.beat-anchors'),
    };
    if (Object.values(els).some(e => !e)) {
      console.warn('beat panel: markup is missing controls; skipping');
      return null;
    }

    const storageKey = `beat:${slug}`;
    const base = Object.assign({ beatsPerBar: 4 }, song.beat);
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch (e) {}
    // Only a stored copy made from this same entry is honoured — a change to
    // songs.json wins over a stale edit, rather than being hidden by it.
    const cfg = (stored && stored.base === JSON.stringify(song.beat)) ? Object.assign({}, base, stored.beat) : Object.assign({}, base);

    let dots = [];
    const metro = createMetronome({
      getTime, getRate, isPlaying,
      onBeat(n, audible) {
        const bpb = metro.grid.beatsPerBar;
        const b = ((n % bpb) + bpb) % bpb;
        const bar = Math.floor(n / bpb) + 1;
        dots.forEach((d, i) => d.classList.toggle('on', i === b));
        els.readout.textContent = bar >= 1 ? `bar ${bar} · ${b + 1}` : `${b + 1}`;
        els.readout.classList.toggle('muted', !audible);
      },
      onIdle() {
        dots.forEach(d => d.classList.remove('on'));
        els.readout.textContent = '';
      },
    });

    function buildDots(n) {
      els.dots.innerHTML = '';
      dots = [];
      for (let i = 0; i < n; i++) {
        const d = document.createElement('span');
        d.className = 'beat-dot' + (i === 0 ? ' accent' : '');
        els.dots.appendChild(d);
        dots.push(d);
      }
    }

    function fields() {
      return {
        bpm: parseFloat(els.bpm.value),
        offset: els.offset.value,
        beatsPerBar: cfg.beatsPerBar,
        anchors: cfg.anchors,
      };
    }

    function apply(save = true) {
      const f = fields();
      if (!Number.isFinite(f.bpm) || f.bpm <= 0) return;
      cfg.bpm = Math.round(f.bpm * 100) / 100;
      cfg.offset = els.offset.value;
      cfg.from = els.from.value;
      cfg.to = els.to.value;
      metro.setGrid(new Grid(cfg));
      metro.setRange(cfg.from ? parseTime(cfg.from) : -Infinity, cfg.to ? parseTime(cfg.to) : Infinity);
      buildDots(cfg.beatsPerBar);
      els.anchors.textContent = cfg.anchors && cfg.anchors.length > 1
        ? `following ${cfg.anchors.length} tempo anchors`
        : '';
      if (save) {
        try { localStorage.setItem(storageKey, JSON.stringify({ base: JSON.stringify(song.beat), beat: exportable() })); } catch (e) {}
      }
    }

    function exportable() {
      const o = metro.grid.toJSON();
      if (cfg.from) o.from = cfg.from;
      if (cfg.to) o.to = cfg.to;
      return o;
    }

    function render() {
      els.bpm.value = (Math.round(cfg.bpm * 100) / 100).toString();
      // With anchors the first anchor is the downbeat the grid actually uses.
      const first = cfg.anchors && cfg.anchors.length ? cfg.anchors[0] : cfg.offset;
      els.offset.value = first != null ? formatTime(parseTime(first)) : '0:00.00';
      els.from.value = cfg.from != null ? formatTime(parseTime(cfg.from)) : '';
      els.to.value = cfg.to != null ? formatTime(parseTime(cfg.to)) : '';
    }

    // Moving the downbeat or retiming the tempo by hand discards the anchors:
    // they were measured against the old grid and would fight the new one.
    function dropAnchors() {
      if (cfg.anchors && cfg.anchors.length > 1) {
        cfg.anchors = null;
      }
    }

    const nudgeBpm = (d) => { els.bpm.value = (Math.round((parseFloat(els.bpm.value) + d) * 100) / 100).toString(); dropAnchors(); apply(); };
    const nudgeTime = (input, d) => { input.value = formatTime(parseTime(input.value || '0') + d); };

    els.toggle.addEventListener('click', () => {
      metro.enable(!metro.enabled);
      els.toggle.textContent = metro.enabled ? 'stop' : 'click';
      els.toggle.classList.toggle('on', metro.enabled);
    });
    els.bpm.addEventListener('change', () => { dropAnchors(); apply(); });
    els.bpmDown.addEventListener('click', () => nudgeBpm(-0.1));
    els.bpmUp.addEventListener('click', () => nudgeBpm(0.1));
    els.offset.addEventListener('change', () => { dropAnchors(); apply(); });
    els.offsetSet.addEventListener('click', () => { els.offset.value = formatTime(getTime()); dropAnchors(); apply(); });
    els.offsetDown.addEventListener('click', () => { nudgeTime(els.offset, -0.02); dropAnchors(); apply(); });
    els.offsetUp.addEventListener('click', () => { nudgeTime(els.offset, 0.02); dropAnchors(); apply(); });
    // Slide which beat carries the accent: the offset moves one beat later.
    els.one.addEventListener('click', () => { nudgeTime(els.offset, 60 / metro.grid.bpm); dropAnchors(); apply(); });
    els.from.addEventListener('change', () => apply());
    els.fromSet.addEventListener('click', () => { els.from.value = formatTime(getTime()); apply(); });
    els.to.addEventListener('change', () => apply());
    els.toSet.addEventListener('click', () => { els.to.value = formatTime(getTime()); apply(); });
    els.volume.addEventListener('input', () => metro.setVolume(parseFloat(els.volume.value)));
    els.sound.addEventListener('change', () => metro.setSound(els.sound.value));
    els.reset.addEventListener('click', () => {
      try { localStorage.removeItem(storageKey); } catch (e) {}
      Object.keys(cfg).forEach(k => delete cfg[k]);
      Object.assign(cfg, base);
      render();
      apply(false);
    });
    els.copy.addEventListener('click', async () => {
      const text = `"beat": ${JSON.stringify(exportable())}`;
      try { await navigator.clipboard.writeText(text); els.copy.textContent = 'copied'; }
      catch (e) { window.prompt('beat grid for songs.json', text); }
      setTimeout(() => { els.copy.textContent = 'copy'; }, 1500);
    });

    // Tap along with the music. Each tap records where the track was; four
    // or more in a row give the tempo (median gap), and the last one is
    // taken as a beat — then "1 ▸" walks the accent to the right beat.
    const taps = [];
    els.tap.addEventListener('click', () => {
      metro.prime();
      const t = getTime();
      if (taps.length && t - taps[taps.length - 1] > 2.5) taps.length = 0;
      if (taps.length && t <= taps[taps.length - 1]) taps.length = 0;
      taps.push(t);
      if (taps.length < 2) { els.tap.textContent = 'tap…'; return; }
      const gaps = taps.slice(1).map((v, i) => v - taps[i]).sort((a, b) => a - b);
      const median = gaps[Math.floor(gaps.length / 2)];
      const bpm = 60 / median;
      els.tap.textContent = `tap (${taps.length})`;
      if (taps.length >= 4 && Number.isFinite(bpm) && bpm > 20 && bpm < 400) {
        els.bpm.value = (Math.round(bpm * 10) / 10).toString();
        // keep the downbeat phase the user already had, if the tempo barely moved
        els.offset.value = formatTime(t);
        dropAnchors();
        apply();
      }
    });

    render();
    apply(false);
    metro.setVolume(parseFloat(els.volume.value));
    metro.setSound(els.sound.value);
    root.classList.add('active');
    return metro;
  }

  return { Grid, createMetronome, setup, parseTime, formatTime };
})();

window.Beat = Beat;
