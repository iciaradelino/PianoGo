import { identifyGlyphs, type FontGlyph } from "@/lib/processing/pdf/music-glyphs";

function glyph(font: string, codepoint: number | null, glyphName: string | null = null): FontGlyph {
  return { font, codepoint, glyphName };
}

describe("identifyGlyphs", () => {
  it("reads SMuFL fonts such as Bravura and Leland", () => {
    expect(
      identifyGlyphs([
        glyph("Leland", 0xe0a4),
        glyph("Leland", 0xe050),
        glyph("Leland", 0xe052),
        glyph("Leland", 0xe262),
      ]),
    ).toEqual([
      { kind: "notehead" },
      { kind: "clef", letter: "G", octaveShift: 0 },
      { kind: "clef", letter: "G", octaveShift: -1 },
      { kind: "accidental", alter: 1 },
    ]);
  });

  it("matches each font to the table that knows most of its glyphs", () => {
    // 0xe11a is a double flat in MuseScore 2 but nothing in SMuFL; the
    // MScore font is recognised from its other glyphs.
    expect(
      identifyGlyphs([
        glyph("MScore", 0xe12d),
        glyph("MScore", 0xe19e),
        glyph("MScore", 0xe11a),
        glyph("Bravura", 0xe264),
      ]),
    ).toEqual([
      { kind: "notehead" },
      { kind: "clef", letter: "G", octaveShift: 0 },
      { kind: "accidental", alter: -2 },
      { kind: "accidental", alter: -2 },
    ]);
  });

  it("reads LilyPond glyphs by name whatever their code", () => {
    expect(
      identifyGlyphs([
        glyph("Emmentaler-20", 0x41, "noteheads.s2"),
        glyph("Emmentaler-20", 0x42, "clefs.F"),
        glyph("Emmentaler-20", 0x43, "accidentals.M2"),
      ]),
    ).toEqual([
      { kind: "notehead" },
      { kind: "clef", letter: "F", octaveShift: 0 },
      { kind: "accidental", alter: -1 },
    ]);
  });

  it("returns null for text and unknown symbols", () => {
    expect(
      identifyGlyphs([
        glyph("Times", 0x41),
        glyph("Times", null),
        glyph("Leland", 0xe0a4),
        glyph("Leland", 0xe999),
        glyph("Leland", null, "dots.dot"),
      ]),
    ).toEqual([null, null, { kind: "notehead" }, null, null]);
  });
});
