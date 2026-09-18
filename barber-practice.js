// Barber, Violin Concerto Op. 14, cello part — the music for barber.html.
// The engine is practice.js; this file is only the notes.
//
// There are no notes in it yet, and getting them is not the usual problem of
// finding time to transcribe.
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
// The movement headings below are Barber's own, and are facts about the work
// rather than any of its music.
//
// Wrapped in a function so the note builders it borrows from Practice stay
// inside it: practice.js declares the same names at the top level, and two
// scripts on one page share that scope.

(() => {
  const { eighth, sixteenth, rest, eighthRest, chord } = Practice;

  Practice.start({
    id: 'barber',
    title: 'Barber — Violin Concerto, Op. 14, cello',
    shortTitle: 'barber',
    sourceNote: 'Barber, <i>Concerto for Violin and Orchestra</i>, Op. 14 (1939) — '
      + 'the orchestra cello part, rented from G. Schirmer. the concerto is still '
      + 'in copyright, so nothing of it is reproduced here: any measures added to '
      + 'this page have to be read off the part on your stand, and kept short.',
    movements: [
      { id: 'i-allegro', name: 'I. Allegro' },
      { id: 'ii-andante', name: 'II. Andante' },
      { id: 'iii-presto', name: 'III. Presto in moto perpetuo' },
    ],
  });

})();
