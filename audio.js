// Shared audio engine for the song and scales pages. Loaded as a plain script
// before song.js / scales.js, which call into the AudioKit namespace.
//
// Exposes:
//   AudioKit.midiToFreq(midi)
//   AudioKit.pitchToMidi(name, defaultOctave = 3)
//   AudioKit.createInstrument({ name, timbre, expression }) -> { playSequence, ... }
//   AudioKit.instruments.cello  -> the natural cello (default melodic voice)
//   AudioKit.playSequence(baseMidi, semitoneOffsets, opts)  (legacy plain voice)
//   AudioKit.createDrone()  -> { start, stop, retune, setRoot, setFifth, setVolume, playing }
const AudioKit = (() => {
  const FIFTH_RATIO = 1.5;

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // "A♭", "Eb", "G3", "F#4" → MIDI number; null if unparseable.
  // Octave is optional and falls back to defaultOctave.
  function pitchToMidi(name, defaultOctave = 3) {
    const m = String(name).trim().match(/^([A-Ga-g])([#♯b♭]?)(-?\d+)?$/);
    if (!m) return null;
    const semis = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()];
    const accidental = (m[2] === '#' || m[2] === '♯') ? 1 : (m[2] === 'b' || m[2] === '♭') ? -1 : 0;
    const octave = m[3] !== undefined ? parseInt(m[3], 10) : defaultOctave;
    return semis + accidental + (octave + 1) * 12;
  }

  const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

  // MIDI number → pitch-class name. preferFlats picks the accidental spelling.
  function midiToName(midi, preferFlats) {
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    return (preferFlats ? FLAT_NAMES : SHARP_NAMES)[pc];
  }

  // One AudioContext shared across scale playbacks (the drone makes its own).
  let seqCtx = null;
  // Pending visual-callback timers, cleared when a sequence is stopped/replaced.
  let seqTimers = [];
  // Oscillators currently scheduled, so a new (or stopped) sequence can silence
  // them instead of layering a second scale on top of the first.
  let activeVoices = [];

  // Track every live AudioContext so we can resume them after an interruption.
  // iOS suspends audio on screen lock / phone calls and leaves the context in
  // the non-standard 'interrupted' state (not 'suspended') — so checking only
  // for 'suspended' misses it, and playback stays dead until a reload. We resume
  // on any non-running state, on the next user gesture (via playSequence/drone),
  // and when the page becomes visible/focused again.
  const liveCtxs = new Set();
  const AC = window.AudioContext || window.webkitAudioContext;

  function getSeqCtx() {
    if (!seqCtx) { seqCtx = new AC(); liveCtxs.add(seqCtx); }
    return seqCtx;
  }
  function resumeCtxs() {
    liveCtxs.forEach(c => {
      if (c && c.state !== 'running' && c.state !== 'closed') {
        try { c.resume(); } catch (e) {}
      }
    });
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeCtxs(); });
    window.addEventListener('focus', resumeCtxs);
    window.addEventListener('pageshow', resumeCtxs);
  }

  // A single metronome tick scheduled on the shared sequence clock at time `t`.
  // A short high "click" (square burst with a near-instant decay) so it cuts
  // through the sustained cello tone; the downbeat is pitched up and a touch
  // louder. Registered in activeVoices so stopSequence() silences any ticks
  // still pending in the future when playback is stopped.
  function scheduleClick(ctx, t, accent) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = accent ? 2000 : 1400;
    const peak = accent ? 0.22 : 0.13;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
    const rec = { osc, gain };
    activeVoices.push(rec);
    osc.onended = () => { const k = activeVoices.indexOf(rec); if (k >= 0) activeVoices.splice(k, 1); };
  }

  // Stop the current scale: cancel pending visual callbacks and fade out any
  // scheduled oscillators. Safe to call when nothing is playing.
  function stopSequence() {
    seqTimers.forEach(id => clearTimeout(id));
    seqTimers = [];
    if (seqCtx) {
      const now = seqCtx.currentTime;
      activeVoices.forEach(({ osc, gain, extra }) => {
        try {
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
          osc.stop(now + 0.06);
          // Silence any companion oscillators (e.g. a vibrato LFO) too.
          if (extra) extra.forEach(o => { try { o.stop(now + 0.06); } catch (e) {} });
        } catch (e) {}
      });
    }
    activeVoices = [];
  }

  // The shared "cello-ish" voice: a sawtooth shaped by a gentle lowpass and
  // three formant peaks. Connect a source into `input`; take `output`. Used by
  // both the drone and the scale note player so their timbre stays identical.
  function celloFilters(ctx) {
    const lp = ctx.createBiquadFilter();
    const fA = ctx.createBiquadFilter();
    const fB = ctx.createBiquadFilter();
    const fC = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 5000; lp.Q.value = 0.7;
    fA.type = 'peaking'; fA.frequency.value = 250; fA.Q.value = 4; fA.gain.value = 8;
    fB.type = 'peaking'; fB.frequency.value = 450; fB.Q.value = 3; fB.gain.value = 6;
    fC.type = 'peaking'; fC.frequency.value = 1800; fC.Q.value = 2; fC.gain.value = 5;
    lp.connect(fA); fA.connect(fB); fB.connect(fC);
    return { input: lp, output: fC, lp, baseCut: 5000 };
  }

  // --- instrument model -----------------------------------------------------
  // An instrument bundles a *timbre* (how one sustained voice sounds) with an
  // optional *expression* profile (how a melodic line is phrased) and knows how
  // to play a sequence of notes with that voice. The cello below is the first
  // instrument; the poly synth's piano/cello timbres can be described as
  // profiles here in a later pass so every voice shares one definition.
  //
  // A timbre: { wave, makeFilters(ctx) -> { input, output, lp?, baseCut? } }.
  // An expression profile (null = plain, un-phrased re-articulation):
  //   glide     portamento time constant for note-to-note pitch (s)
  //   vib       vibrato depth as a fraction of the sounding frequency
  //   vibRate   vibrato speed (Hz)
  //   dyn       loudness contour depth (higher notes a touch louder)
  //   accent    extra loudness on the tonic (first note of the pass)
  //   dynJitter random per-note loudness variation (± fraction)
  //   timing    micro-timing onset jitter (± s)
  //   bite      attack brightness sweep on the lowpass (fraction of cutoff)
  //   artic     legato inter-note dip depth (how much the tone eases between
  //             slurred notes so they're heard as separate, not one smear)
  const CELLO_TIMBRE = { wave: 'sawtooth', makeFilters: celloFilters };
  // The "natural" cello: connected, singing legato with gentle humanizing —
  // steady time, a hair of portamento, fade-in vibrato and dynamic shaping.
  const CELLO_EXPRESSION = {
    glide: 0.020, vib: 0.003, vibRate: 5.2,
    dyn: 0.06, accent: 0.06, dynJitter: 0.03,
    timing: 0, bite: 0.16, artic: 0.14,
  };

  // Current audio-clock time (creates the shared context if needed). Lets the
  // caller schedule contiguous loop passes against the same timeline.
  function currentTime() {
    return getSeqCtx().currentTime;
  }

  // A brief brightening of the lowpass on a note's attack — the "bite" of a
  // bow catching the string. Dips the cutoff just under its resting value, opens
  // past it during the attack, then settles back. `amount` is a fraction of the
  // resting cutoff; 0 leaves the filter untouched.
  function applyBite(voice, t, atk, amount) {
    const f = voice.lp.frequency;
    const base = voice.baseCut;
    f.cancelScheduledValues(t);
    f.setValueAtTime(base * (1 - amount * 0.5), t);
    f.linearRampToValueAtTime(base * (1 + amount * 0.35), t + atk);
    f.setTargetAtTime(base, t + atk, 0.08);
  }

  // Render a whole pass as ONE sustained voice whose pitch glides from note to
  // note and whose amplitude stays up throughout — real legato, instead of a
  // fresh note re-attacked from silence each time (the source of the mechanical
  // "throb"). Distinct notes are still heard because the tone eases down a touch
  // at each boundary (EX.artic) before swelling back, and the pitch slides in
  // over a short portamento (EX.glide). A gentle vibrato fades in over the pass.
  function renderConnected(ctx, timbre, baseMidi, seq, o) {
    const { start, step, gate, atk, release, EX, dynFor, timeFor, scheduleOnNote } = o;
    const n = seq.length;
    const osc = ctx.createOscillator();
    const voice = timbre.makeFilters(ctx);
    const gain = ctx.createGain();
    osc.type = timbre.wave;
    osc.connect(voice.input);
    voice.output.connect(gain).connect(ctx.destination);

    // Keep the glide and the articulation dip inside one note so fast tempos
    // don't smear or overlap into the neighbour.
    const glide = Math.min(EX.glide, step * 0.4);
    const dipLead = Math.min(0.012, step * 0.15);
    const dipTc = Math.min(0.006, step * 0.08);
    const recTc = Math.min(0.03, step * 0.35);

    // Pitch: start on the first note, glide to each subsequent one.
    osc.frequency.setValueAtTime(midiToFreq(baseMidi + seq[0]), start);
    // Amplitude: soften the very first onset — a slow, rounded rise (the bow
    // catching the string), gentler than the quick linear attack of the notes
    // that swell out of the preceding one. setTargetAtTime gives a curved
    // approach with no hard corner at the top.
    const p0 = dynFor(seq[0], 0);
    const firstAtk = Math.min(Math.max(atk * 3, 0.05), gate * 0.7);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.setTargetAtTime(p0, start, firstAtk / 3);
    if (EX.bite > 0 && voice.lp) applyBite(voice, start, firstAtk, EX.bite); // open the tone in over the same soft attack
    scheduleOnNote(seq[0], 0, start);

    for (let i = 1; i < n; i++) {
      const t = timeFor(i);
      osc.frequency.setTargetAtTime(midiToFreq(baseMidi + seq[i]), Math.max(start, t - 0.004), glide);
      const p = dynFor(seq[i], i);
      const dip = Math.max(p * (1 - EX.artic), 0.0002);
      gain.gain.setTargetAtTime(dip, Math.max(start + atk, t - dipLead), dipTc); // ease down into the new note
      gain.gain.setTargetAtTime(p, t + 0.004, recTc);                            // swell back up on it
      scheduleOnNote(seq[i], i, start + i * step);
    }

    // Vibrato: an LFO on the pitch whose depth fades in across the pass, so
    // sustained notes shimmer rather than sit dead-still.
    let lfo = null;
    if (EX.vib > 0) {
      lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const midHz = midiToFreq(baseMidi + seq[Math.floor(n / 2)]);
      lfo.frequency.value = EX.vibRate;
      lfoGain.gain.setValueAtTime(0.0001, start);
      lfoGain.gain.linearRampToValueAtTime(midHz * EX.vib, start + Math.min(0.6, n * step * 0.5));
      lfo.connect(lfoGain).connect(osc.frequency);
      lfo.start(start);
    }

    const end = start + n * step;
    gain.gain.setTargetAtTime(0.0001, end - release, release / 2);
    const stopAt = end + release * 3 + 0.05;
    osc.start(start);
    osc.stop(stopAt);
    if (lfo) lfo.stop(stopAt);
    const rec = { osc, gain, extra: lfo ? [lfo] : [] };
    activeVoices.push(rec);
    osc.onended = () => { const k = activeVoices.indexOf(rec); if (k >= 0) activeVoices.splice(k, 1); };
  }

  // Play a sequence of semitone offsets from baseMidi with `instr`'s voice.
  // opts: step (onset spacing, s), gate (sounding length, s), attack (s),
  // peak (gain), sustain (0 = plucked decay over the whole gate; >0 = hold at
  // that fraction of peak until a short release — for portato/legato), release
  // (release length, s), onNote(semi, i) fired as each note sounds, when
  // (absolute audio-clock start time; default = now + 0.05), chain (true = keep
  // the previous sequence's voices instead of stopping them, for gapless
  // looping), clickInterval (beat length in s; >0 adds a metronome tick on each
  // beat across this pass, locked to the note grid), clickAccent (accent the
  // pass's first tick — the downbeat where the tonic sounds), legato (true = the
  // articulation fully connects, so an expressive instrument renders the pass as
  // one continuous glided voice instead of note-by-note). Returns the audio-clock
  // time the next contiguous note would start (= start + seq.length * step), so a
  // loop can schedule the next pass exactly.
  function renderSequence(instr, baseMidi, seq, opts = {}) {
    const ctx = getSeqCtx();
    // Resume on any non-running state (covers iOS 'interrupted' after a lock),
    // running inside this user-gesture call so iOS allows it.
    if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} }
    const timbre = instr.timbre;
    const EX = instr.expression; // null = plain, un-phrased playback
    const step = opts.step != null ? opts.step : 0.42;
    const gate = Math.max(opts.gate != null ? opts.gate : step * 0.92, 0.04);
    const attack = opts.attack != null ? opts.attack : 0.02;
    const peak = opts.peak != null ? opts.peak : 0.16;
    const sustain = opts.sustain != null ? opts.sustain : 0;
    const release = opts.release != null ? opts.release : 0.05;
    const onNote = typeof opts.onNote === 'function' ? opts.onNote : null;
    // A fully-connected articulation on an expressive instrument becomes one
    // continuous glided voice; everything else is note-by-note.
    const connected = !!opts.legato && !!EX;
    // Never layer a second sequence over the first, unless chaining a loop pass.
    if (!opts.chain) stopSequence();
    const now = ctx.currentTime;
    const start = opts.when != null ? Math.max(opts.when, now) : now + 0.05;
    const atk = Math.min(attack, gate * 0.5);

    // Loudness contour (expressive instruments only): higher notes a touch
    // louder, the tonic emphasized, plus a small per-note nudge so the line
    // breathes. Plain instruments hold a constant `peak`.
    const lo = Math.min(...seq), hi = Math.max(...seq);
    const spanSemis = Math.max(1, hi - lo);
    function dynFor(semi, i) {
      if (!EX) return peak;
      const contour = EX.dyn * (((semi - lo) / spanSemis) - 0.5) * 2;
      const accent = i === 0 ? EX.accent : 0;
      const jitter = EX.dynJitter ? (Math.random() * 2 - 1) * EX.dynJitter : 0;
      return Math.max(peak * (1 + contour + accent + jitter), 0.0002);
    }
    // Micro-timing: nudge onsets off the grid, but never the first note of a
    // pass, so loop seams stay locked and the tonic lands on the beat.
    function timeFor(i) {
      const base = start + i * step;
      if (!EX || EX.timing === 0 || i === 0) return base;
      return base + (Math.random() * 2 - 1) * EX.timing;
    }
    function scheduleOnNote(semi, i, t) {
      if (!onNote) return;
      const id = setTimeout(() => {
        const k = seqTimers.indexOf(id); if (k >= 0) seqTimers.splice(k, 1);
        onNote(semi, i);
      }, Math.max(0, (t - now) * 1000));
      seqTimers.push(id);
    }

    if (connected) {
      renderConnected(ctx, timbre, baseMidi, seq, {
        start, step, gate, atk, release, peak, EX, dynFor, timeFor, scheduleOnNote,
      });
    } else {
      seq.forEach((semi, i) => {
        const t = timeFor(i);
        const p = dynFor(semi, i);
        const osc = ctx.createOscillator();
        const voice = timbre.makeFilters(ctx);
        const gain = ctx.createGain();
        osc.type = timbre.wave;
        osc.frequency.value = midiToFreq(baseMidi + semi);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(p, t + atk);
        if (sustain > 0) {
          // attack → quick decay to the sustain plateau → hold → release
          const susLevel = Math.max(p * sustain, 0.0002);
          const decayEnd = t + Math.min(atk + 0.04, gate * 0.6);
          gain.gain.linearRampToValueAtTime(susLevel, decayEnd);
          gain.gain.setValueAtTime(susLevel, Math.max(decayEnd, t + gate - release));
        }
        gain.gain.exponentialRampToValueAtTime(0.0001, t + gate);
        // Bow "bite": a brief brightening on the attack (expressive instruments
        // whose timbre has a lowpass to sweep).
        if (EX && EX.bite > 0 && voice.lp) applyBite(voice, t, atk, EX.bite);
        osc.connect(voice.input);
        voice.output.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + gate + 0.05);
        const rec = { osc, gain };
        activeVoices.push(rec);
        osc.onended = () => { const k = activeVoices.indexOf(rec); if (k >= 0) activeVoices.splice(k, 1); };
        scheduleOnNote(semi, i, t);
      });
    }
    // Metronome ticks, locked to the same start as the notes. Beats are a coarser
    // grid than the note subdivision, so a tick can fall between notes (e.g. four
    // ticks under a whole note). Round the pass to a whole number of beats so the
    // grid resets cleanly at each loop seam, keeping the tonic on the downbeat.
    if (opts.clickInterval > 0) {
      const dur = seq.length * step;
      const beats = Math.max(1, Math.round(dur / opts.clickInterval));
      for (let b = 0; b < beats; b++) {
        scheduleClick(ctx, start + b * opts.clickInterval, !!opts.clickAccent && b === 0);
      }
    }
    return start + seq.length * step;
  }

  // Build an instrument from a profile: { name, timbre, expression? }. Returns
  // an object exposing playSequence(baseMidi, seq, opts) that renders with the
  // profile's voice. All instruments share one scheduler and audio context, so
  // only one instrument's sequence sounds at a time (stopSequence stops it).
  function createInstrument(profile) {
    const instr = {
      name: profile.name || 'instrument',
      timbre: profile.timbre,
      expression: profile.expression || null,
    };
    instr.playSequence = (baseMidi, seq, opts = {}) => renderSequence(instr, baseMidi, seq, opts);
    return instr;
  }

  // The natural cello — the site's default melodic voice.
  const cello = createInstrument({ name: 'cello', timbre: CELLO_TIMBRE, expression: CELLO_EXPRESSION });
  // Plain, un-phrased cello: keeps the original note-by-note playback for pages
  // that haven't yet migrated to an expressive instrument.
  const plainCello = createInstrument({ name: 'cello-plain', timbre: CELLO_TIMBRE, expression: null });

  // Back-compat: the legacy top-level player. New code should reach for an
  // instrument (e.g. AudioKit.instruments.cello) instead.
  function playSequence(baseMidi, seq, opts) { return plainCello.playSequence(baseMidi, seq, opts); }

  // Sustained root with an optional perfect fifth. A sub-audible noise layer
  // keeps Bluetooth codecs from silence-gating the steady tone.
  function createDrone() {
    let nodes = null;
    let rootMidi = 57;
    let fifthOn = false;
    let volume = 0.1;

    function start() {
      if (nodes) return;
      const ctx = new AC();
      liveCtxs.add(ctx);
      if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} }
      const root = midiToFreq(rootMidi);

      const rootOsc = ctx.createOscillator();
      const fifthOsc = ctx.createOscillator();
      const fifthGain = ctx.createGain();
      const voice = celloFilters(ctx);
      const gain = ctx.createGain();

      rootOsc.type = 'sawtooth'; rootOsc.frequency.value = root;
      fifthOsc.type = 'sawtooth'; fifthOsc.frequency.value = root * FIFTH_RATIO;
      fifthGain.gain.value = fifthOn ? 1 : 0;

      const noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf; noise.loop = true;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass'; noiseFilter.frequency.value = 2000; noiseFilter.Q.value = 0.6;
      const noiseGain = ctx.createGain(); noiseGain.gain.value = 0.012;

      rootOsc.connect(voice.input);
      fifthOsc.connect(fifthGain); fifthGain.connect(voice.input);
      voice.output.connect(gain);
      noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0001), now + 0.15);

      rootOsc.start(); fifthOsc.start(); noise.start();
      nodes = { ctx, rootOsc, fifthOsc, fifthGain, noise, gain };
    }

    function stop() {
      if (!nodes) return;
      const { ctx, rootOsc, fifthOsc, noise, gain } = nodes;
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      [rootOsc, fifthOsc, noise].forEach(o => { try { o.stop(now + 0.25); } catch (e) {} });
      setTimeout(() => { try { ctx.close(); } catch (e) {} liveCtxs.delete(ctx); }, 400);
      nodes = null;
    }

    function retune() {
      if (!nodes) return;
      const root = midiToFreq(rootMidi);
      nodes.rootOsc.frequency.setTargetAtTime(root, nodes.ctx.currentTime, 0.03);
      nodes.fifthOsc.frequency.setTargetAtTime(root * FIFTH_RATIO, nodes.ctx.currentTime, 0.03);
    }

    function setRoot(midi) { rootMidi = midi; retune(); }
    function setFifth(on) {
      fifthOn = on;
      if (nodes) nodes.fifthGain.gain.setTargetAtTime(on ? 1 : 0, nodes.ctx.currentTime, 0.03);
    }
    function setVolume(v) {
      volume = v;
      if (nodes) nodes.gain.gain.setTargetAtTime(v, nodes.ctx.currentTime, 0.03);
    }

    return {
      start, stop, retune, setRoot, setFifth, setVolume,
      get playing() { return !!nodes; },
    };
  }

  // Polyphonic, press-and-hold synth for the virtual keyboard. Two timbres:
  // 'piano' (struck string: bright attack, decaying tail) and 'cello' (bowed:
  // sustained, reuses the shared cello voice). With the fifth toggle on, every
  // note also sounds the pitch seven semitones above — a *tempered* fifth
  // (equal-tempered, ratio 2^(7/12) ≈ 1.498), not the just 3:2 the drone uses.
  function createPolySynth() {
    let ctx = null, master = null;
    let instrument = 'piano';
    let fifthOn = false;
    let pianoWave = null;
    // midi -> { count, voices }. count tracks how many inputs (pointers, keys)
    // are holding the note so overlapping presses don't cut each other off.
    const held = new Map();

    function ensure() {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = 0.85;
        // Soft knee so dense chords don't clip.
        const comp = ctx.createDynamicsCompressor();
        master.connect(comp);
        comp.connect(ctx.destination);
      }
      // iOS uses an "interrupted" state after backgrounding, not just
      // "suspended" — resume whenever it isn't actively running.
      if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} }
      return ctx;
    }

    function getPianoWave() {
      if (!pianoWave) {
        const real = new Float32Array([0, 1, 0.62, 0.42, 0.28, 0.19, 0.13, 0.09, 0.06, 0.04, 0.028, 0.02]);
        pianoWave = ctx.createPeriodicWave(real, new Float32Array(real.length));
      }
      return pianoWave;
    }

    function pianoVoice(freq, now) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(getPianoWave());
      osc.frequency.value = freq;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = Math.min(freq * 7 + 800, 12000); lp.Q.value = 0.4;
      const gain = ctx.createGain();
      const peak = 0.22;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(peak * 0.3, now + 0.5);
      gain.gain.setTargetAtTime(0.0001, now + 0.5, 2.5); // slow tail while held
      osc.connect(lp); lp.connect(gain); gain.connect(master);
      osc.start(now);
      return { gain, oscs: [osc], release: 0.18 };
    }

    function celloVoice(freq, now) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth'; osc.frequency.value = freq;
      const voice = celloFilters(ctx);
      const gain = ctx.createGain();
      const peak = 0.16;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.09);       // bow attack
      gain.gain.setTargetAtTime(peak * 0.82, now + 0.09, 0.4);   // settle to sustain
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 5;
      lfoGain.gain.setValueAtTime(0.0001, now);
      lfoGain.gain.linearRampToValueAtTime(freq * 0.006, now + 0.6); // vibrato fades in
      lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
      osc.connect(voice.input); voice.output.connect(gain); gain.connect(master);
      osc.start(now); lfo.start(now);
      return { gain, oscs: [osc, lfo], release: 0.15 };
    }

    function makeVoice(midi) {
      const freq = midiToFreq(midi);
      const now = ctx.currentTime;
      return instrument === 'cello' ? celloVoice(freq, now) : pianoVoice(freq, now);
    }

    function stopVoice(v) {
      const t = ctx.currentTime;
      try {
        v.gain.gain.cancelScheduledValues(t);
        if (v.gain.gain.cancelAndHoldAtTime) v.gain.gain.cancelAndHoldAtTime(t);
        else v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.0001), t);
        v.gain.gain.setTargetAtTime(0.0001, t, v.release);
        const end = t + v.release * 8 + 0.1;
        v.oscs.forEach(o => { try { o.stop(end); } catch (e) {} });
      } catch (e) {}
    }

    function noteOn(midi) {
      ensure();
      const entry = held.get(midi);
      if (entry) { entry.count++; return; }
      const voices = [makeVoice(midi)];
      if (fifthOn) voices.push(makeVoice(midi + 7)); // tempered fifth: +7 semitones
      held.set(midi, { count: 1, voices });
    }

    function noteOff(midi) {
      const entry = held.get(midi);
      if (!entry) return;
      if (--entry.count > 0) return;
      entry.voices.forEach(stopVoice);
      held.delete(midi);
    }

    function allOff() {
      held.forEach(entry => entry.voices.forEach(stopVoice));
      held.clear();
    }

    // iOS won't produce sound until the context is resumed inside a user
    // gesture; a one-sample silent buffer reliably kick-starts output. Call
    // this from the first touch/click so later notes actually sound.
    function unlock() {
      ensure();
      try {
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        src.connect(ctx.destination);
        src.start(0);
      } catch (e) {}
    }

    // Game-show "wrong answer" buzzer: two clashing detuned saws that slide
    // down at the end for that deflating "ahhght".
    function buzzer() {
      ensure();
      const t = ctx.currentTime;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.3, t + 0.02);
      g.gain.setValueAtTime(0.3, t + 0.32);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      lp.connect(g); g.connect(master);
      [150, 159].forEach(f0 => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.setValueAtTime(f0, t + 0.3);
        o.frequency.linearRampToValueAtTime(f0 * 0.85, t + 0.55);
        o.connect(lp);
        o.start(t); o.stop(t + 0.6);
      });
    }

    return {
      noteOn, noteOff, allOff, buzzer, unlock,
      setInstrument(name) { instrument = name === 'cello' ? 'cello' : 'piano'; },
      setFifth(on) { fifthOn = !!on; },
    };
  }

  return {
    FIFTH_RATIO, midiToFreq, pitchToMidi, midiToName,
    playSequence, stopSequence, currentTime,
    createInstrument, instruments: { cello },
    createDrone, createPolySynth, resume: resumeCtxs,
  };
})();
