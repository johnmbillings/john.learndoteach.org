// L'Oiseau de feu (1919 suite), cello part — the music for measure-practice.html.
// The engine is practice.js; this file is only the notes.
//
// Edition: Nieweg / McAlister, plate 22392, read from the part. Its transcribed
// passages are engraved from tools/scores/measure-practice.ly — edit the two
// together, or the page will play something it isn't showing.
//
// Wrapped in a function so the note builders it borrows from Practice stay
// inside it: practice.js declares the same names at the top level, and two
// scripts on one page share that scope.

(() => {
  const { eighth, sixteenth, rest, eighthRest, chord } = Practice;

  // One beat of the Danse infernale's col legno figure: an eighth and two
  // sixteenths, all on the same note. Written once because the part writes it
  // fourteen times in six bars.
  const cell = (pitch) => [eighth(pitch), sixteenth(pitch), sixteenth(pitch)];

  const G = 'G#4';   // the col legno note: G♯ on the first ledger line, all four bars

  // From m 11 the part is an octave A in sixteenths: low, high, high, low to a
  // beat, over and over. Written once because the beat is the thing to learn.
  const octaveBeat = () => [sixteenth('A2'), sixteenth('A3'), sixteenth('A3'), sixteenth('A2')];

  // The movements of the suite, in playing order. `measures` is what has been
  // transcribed and checked against the part so far; the rest are listed for
  // their names and their printed tempo until someone does the reading.
  //
  // A movement that carries music also carries how to count it: `unitsPerBeat`
  // (sixteenths to a printed beat) and `beatsPerMeasure`, which drive the
  // metronome, the count-in and the bar check.
  Practice.start({
    id: 'firebird',
    title: 'Stravinsky — L’Oiseau de feu (1919 suite), cello',
    shortTitle: 'l’oiseau de feu',
    sourceNote: 'Stravinsky, <i>L’Oiseau de feu</i> (1919 suite) — cello part, '
      + 'Nieweg / McAlister edition (plate 22392), read from the part. '
      + 'transcribed measures are engraved from <code>tools/scores/measure-practice.ly</code>; '
      + 'the movements are listed as the part numbers them.',
    movements: [
    { id: 'introduction', name: 'Introduction', tempo: '♪ = 108' },
    { id: 'oiseau-et-sa-danse', name: 'L’Oiseau de feu et sa danse', tempo: '♩ = 152' },
    { id: 'variation', name: 'Variation de l’Oiseau de feu', tempo: '♩. = 76' },
    { id: 'ronde-des-princesses', name: 'Ronde des princesses', tempo: '♩ = 72' },
    {
      id: 'danse-infernale',
      name: 'Danse infernale du roi Kastcheï',
      tempo: '♩ = 168',
      targetBpm: 168,
      meter: '3/4',
      clef: 'tenor',
      unitsPerBeat: 4,      // a quarter is the printed beat; the unit is a sixteenth
      beatsPerMeasure: 3,
      // Two passages so far, and the bar numbers say which is which: the opening
      // (1–12) and the col legno phrase (63–68).
      measures: [
        // mm 1–12. One chord, nine bars of rest, and the entry — the whole
        // difficulty here is counting the nine, so they are written out one to a
        // bar rather than as the part's nine-bar multirest.
        //
        // m 1 is a three-note chord struck at once, not rolled (non arpeg.
        // possibile): A2 on the G string, G3 on the D, the open A3.
        { n: 1, notes: [chord(2, 'A2', 'G3', 'A3'), rest(2), rest(4), rest(4)] },
        ...Array.from({ length: 9 }, (unused, i) => ({ n: 2 + i, notes: [rest(12)] })),
        // The entry: the octave A struck as a double stop, sfff, then pp at once.
        { n: 11, notes: [chord(2, 'A2', 'A3'), sixteenth('A3'), sixteenth('A2'),
                         ...octaveBeat(), ...octaveBeat()] },
        { n: 12, notes: [...octaveBeat(), ...octaveBeat(), ...octaveBeat()] },

        // mm 63–68: one system of the part and one phrase — col legno on a
        // hammered G♯, the same G♯ answered normale and marcatissimo, then col
        // legno again. Nearly every beat is the same limping cell, which is what
        // makes the two normale bars of straight eighths land the way they do.
        // In m 63 the rest stands in for the cell's own eighth, so the bar still limps.
        { n: 63, notes: [eighthRest(), sixteenth(G), sixteenth(G), ...cell(G), ...cell(G)] },
        { n: 64, notes: [...cell(G), ...cell(G), eighth(G), eighthRest()] },
        { n: 65, notes: ['F4', 'G#4', 'C5', 'B4', 'G#4', 'B4'].map(eighth) },
        { n: 66, notes: [...['D#5', 'D5', 'G#4', 'F4', 'B4'].map(eighth), eighthRest()] },
        { n: 67, notes: [...cell(G), ...cell(G), ...cell(G)] },
        { n: 68, notes: [...cell(G), ...cell(G), eighth(G), eighthRest()] },
      ],
    },
    { id: 'berceuse', name: 'Berceuse', tempo: '♩ = 60' },
    { id: 'final', name: 'Final', tempo: '𝅗𝅥 = 54' },
  ],
  });

})();
