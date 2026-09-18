\version "2.24.0"

%% Passage source for barber.html — Barber, Violin Concerto Op. 14, the
%% orchestra cello part, read off the rented G. Schirmer part.
%%
%% THE CONCERTO IS IN COPYRIGHT (published 1941, protected into the late
%% 2030s in the US and longer in Europe), which is why it sits in a file of
%% its own rather than alongside the public-domain Stravinsky in
%% measure-practice.ly: what is engraved here is a reproduction of a rented
%% part on a public website, and whoever adds to it should keep the answer
%% small. Two measures are what is here — a phrase drilled for a rehearsal,
%% not a movement published.
%%
%% Written in **absolute octaves** so each measure stands alone when the
%% builder slices it, and **one measure per line** — the builder splits a
%% block by line, so a stray line break adds a measure. See the
%% score-workflow skill.

%% --- III. Presto in moto perpetuo, mm 3–4 ----------------------------------
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
%% The dynamic carries over from m 3's pp; the staccato dots are written on
%% m 4's notes to match m 3, which is an assumption about a bar that hasn't
%% been photographed, not something read off the part.
%%
%% No accidentals anywhere — the movement is signed for A minor / C.

presto = \absolute {
  \clef "bass"
  \time 4/4
  \set Staff.midiInstrument = "cello"
  \autoBeamOff

  <e, a,>8-.\sf ^\markup { \italic "senza sord." } r8 \tuplet 3/2 { r8 r8 <e, a,>8-.\pp } r4 <e, a,>8-. r8 |
  r8 r8 <e, a,>8-. r8 r8 r8 <e, a,>8-. r8 |
}

\score {
  \presto
  \layout { }
}
