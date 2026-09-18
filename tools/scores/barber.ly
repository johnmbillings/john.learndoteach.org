\version "2.24.0"

%% Passage source for barber.html — Barber, Violin Concerto Op. 14, the
%% orchestra cello part, read off the rented G. Schirmer part.
%%
%% THE CONCERTO IS IN COPYRIGHT (published 1941, protected into the late
%% 2030s in the US and longer in Europe), which is why it sits in a file of
%% its own rather than alongside the public-domain Stravinsky in
%% measure-practice.ly: what is engraved here is a reproduction of a rented
%% part on a public website, and whoever adds to it should keep the answer
%% small. What is here is one measure of III and ten bars of I — passages
%% drilled for a rehearsal, not a movement published.
%%
%% Written in **absolute octaves** so each measure stands alone when the
%% builder slices it, and **one measure per line** — the builder splits a
%% block by line, so a stray line break adds a measure. See the
%% score-workflow skill.

%% --- III. Presto in moto perpetuo, m 3 --------------------------------------
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
%% No accidentals anywhere — the movement is signed for A minor / C.

presto = \absolute {
  \clef "bass"
  \time 4/4
  \set Staff.midiInstrument = "cello"
  \autoBeamOff

  <e, a,>8-.\sf ^\markup { \italic "senza sord." } r8 \tuplet 3/2 { r8 r8 <e, a,>8-.\pp } r4 <e, a,>8-. r8 |
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


\score {
  \presto
  \layout { }
}
