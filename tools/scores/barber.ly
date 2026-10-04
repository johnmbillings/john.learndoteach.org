\version "2.24.0"

%% Passage source for barber.html — Barber, Violin Concerto Op. 14, the
%% orchestra cello part, read off the rented G. Schirmer part.
%%
%% THE CONCERTO IS IN COPYRIGHT (published 1941, protected into the late
%% 2030s in the US and longer in Europe), which is why it sits in a file of
%% its own rather than alongside the public-domain Stravinsky in
%% measure-practice.ly: what is engraved here is a reproduction of a rented
%% part on a public website, and whoever adds to it should keep the answer
%% small. What is here is six measures of III and twelve bars of I — passages
%% drilled for a rehearsal, not a movement published.
%%
%% Written in **absolute octaves** so each measure stands alone when the
%% builder slices it, and **one measure per line** — the builder splits a
%% block by line, so a stray line break adds a measure. See the
%% score-workflow skill.

%% --- III. Presto in moto perpetuo, mm 3–8 ----------------------------------
%%
%% 4/4 at ♩ = 192, set at the movement's head and not reprinted here, so the
%% builder's removal of the Time_signature_engraver leaves the bar looking the
%% way it looks in the part. The cellos take the mutes off on this bar.
%%
%% Every note in it is the same double stop — E2 on the C string under A2 on
%% the G — struck short and let go:
%%
%%   beat 1   the stop, sf, staccato, then an eighth rest
%%   beat 2   a triplet whose first two thirds are rests: the answer comes in
%%            pp on the last one, off the beat, which is the bar's difficulty
%%   beat 3   a quarter rest
%%   beat 4   the stop again, then an eighth rest
%%
%% m 4 is the same stop again, the triplet gone: eight plain eighths, of which
%% only the third and the seventh sound — squarely on beats 2 and 4. That is
%% what the two bars drill together. Both answer on beat 2 and beat 4, but m 3
%% pushes the beat-2 entry to the last third of the triplet, late, while m 4
%% puts it on the beat. Beat 4 is in the same place in both, which is what makes
%% the difference on beat 2 audible.
%%
%% mm 5 and 6 are the same stop once more and identical to each other, the
%% answer moved again: on beats 1 and 3 now, both squarely on the beat. Read
%% across the four bars, the entry walks — late in beat 2, then on beat 2, then
%% on beat 1 — and beat 4 gives way to beat 3. The stop itself never changes,
%% which is the point: there is nothing to find with the left hand, only a place
%% to be.
%%
%% m 7 keeps mm 5–6's rhythm and drops the stop: two single notes, E2 on beat 1
%% and F2 on beat 3, a half step apart. It is the smallest move in the passage
%% and the one most easily played flat, and with the A2 gone there is nothing
%% above it to measure against.
%%
%% m 8 returns to m 3's rhythm — the triplet, its late entry and all — under a
%% different stop: A2 holds on top and the note beneath drops from E2 to D2, so
%% the fourth becomes a fifth across the C and G strings. After four bars of one
%% stop that is where the left hand has something to do again, and it lands on
%% the rhythm that was hardest to place the first time.
%%
%% Only m 3 was photographed. mm 4–8 are written from a description of their
%% rhythm and pitches, so their staccato dots are there to match m 3 rather than
%% read off the part, and the eight-eighth spelling of their rests is a reading
%% of "eight eighths" — a part would likely print an empty beat as one quarter
%% rest. No dynamic is written after m 3's pp, which holds through all of them.
%%
%% No accidentals anywhere — the movement is signed for A minor / C.

presto = \absolute {
  \clef "bass"
  \time 4/4
  \set Staff.midiInstrument = "cello"
  \autoBeamOff

  <e, a,>8-.\sf ^\markup { \italic "senza sord." } r8 \tuplet 3/2 { r8 r8 <e, a,>8-.\pp } r4 <e, a,>8-. r8 |
  r8 r8 <e, a,>8-. r8 r8 r8 <e, a,>8-. r8 |
  <e, a,>8-. r8 r8 r8 <e, a,>8-. r8 r8 r8 |
  <e, a,>8-. r8 r8 r8 <e, a,>8-. r8 r8 r8 |
  e,8-. r8 r8 r8 f,8-. r8 r8 r8 |
  <d, a,>8-. r8 \tuplet 3/2 { r8 r8 <d, a,>8-. } r4 <d, a,>8-. r8 |
}

