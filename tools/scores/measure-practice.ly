\version "2.24.0"

%% Passage source for the measure-practice page.
%%
%% Transcribed by eye from a photograph of the printed cello part (tenor clef,
%% plate 22392) — the two "normale" measures between the col legno bars at
%% 63–64 and the col legno that resumes at 67. Written in **absolute octaves**
%% so each measure stands alone when the builder slices it.
%%
%% What the photograph shows, and what is therefore engraved here:
%%   - tenor clef, no key signature
%%   - m 65: six equal notes beamed as one group, an accent on every one,
%%           "normale" above the first note and ff marcatissimo below it
%%   - m 66: four beamed, then a single flagged note and a rest of the same
%%           value — so both measures hold six of them
%%   - the only printed accidentals are the ♯ on the second note of m 65 and
%%     the ♯ ♮ ♯ on the first three notes of m 66 (LilyPond reprints them by
%%     the same rules the edition follows)
%%
%% The printed part shows no time signature here (it is set earlier in the
%% movement), and the photograph doesn't reach far enough back to read it, so
%% the Time_signature_engraver is removed in the builder and 3/4 is used only
%% to get the bar lines in the right places: six eighths per measure, beamed
%% 6 in m 65 and 4 + 1 + rest in m 66, exactly as printed. All beams are
%% manual for that reason.
%%
%% HARD CONSTRAINT (see the score-workflow skill): one measure per line. The
%% builder splits this block by line, so a stray line break adds a measure.

measurePractice = \absolute {
  \clef "tenor"
  \time 3/4
  \set Staff.midiInstrument = "cello"
  \autoBeamOff

  f'8->^\markup { \italic "normale" } _\markup { \dynamic ff \italic "marcatissimo" } [ gis'8-> c''8-> b'8-> gis'8-> b'8-> ] |
  dis''8-> [ d''8-> gis'8-> f'8-> ] b'8-> r8 |
}

\score {
  \measurePractice
  \layout { }
}
