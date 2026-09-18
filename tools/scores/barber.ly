\version "2.24.0"

%% Passage source for barber.html — Barber, Violin Concerto Op. 14, the
%% orchestra cello part, read off the rented G. Schirmer part.
%%
%% THE CONCERTO IS IN COPYRIGHT (published 1941, protected into the late
%% 2030s in the US and longer in Europe), which is why it sits in a file of
%% its own rather than alongside the public-domain Stravinsky in
%% measure-practice.ly: what is engraved here is a reproduction of a rented
%% part on a public website, and whoever adds to it should keep the answer
%% small. Six measures are what is here — a phrase drilled for a rehearsal,
%% not a movement published.
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

\score {
  \presto
  \layout { }
}