%% --- I. Allegro, mm 50–59: rehearsal 4 to the bar before rehearsal 5 --------
%%
%% 4/4 at the movement's own tempo ("a tempo" at 50 points back at it and the
%% part prints no metronome mark here), one sharp, bass clef. Ten bars of
%% accompaniment: the cellos are unis. and pp, and the whole passage is short
%% notes with rests between them, so what has to be counted is the silence.
%%
%%   50–53  pairs of staccato eighths on the beat, a quarter rest after each
%%          pair — except m 50, which answers with four eighths instead
%%   54     the same note three times, now off the beat, under cresc. poco a poco
%%   55–59  the same shapes as double stops, the lower voice walking down
%%          A–G–F♯–F♯–F♯ under a held E and then D
%%
%% The three syncopated bars are each built from the same half-bar: a note, two
%% eighth rests and a note, beamed as one group. Where the half-bars differ is
%% how they start — m 55, 58 and 59 begin with an eighth rest and put the first
%% note on the off-beat; m 56 and 57 begin with a quarter rest and the note
%% lands a beat later. That is the thing to drill.
%%
%% The cresc. runs from m 54; the part then draws a hairpin across m 57 and a
%% subito p on the first note of m 58, and another hairpin into the bar line at
%% the end of m 59, where rehearsal 5 arrives f. The second hairpin is engraved
%% over the whole half-bar; the part draws it a little shorter, under the rests.
%%
%% Beams are manual: the part beams by the half bar, the 1941 engraving's
%% habit, which is not what 4/4 does on its own.

allegro = \absolute {
  \clef "bass"
  \key g \major
  \time 4/4
  \set Staff.midiInstrument = "cello"
  \autoBeamOff

  c8-.\pp ^\markup { \italic "unis." } ^\markup { \line { \box "4" \italic "a tempo, animando poco a poco" } } [ c8-. ] r4 a,8-. [ a,8-. d8-. d8-. ] |
  e,8-. [ e,8-. ] r4 g,8-. [ g,8-. ] r4 |
  c8-. [ c8-. ] r4 c8-. [ c8-. ] r4 |
  a,8-. [ a,8-. ] r4 a,8-. [ a,8-. ] r4 |
  c8 _\markup { \italic "cresc. poco a poco" } [ r8 r8 c8 ] r4 c8 r8 |
  r8 <a, e>8 r4 <a, e>8 [ r8 r8 <a, e>8 ] |
  r4 <g, e>8 r8 <g, e>8 [ r8 r8 <g, e>8 ] |
  r4 <fis, e>8\< r8 r8 <fis, e>8 [ <fis, e>8 ] r8 |
  r8 <fis, d>8\p r4 <fis, d>8 [ r8 r8 <fis, d>8 ] |
  r8 <fis, d>8 r4 <fis, d>8\< [ r8 r8 <fis, d>8\! ] |
}


%% --- I. Allegro, mm 113–114: two bars after rehearsal 9 --------------------
%%
%% Still 4/4 (re-set at m 110 after a bar of 3/2), "sempre animando", mf rinf.
%% No key signature: the sharp is gone by this page and returns at rehearsal 10,
%% so every flat is printed. Each bar alternates a beat of straight eighths
%% with a beat of triplet eighths:
%%
%%   113   𝄾 E♭  | C A B♭ (3) | G G  | E♭ C D (3)
%%   114   B♭ D  | G C A (3)  | D C  | A D G (3)
%%
%% The E♭ in 113 is a flagged eighth on its own; everything else is beamed by
%% the beat. Slurs as the part draws them: E♭ over the first triplet, the second
%% G over the second; in 114 the first two beats under one, D–C, and the last
%% triplet.

allegroLate = \absolute {
  \clef "bass"
  \key c \major
  \time 4/4
  \set Staff.midiInstrument = "cello"
  \autoBeamOff

  r8 ees'8\mf _\markup { \italic "rinf." } ^\markup { \italic "sempre animando" } ( \tuplet 3/2 { c'8[ a8 bes8]) } g8[ g8(] \tuplet 3/2 { ees8[ c8 d8]) } |
  bes,8[( d8] \tuplet 3/2 { g8[ c'8 a8]) } d'8[( c'8]) \tuplet 3/2 { a8[( d8 g8]) } |
}

\score {
  \presto
  \layout { }
}
