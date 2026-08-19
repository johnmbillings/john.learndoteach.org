"""Derive cello shifts for a major scale, from a neck-position hand model.

Model
-----
Strings (open, MIDI):        C2 36   G2 43   D3 50   A3 57
Closed hand, offsets from 1: 1=0  2=1  3=2  4=3        (a minor 3rd, 1 to 4)
Extended hand:               1=0  2=2  3=3  4=4        (forward extension, 1 to 2
                                                        a whole step; a major 3rd,
                                                        1 to 4)
Position n: the 1st finger sits n semitones above the open string. 4th position
is +7 (a fifth, thumb at the neck heel) — the highest we treat as a neck
position here.

Layout rule
-----------
Put the 1st finger on the tonic and take as many consecutive scale notes on that
string as one hand frame reaches; then cross to the next string, again landing
the 1st finger. Closed is preferred when it reaches — it's the relaxed frame.

Shift rule
----------
The hand arrives CLOSED, with the 1st finger over the note it's crossing to
(the extension, if the next group needs one, is a forward reach made after the
hand lands). So the finger that played the last note before the crossing slides
to where that finger sits in the arriving closed hand — and the note it lands on
is what the ear hears.
"""

STRINGS = [36, 43, 50, 57]
CLOSED = [0, 1, 2, 3]     # index 0 -> finger 1 ... index 3 -> finger 4
EXTENDED = [0, 2, 3, 4]
MAX_POS = 7               # 4th position: 1st finger a fifth above the open string
MIN_POS = 1               # half position (never an open string in this exercise)

NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
NAMES_FLAT  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

def name(m, flats=False):
    return (NAMES_FLAT if flats else NAMES_SHARP)[m % 12] + str(m // 12 - 1)

def frame_for(offsets):
    """The relaxed frame that reaches this set of offsets, or None."""
    for frame in (CLOSED, EXTENDED):
        if all(o in frame for o in offsets):
            return frame
    return None

def group_notes(notes, start_string):
    """Split ascending notes into per-string groups, each starting on finger 1.

    Depth-first with backtracking: a greedy pass can strand itself by filling a
    string so full that the next note lands on an open string (unplayable with
    the 1st finger), so try longer groups first but fall back to shorter ones.
    Returns (groups, leftover) — leftover is what no further string can take,
    which needs a shift up the same string rather than a crossing.
    """
    def reach(i, s):
        first = notes[i]
        if s >= len(STRINGS) or not (MIN_POS <= first - STRINGS[s] <= MAX_POS):
            return None
        take = [first]
        j = i + 1
        while j < len(notes) and frame_for([n - first for n in take + [notes[j]]]):
            take.append(notes[j])
            j += 1
        return take

    def walk(i, s):
        take = reach(i, s)
        if take is None:
            return None, notes[i:]
        # Longest group first; shorten only if the remainder can't be placed.
        best_leftover = None
        for n in range(len(take), 0, -1):
            head = take[:n]
            group = {'string': s, 'notes': head,
                     'frame': frame_for([x - head[0] for x in head])}
            if i + n >= len(notes):
                return [group], []
            rest, leftover = walk(i + n, s + 1)
            if rest is not None:
                return [group] + rest, leftover
            if best_leftover is None:
                best_leftover = ([group], leftover)
        return (None, notes[i:]) if best_leftover is None else best_leftover

    groups, leftover = walk(0, start_string)
    return groups, leftover

def fingers(group):
    first = group['notes'][0]
    return [group['frame'].index(n - first) + 1 for n in group['notes']]

def shifts_for(notes, start_string):
    """Per-crossing: which note the hand shifts during, and how far it drops."""
    groups, leftover = group_notes(notes, start_string)
    if groups is None:
        return None, None, leftover
    out = []
    for g, nxt in zip(groups, groups[1:]):
        last = g['notes'][-1]
        guide = fingers(g)[-1]                       # the finger that played it
        arrival_1 = nxt['notes'][0] - 7              # that hand's 1st finger, on THIS string
        ghost = arrival_1 + CLOSED[guide - 1]        # ...arriving closed
        out.append({
            'on': notes.index(last), 'note': last, 'guide': guide,
            'ghost': ghost, 'drop': last - ghost,
        })
    return groups, out, leftover


if __name__ == '__main__':
    STRNAME = ['C', 'G', 'D', 'A']
    MAJOR = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19]
    KEYS = [('C', 0, 0), ('G', 7, 0), ('D', 2, 0), ('A', 9, 0), ('E', 4, 0),
            ('B', 11, 0), ('Gb', 6, 1), ('Db', 1, 1), ('Ab', 8, 1),
            ('Eb', 3, 1), ('Bb', 10, 1), ('F', 5, 1)]

    def start_for(pc):
        """Lowest tonic at position 4-7 on the C or G string: the shape needs
        position >= 4 so the third group still lands in a neck position."""
        c = [STRINGS[s] + p for s in (0, 1) for p in range(4, MAX_POS + 1)
             if (STRINGS[s] + p) % 12 == pc]
        return min(c) if c else None

    for label, pc, flat in KEYS:
        tonic = start_for(pc)
        if tonic is None:
            print(f'{label:2} major   no tonic at position 4-7 on the C or G string; '
                  f'a cellist starts this one lower, on open strings')
            continue
        ss = 0 if 4 <= tonic - STRINGS[0] <= MAX_POS else 1
        notes = [tonic + d for d in MAJOR]
        groups, sh, leftover = shifts_for(notes, ss)
        pcs = {n % 12 for n in notes[:8]}
        print(f'\n{label:2} major   1st finger on {name(tonic, flat)}, '
              f'{STRNAME[ss]} string, position +{tonic - STRINGS[ss]}')
        for g in groups or []:
            frame = 'extended' if g['frame'] is EXTENDED else 'closed  '
            print('     %s string  +%-2d %s  %s' % (
                STRNAME[g['string']], g['notes'][0] - STRINGS[g['string']], frame,
                ' '.join(f'{name(n, flat)}({f})' for n, f in zip(g['notes'], fingers(g)))))
        if leftover:
            print('     needs a shift UP the same string:',
                  ' '.join(name(n, flat) for n in leftover))
        for x in sh or []:
            tag = 'OUTSIDE the key' if x['ghost'] % 12 not in pcs else 'in the key'
            print(f'     index {x["on"]}: shift on {name(x["note"], flat)} (finger '
                  f'{x["guide"]}), down {x["drop"]} to {name(x["ghost"], flat)}  [{tag}]')
