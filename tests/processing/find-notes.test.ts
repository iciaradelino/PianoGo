import {
  diatonicAt,
  emptyContext,
  findNotes,
  stepIndexOf,
  TREBLE,
} from "@/lib/processing/pdf/find-notes";
import type { PageContent, PlacedGlyph, Segment } from "@/lib/processing/pdf/read-page";

// One staff space is 6 points, so a step (half a space) is 3.
const SPACE = 6;
const NOTEHEAD = 0xe0a4;
const G_CLEF = 0xe050;
const F_CLEF = 0xe062;
const SHARP = 0xe262;
const FLAT = 0xe260;

function staffLines(top: number): Segment[] {
  return [0, 1, 2, 3, 4].map((line) => ({
    start: 10,
    end: 500,
    at: top + line * SPACE,
    thickness: 0.5,
  }));
}

function glyph(codepoint: number, x: number, y: number, width = 8): PlacedGlyph {
  return { font: "Leland", glyphName: null, codepoint, x, y, width, size: 24 };
}

/** y of a step above the bottom line of a staff. */
function on(bottom: number, step: number) {
  return bottom - (step * SPACE) / 2;
}

function page(parts: Partial<PageContent>): PageContent {
  return { width: 600, height: 800, glyphs: [], horizontal: [], vertical: [], ...parts };
}

function names(notes: { step: string; alter: number; octave: number; measure: number }[]) {
  return notes.map(
    (note) =>
      `${note.step}${note.alter > 0 ? "#" : note.alter < 0 ? "b" : ""}${note.octave}@${note.measure}`,
  );
}

// A piano system: treble staff with lines at 100-124, bass staff at 160-184.
const TREBLE_BOTTOM = 124;
const BASS_BOTTOM = 184;

const pianoSystem = page({
  horizontal: [...staffLines(100), ...staffLines(160)],
  vertical: [
    // Barlines through both staves.
    { start: 100, end: 184, at: 200, thickness: 1 },
    { start: 100, end: 184, at: 490, thickness: 1 },
    // A stem as tall as the staff, ending on the notehead at x = 60.
    { start: 100, end: 124, at: 68, thickness: 0.8 },
  ],
  glyphs: [
    glyph(G_CLEF, 15, on(TREBLE_BOTTOM, 2), 10),
    glyph(SHARP, 30, on(TREBLE_BOTTOM, 8)), // key signature: F sharp
    glyph(NOTEHEAD, 60, on(TREBLE_BOTTOM, 0)), // E4
    glyph(NOTEHEAD, 80, on(TREBLE_BOTTOM, 4)), // B4
    glyph(NOTEHEAD, 100, on(TREBLE_BOTTOM, 8)), // F5, sharp from the key
    glyph(FLAT, 120, on(TREBLE_BOTTOM, 0)),
    glyph(NOTEHEAD, 130, on(TREBLE_BOTTOM, 0)), // E flat 4
    glyph(NOTEHEAD, 150, on(TREBLE_BOTTOM, 0)), // still E flat in this bar
    glyph(NOTEHEAD, 220, on(TREBLE_BOTTOM, 0)), // E4 again after the barline
    glyph(F_CLEF, 15, on(BASS_BOTTOM, 6), 10),
    glyph(NOTEHEAD, 60, on(BASS_BOTTOM, 6)), // F3
    glyph(NOTEHEAD, 220, on(BASS_BOTTOM, 0)), // G2
    glyph(NOTEHEAD, 60, 400), // far below every staff: ignored
    glyph(0x41, 300, 50), // text
  ],
});

describe("pitch helpers", () => {
  it("counts diatonic steps from the clef's own line", () => {
    expect(diatonicAt(TREBLE, 2)).toBe(4 * 7 + 4); // G4
    expect(diatonicAt(TREBLE, 0)).toBe(4 * 7 + 2); // E4
    expect(diatonicAt({ letter: "F", octaveShift: 0, step: 6 }, 0)).toBe(2 * 7 + 4); // G2
    expect(diatonicAt({ letter: "C", octaveShift: 0, step: 4 }, 4)).toBe(4 * 7); // C4
    expect(diatonicAt({ letter: "G", octaveShift: -1, step: 2 }, 2)).toBe(3 * 7 + 4); // G3
  });

  it("wraps step indexes, including below C0", () => {
    expect(stepIndexOf(0)).toBe(0);
    expect(stepIndexOf(34)).toBe(6);
    expect(stepIndexOf(-1)).toBe(6);
  });
});

describe("findNotes", () => {
  const result = findNotes(pianoSystem, emptyContext());

  it("finds both staves", () => {
    expect(result.staves.map((staff) => [staff.top, staff.bottom, staff.space])).toEqual([
      [100, 124, 6],
      [160, 184, 6],
    ]);
  });

  it("names notes through clefs, key signature and accidentals in the bar", () => {
    expect(names(result.notes)).toEqual([
      "E4@1",
      "B4@1",
      "F#5@1",
      "Eb4@1",
      "Eb4@1",
      "E4@2",
      "F3@1",
      "G2@2",
    ]);
  });

  it("places each label box on its notehead", () => {
    expect(result.notes[0]).toMatchObject({
      x: 60,
      y: TREBLE_BOTTOM - SPACE / 2,
      width: 8,
      height: SPACE,
      staffSpace: SPACE,
      staffBottom: TREBLE_BOTTOM,
    });
  });

  it("carries clefs, keys and the bar count over to the next page", () => {
    expect(result.context.measure).toBe(3);
    expect(result.context.clefs.map((clef) => clef.letter)).toEqual(["G", "F"]);

    const next = findNotes(
      page({
        horizontal: staffLines(100),
        glyphs: [glyph(NOTEHEAD, 60, on(TREBLE_BOTTOM, 8))],
      }),
      result.context,
    );
    expect(names(next.notes)).toEqual(["F#5@3"]);
  });

  it("reads a change of key signature after a barline", () => {
    const content = page({
      horizontal: staffLines(100),
      vertical: [{ start: 100, end: 124, at: 200, thickness: 1 }],
      glyphs: [
        glyph(G_CLEF, 15, on(TREBLE_BOTTOM, 2), 10),
        glyph(NOTEHEAD, 60, on(TREBLE_BOTTOM, 4)), // B4
        glyph(FLAT, 205, on(TREBLE_BOTTOM, 4)), // new key: B flat
        glyph(NOTEHEAD, 260, on(TREBLE_BOTTOM, 4)), // B flat 4
      ],
    });
    expect(names(findNotes(content, emptyContext()).notes)).toEqual(["B4@1", "Bb4@2"]);
  });

  it("finds nothing on a page without staves, such as a scan", () => {
    const empty = findNotes(
      page({ glyphs: [glyph(NOTEHEAD, 60, 100)], horizontal: staffLines(100).slice(0, 3) }),
      emptyContext(),
    );
    expect(empty.staves).toEqual([]);
    expect(empty.notes).toEqual([]);
  });

  it("joins a staff line drawn in several pieces", () => {
    const split = staffLines(100).flatMap((line) => [
      { ...line, end: 250 },
      { ...line, start: 250, at: line.at + 0.1 },
    ]);
    const joined = findNotes(page({ horizontal: split }), emptyContext());
    expect(joined.staves).toHaveLength(1);
    expect(joined.staves[0].left).toBe(10);
    expect(joined.staves[0].right).toBe(500);
  });
});
