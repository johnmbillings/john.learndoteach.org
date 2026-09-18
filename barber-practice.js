// Barber, Violin Concerto Op. 14, cello part — the music for barber.html.
// The engine is practice.js; this file is only the notes.
//
// THE CONCERTO IS IN COPYRIGHT. Barber finished it in 1939; it was premiered in
// 1941 and published by G. Schirmer, who still hold it — in the United States a
// work published then runs 95 years from publication, so it is protected into
// the late 2030s, and longer in Europe (Barber died in 1981). It is not on
// IMSLP and will not be. The orchestral parts are not sold at all: G. Schirmer
// rents the set to the orchestra, which is where the part on your stand came
// from.
//
// So the notes can only come off that rented part, and what goes in here is a
// decision rather than a task: this repository is a public website, and a
// transcription of a copyrighted part published on it is a copy of that part,
// however small the page. A few bars drilled for a rehearsal is one thing;
// a movement is another. Whoever adds measures here should decide how much
// belongs on a public site, and keep the answer small.
//
// What is on the page so far is III, m 3 and I, mm 50–59 — passages to drill
// before a rehearsal, which is the scale the decision above was made at. The
// engravings live in tools/scores/barber.ly, kept apart from the public-domain
// sources for the same reason; they and the notes below describe the same bars
// and have to be edited together.
//
// The movement headings below are Barber's own, and are facts about the work
// rather than any of its music.
//
// Wrapped in a function so the note builders it borrows from Practice stay
// inside it: practice.js declares the same names at the top level, and two
// scripts on one page share that scope.

(() => {
  const { eighth, eighthRest, rest, chord } = Practice;

  // The two movements don't count in the same unit, and each one's
  // `unitsPerBeat` below says which it uses.
  //
  // I is plain: a sixteenth is the unit, so `eighth()` and `eighthRest()` — which
  // are hard-wired to that grid — mean what they say. III is not: m 3 puts a
  // triplet against straight eighths, and a unit has to divide both, so a unit
  // is a sixth of a beat and an eighth is three of them. The sixteenth-grid
  // builders would be wrong there, which is why that bar is written with the
  // two that spell their duration out.
  const stop = (units) => chord(units, 'E2', 'A2');   // III's one double stop

  // I, mm 55–59 are double stops: a walking lower voice under a held upper one.
  const ds = (lower, upper) => chord(2, lower, upper);

  // The half-bar those bars are built from: the stop, two eighth rests, the
  // stop again, printed as one beamed group. What changes from bar to bar is
  // only what comes before it.
  const offbeatHalf = (lower, upper) =>
    [ds(lower, upper), eighthRest(), eighthRest(), ds(lower, upper)];

  // mm 50–53 are pairs of staccato eighths with a quarter rest after each pair.
  const pair = (pitch) => [eighth(pitch), eighth(pitch)];

  Practice.start({
    id: 'barber',
    title: 'Barber — Violin Concerto, Op. 14, cello',
    shortTitle: 'barber',
    sourceNote: 'Barber, <i>Concerto for Violin and Orchestra</i>, Op. 14 (1939) — '
      + 'the orchestra cello part, rented from G. Schirmer. the concerto is still '
      + 'in copyright, so what is here was read off the part on your stand — '
      + 'passages to drill before a rehearsal, and no more than that.',
    movements: [
      {
        id: 'i-allegro',
        name: 'I. Allegro',
        meter: '4/4',
        clef: 'bass',
        unitsPerBeat: 4,      // a quarter is the printed beat; the unit is a sixteenth
        beatsPerMeasure: 4,
        // mm 50–59: rehearsal 4 to the bar before rehearsal 5. Ten bars of
        // accompaniment under the solo — unis., pp, "a tempo, animando poco a
        // poco" — and every one of them is short notes separated by rests, so
        // what has to be counted here is the silence rather than the notes.
        //
        // The part prints no metronome mark at 50 ("a tempo" points back at the
        // movement's own), so this movement carries no printed tempo to aim at.
        measures: [
          // 50–53: pairs of staccato eighths on the beat, a quarter rest after
          // each pair. m 50 answers with four eighths instead of a second pair,
          // which is the only bar of the four that fills its second half.
          { n: 50, notes: [...pair('C3'), rest(4),
                           ...pair('A2'), ...pair('D3')] },
          { n: 51, notes: [...pair('E2'), rest(4), ...pair('G2'), rest(4)] },
          { n: 52, notes: [...pair('C3'), rest(4), ...pair('C3'), rest(4)] },
          { n: 53, notes: [...pair('A2'), rest(4), ...pair('A2'), rest(4)] },

          // 54: the same C, three times, now off the beat — the first bar of
          // the syncopation, and where cresc. poco a poco starts.
          { n: 54, notes: [eighth('C3'), eighthRest(), eighthRest(), eighth('C3'),
                           rest(4), eighth('C3'), eighthRest()] },

          // 55–59: the same off-beat half-bar, as double stops, with the lower
          // voice walking A–G–F♯–F♯–F♯ under a held E and then D. What changes
          // is how each bar *starts*, and that is the whole difficulty: 55, 58
          // and 59 begin with an eighth rest, so the first stop lands off the
          // beat; 56 and 57 begin with a quarter rest, so it lands a beat later,
          // on the second beat. 57 then breaks the pattern once more — its two
          // stops come next to each other rather than a beat apart.
          { n: 55, notes: [eighthRest(), ds('A2', 'E3'), rest(4),
                           ...offbeatHalf('A2', 'E3')] },
          { n: 56, notes: [rest(4), ds('G2', 'E3'), eighthRest(),
                           ...offbeatHalf('G2', 'E3')] },
          { n: 57, notes: [rest(4), ds('F#2', 'E3'), eighthRest(),
                           eighthRest(), ds('F#2', 'E3'), ds('F#2', 'E3'), eighthRest()] },
          { n: 58, notes: [eighthRest(), ds('F#2', 'D3'), rest(4),
                           ...offbeatHalf('F#2', 'D3')] },
          { n: 59, notes: [eighthRest(), ds('F#2', 'D3'), rest(4),
                           ...offbeatHalf('F#2', 'D3')] },
        ],
      },
      { id: 'ii-andante', name: 'II. Andante' },
      {
        id: 'iii-presto',
        name: 'III. Presto in moto perpetuo',
        tempo: '♩ = 192',
        targetBpm: 192,
        meter: '4/4',
        clef: 'bass',
        unitsPerBeat: 6,      // a quarter is the printed beat; the unit is a sixth of it
        beatsPerMeasure: 4,
        measures: [
          // m 3, where the cellos take the mutes off (senza sord.). Every note
          // in the bar is the same double stop — E2 on the C string under A2 on
          // the G — struck staccato and let go, so nothing here is a question
          // of pitch. What has to be learned is where the second one falls: the
          // bar's one triplet has rests on its first two thirds, and the answer
          // comes pp on the last of them, off the beat and quiet, between a sf
          // downbeat and a bar's worth of silence either side of it.
          { n: 3, notes: [
              stop(3), rest(3),               // beat 1: sf, then an eighth rest
              rest(2), rest(2), stop(2),      // beat 2: the triplet, pp on its third
              rest(6),                        // beat 3: a quarter rest
              stop(3), rest(3),               // beat 4: the stop again, then a rest
          ] },
        ],
      },
    ],
  });

})();
