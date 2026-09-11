\version "2.24.0"

%% Passage source for the measure-practice page.
%%
%% Stravinsky, L'Oiseau de feu (1919 suite) — Danse infernale du roi Kastcheï,
%% cello part, mm 63–68: one system of the printed part, and one phrase — col
%% legno on a hammered G♯ (63–64), the same G♯ answered normale and
%% marcatissimo (65–66), then col legno again (67–68). Edition: Nieweg /
%% McAlister, plate 22392, read from the part itself. Written in **absolute
%% octaves** so each measure stands alone when the builder slices it.
%%
%% 3/4 at ♩ = 168, set at the movement's head and unchanged here. Every bar is
%% built from the same limping cell — an eighth and two sixteenths — except the
%% two normale bars, which are straight eighths:
%%
%%   m 63   𝄾 ♬ | ♪ ♬ | ♪ ♬        the rest replaces the cell's own eighth
%%   m 64   ♪ ♬ | ♪ ♬ | ♪ 𝄾
%%   m 65   ♪ ♪ ♪ ♪ ♪ ♪            beamed as one group, accent on every note
%%   m 66   ♪ ♪ ♪ ♪ | ♪ 𝄾          four beamed, then a flagged eighth
%%   m 67   ♪ ♬ | ♪ ♬ | ♪ ♬
%%   m 68   ♪ ♬ | ♪ ♬ | ♪ 𝄾
%%
%% The col legno bars are one repeated pitch, G♯ on the first ledger line above
%% the staff; the ♯ is reprinted each bar because accidentals don't cross a bar
%% line, which LilyPond does on its own. The part marks "col legno" with a
%% dashed spanner running to the end of m 64 and again from m 67; plain text is
%% engraved here instead, since the page shows two to six bars at a time and a
%% spanner that starts off-screen says nothing.
%%
%% The part doesn't reprint the time signature anywhere in this system —
%% nothing changes — so the builder removes the Time_signature_engraver and
%% these measures look on the page the way they look in the part. Beams are
%% manual throughout: the printed grouping (the ♪♬ cell, and the six-eighth
%% beam in m 65) is not what 3/4 would do by itself.
%%
%% ONE BLOCK PER MOVEMENT. The builder renders each `<name> = \absolute {…}`
%% block listed in its PRACTICE_MOVEMENTS table into its own SVG, so a second
%% movement is a second block here and a second row there. A block carries its
%% own clef and meter (the movements don't share either), on lines of their own
%% before the music.
%%
%% HARD CONSTRAINT (see the score-workflow skill): one measure per line. The
%% builder splits a block by line — every line that ends in a bar check is a
%% measure, every other line is setup — so a stray line break adds a measure.

danseInfernale = \absolute {
  \clef "tenor"
  \time 3/4
  \set Staff.midiInstrument = "cello"
  \autoBeamOff

  r8 gis'16-.\f^\markup { \italic "col legno" } [( gis'16-.]) gis'8-.[( gis'16-. gis'16-.]) gis'8-.[( gis'16-. gis'16-.]) |
  gis'8-.[( gis'16-. gis'16-.]) gis'8-.[( gis'16-. gis'16-.]) gis'8-. r8 |
  f'8->^\markup { \italic "normale" } _\markup { \dynamic ff \italic "marcatissimo" } [ gis'8-> c''8-> b'8-> gis'8-> b'8-> ] |
  dis''8-> [ d''8-> gis'8-> f'8-> ] b'8-> r8 |
  gis'8-.\f^\markup { \italic "col legno" } [( gis'16-. gis'16-.]) gis'8-.[( gis'16-. gis'16-.]) gis'8-.[( gis'16-. gis'16-.]) |
  gis'8-.[( gis'16-. gis'16-.]) gis'8-.[( gis'16-. gis'16-.]) gis'8-. r8 |
}

\score {
  \danseInfernale
  \layout { }
}
