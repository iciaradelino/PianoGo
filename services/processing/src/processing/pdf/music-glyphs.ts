/**
 * Recognises the music-font glyphs that matter for naming notes: noteheads,
 * clefs and accidentals. Notation programs embed their music font in the PDF,
 * and each font family identifies its symbols in one of three ways:
 *
 * - SMuFL codepoints (MuseScore 3/4, Dorico, newer Finale; Bravura, Leland…)
 * - MuseScore 2's "MScore" font, which uses older Emmentaler codepoints
 * - LilyPond's Emmentaler font, whose subsets keep glyph names but renumber
 *   the character codes in every file
 */

export type ClefLetter = "G" | "F" | "C";

export type MusicSymbol =
  | { kind: "notehead" }
  | { kind: "clef"; letter: ClefLetter; octaveShift: number }
  | { kind: "accidental"; alter: number };

type SymbolTable = Record<number, MusicSymbol>;

const notehead: MusicSymbol = { kind: "notehead" };

function clef(letter: ClefLetter, octaveShift = 0): MusicSymbol {
  return { kind: "clef", letter, octaveShift };
}

function accidental(alter: number): MusicSymbol {
  return { kind: "accidental", alter };
}

// https://w3c.github.io/smufl/latest/tables/
const SMUFL: SymbolTable = {
  0xe0a0: notehead, // noteheadDoubleWhole
  0xe0a2: notehead, // noteheadWhole
  0xe0a3: notehead, // noteheadHalf
  0xe0a4: notehead, // noteheadBlack
  0xe050: clef("G"),
  0xe051: clef("G", -2), // gClef15mb
  0xe052: clef("G", -1), // gClef8vb
  0xe053: clef("G", 1), // gClef8va
  0xe054: clef("G", 2), // gClef15ma
  0xe07a: clef("G"), // gClefChange
  0xe05c: clef("C"),
  0xe05d: clef("C", -1), // cClef8vb
  0xe07b: clef("C"), // cClefChange
  0xe062: clef("F"),
  0xe063: clef("F", -2), // fClef15mb
  0xe064: clef("F", -1), // fClef8vb
  0xe065: clef("F", 1), // fClef8va
  0xe066: clef("F", 2), // fClef15ma
  0xe07c: clef("F"), // fClefChange
  0xe260: accidental(-1),
  0xe261: accidental(0),
  0xe262: accidental(1),
  0xe263: accidental(2),
  0xe264: accidental(-2),
};

// MuseScore 2.x fonts/mscore/glyphnames.json
const MSCORE_2: SymbolTable = {
  0xe12a: notehead, // noteheadDoubleWhole
  0xe12b: notehead, // noteheadWhole
  0xe12c: notehead, // noteheadHalf
  0xe12d: notehead, // noteheadBlack
  0xe19e: clef("G"),
  0xe1d7: clef("G", -1), // gClef8vb
  0xe1d8: clef("G", 1), // gClef8va
  0xe19c: clef("F"),
  0xe1db: clef("F", -1), // fClef8vb
  0xe19a: clef("C"),
  0xe114: accidental(-1),
  0xe113: accidental(0),
  0xe10e: accidental(1),
  0xe11c: accidental(2),
  0xe11a: accidental(-2),
};

// LilyPond glyph names. Older releases number accidentals in quarter tones.
const LILYPOND: Record<string, MusicSymbol> = {
  "noteheads.sM1": notehead,
  "noteheads.s0": notehead,
  "noteheads.s1": notehead,
  "noteheads.s2": notehead,
  "clefs.G": clef("G"),
  "clefs.G_change": clef("G"),
  "clefs.F": clef("F"),
  "clefs.F_change": clef("F"),
  "clefs.C": clef("C"),
  "clefs.C_change": clef("C"),
  "accidentals.flat": accidental(-1),
  "accidentals.M2": accidental(-1),
  "accidentals.natural": accidental(0),
  "accidentals.0": accidental(0),
  "accidentals.sharp": accidental(1),
  "accidentals.2": accidental(1),
  "accidentals.doublesharp": accidental(2),
  "accidentals.4": accidental(2),
  "accidentals.flatflat": accidental(-2),
  "accidentals.M4": accidental(-2),
};

const CODEPOINT_TABLES = [SMUFL, MSCORE_2];

export type FontGlyph = {
  font: string;
  glyphName: string | null;
  codepoint: number | null;
};

/**
 * Some codepoints mean different symbols in SMuFL and in MuseScore 2's font,
 * so each font is matched to whichever table recognises more of its glyphs.
 */
function tableForFont(glyphs: FontGlyph[]) {
  let best: SymbolTable | null = null;
  let bestScore = 0;
  for (const table of CODEPOINT_TABLES) {
    const score = glyphs.filter(
      (glyph) => glyph.codepoint !== null && table[glyph.codepoint],
    ).length;
    if (score > bestScore) {
      best = table;
      bestScore = score;
    }
  }
  return best;
}

/** Identifies every glyph, returning null for anything that is not needed. */
export function identifyGlyphs(glyphs: FontGlyph[]): (MusicSymbol | null)[] {
  const byFont = new Map<string, FontGlyph[]>();
  for (const glyph of glyphs) {
    const list = byFont.get(glyph.font) ?? [];
    list.push(glyph);
    byFont.set(glyph.font, list);
  }

  const tables = new Map<string, SymbolTable | null>();
  for (const [font, fontGlyphs] of byFont) {
    tables.set(font, tableForFont(fontGlyphs));
  }

  return glyphs.map((glyph) => {
    if (glyph.glyphName && LILYPOND[glyph.glyphName]) {
      return LILYPOND[glyph.glyphName];
    }
    const table = tables.get(glyph.font);
    if (!table || glyph.codepoint === null) return null;
    return table[glyph.codepoint] ?? null;
  });
}
