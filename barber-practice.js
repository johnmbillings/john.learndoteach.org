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
// Six measures are on the page so far — III, mm 3–8 — and that is the scale
// the decision above was made at. Their engraving lives in
// tools/scores/barber.ly, kept apart from the public-domain sources for the
// same reason; the two describe the same bars and have to be edited together.
//
// The movement headings below are Barber's own, and are facts about the work
// rather than any of its music.
//
// Wrapped in a function so the note builders it borrows from Practice stay
// inside it: practice.js declares the same names at the top level, and two
// scripts on one page share that scope.

(() => {
  const { rest, chord } = Practice;

  // III counts in sixths of a beat rather than sixteenths: m 3 puts a triplet
  // against straight eighths, and a unit has to divide both. So an eighth is 3
  // units, a triplet eighth 2, a quarter 6 — see `unitsPerBeat` below, which is
  // what the engine counts by. The plain `eighth()` and `sixteenth()` builders
  // are hard-wired to the sixteenth grid and would be wrong here, so this file
  // takes only the two builders that spell their duration out.
  //
  // Every double stop in these bars has A2 on top and only the note under it
  // moves — E2 through mm 3–6, down a step to D2 in m 8. m 7 is the exception:
  // two single notes, no stop at all.
  const stop = (units, under) => chord(units, under, 'A2');
  const single = (units, pitch) => chord(units, pitch);

  Practice.start({
    id: 'barber',
    title: 'Barber — Violin Concerto, Op. 14, cello',
    shortTitle: 'barber',
    sourceNote: 'Barber, <i>Concerto for Violin and Orchestra</i>, Op. 14 (1939) — '
      + 'the orchestra cello part, rented from G. Schirmer. the concerto is still '
      + 'in copyright, so what is here is six measures read off the part on your '
      + 'stand — a phrase to drill before a rehearsal, and no more than that.',
    movements: [
      { id: 'i-allegro', name: 'I. Allegro' },
      { id: 'ii-andante', name: 'II. Andante' },
      {
        id: 'iii-presto',
        name: 'III. Presto in moto perpetuo',
        tempo: '♩ = 192',
        targetBpm: 192,
        meter: '4/4',
        clef: 'bass',
        unitsPerBeat: 6,      // a quarter is the beat; the unit is a sixth of it
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
              stop(3, 'E2'), rest(3),             // beat 1: sf, then an eighth rest
              rest(2), rest(2), stop(2, 'E2'),    // beat 2: the triplet, pp on its 3rd
              rest(6),                            // beat 3: a quarter rest
              stop(3, 'E2'), rest(3),             // beat 4: the stop, then a rest
          ] },
          // m 4 is the bar in plain eighths: eight of them, and only the third
          // and the seventh sound — squarely on beats 2 and 4. Both bars answer
          // on those two beats, but m 3 pushes its beat-2 entry to the last
          // third of the triplet, late, and m 4 puts it on the beat. Beat 4 is
          // in the same place in both, which is what makes the difference on
          // beat 2 something you can hear rather than count.
          { n: 4, notes: [
              rest(3), rest(3), stop(3, 'E2'), rest(3),   // the 3rd eighth sounds
              rest(3), rest(3), stop(3, 'E2'), rest(3),   // and the 7th
          ] },
          // mm 5 and 6 are identical, and move the answer once more: onto beats
          // 1 and 3, both square on the beat. Across the four bars the entry
          // walks — late in beat 2, then on beat 2, then on beat 1 — while the
          // stop under it never changes. There is nothing here to find with the
          // left hand, only a place to be, which is why the bars are worth
          // looping as a run rather than one at a time.
          ...[5, 6].map(n => ({ n, notes: [
              stop(3, 'E2'), rest(3), rest(3), rest(3),   // beat 1, then nothing
              stop(3, 'E2'), rest(3), rest(3), rest(3),   // beat 3, the same again
          ] })),
          // m 7 keeps that rhythm and drops the double stop: two single notes,
          // E2 on beat 1 and F2 on beat 3 — a half step, the smallest move in
          // the passage and the one most easily played flat. With the A2 gone
          // there is no open-ish anchor above it either, so the semitone is
          // exposed.
          { n: 7, notes: [
              single(3, 'E2'), rest(3), rest(3), rest(3),   // beat 1
              single(3, 'F2'), rest(3), rest(3), rest(3),   // beat 3, a half step up
          ] },
          // m 8 goes back to m 3's rhythm — the triplet, its late entry and
          // all — under a different stop: A2 stays on top and the note beneath
          // drops from E2 to D2, so the fourth becomes a fifth. Coming after
          // four bars of the same stop, that is the bar where the left hand has
          // something to do again, and it arrives on the rhythm that was hardest
          // to place the first time.
          { n: 8, notes: [
              stop(3, 'D2'), rest(3),             // beat 1
              rest(2), rest(2), stop(2, 'D2'),    // beat 2: the triplet's late entry
              rest(6),                            // beat 3
              stop(3, 'D2'), rest(3),             // beat 4
          ] },
        ],
      },
    ],
  });

})();
