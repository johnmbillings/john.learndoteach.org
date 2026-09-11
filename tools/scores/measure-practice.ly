\version "2.24.0"

%% Passage source for the measure-practice page.
%%
%% Stravinsky, L'Oiseau de feu (1919 suite) — Danse infernale du roi Kastcheï,
%% cello part, mm 65–66: the two "normale" measures between the col legno bars
%% at 63–64 and the col legno that resumes at 67. Edition: Nieweg / McAlister
%% (plate 22392), the same part the page's owner plays from. Written in
%% **absolute octaves** so each measure stands alone when the builder slices it.
%%
%% First read off a photograph of the part, then checked against the edition
%% itself, note for note. What the print shows, and what is engraved here:
%%   - tenor clef, no key signature
%%   - m 65: six eighths beamed as one group, an accent on every one,
%%           "normale" above the first note and ff marcatissimo below it
%%   - m 66: four beamed, then a flagged eighth and an eighth rest
%%   - the only printed accidentals are the ♯ on the second note of m 65 and
%%     the ♯ ♮ ♯ on the first three notes of m 66 (LilyPond reprints them by
%%     the same rules the edition follows)
%%
%% The movement is in 3/4 at ♩ = 168, set at its head and unchanged by here, so
%% the 3/4 below is the real meter and six eighths fill the bar. The part
%% doesn't reprint the signature at m 65 — nothing changes there — so the
%% builder removes the Time_signature_engraver and these measures look on the
%% page the way they look in the part. Beams are manual to match the printed
%% grouping (6, then 4 + 1 + rest), which the 3/4 default would otherwise
%% regroup.
%%
%% The col legno bars on either side (63–64, 67) are sixteenths, not eighths —
%% worth knowing before adding them here.
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
