import type { AnnotationStyle } from "@/lib/processing/annotation-style";

// Names keyed by the semitone of the natural note (C = 0 ... B = 11),
// which is how MusicXML steps and OSMD's NoteEnum are numbered.
const SOLFEGE_NAMES: Record<number, string> = {
  0: "do",
  2: "re",
  4: "mi",
  5: "fa",
  7: "sol",
  9: "la",
  11: "si",
};

const LETTER_NAMES: Record<number, string> = {
  0: "c",
  2: "d",
  4: "e",
  5: "f",
  7: "g",
  9: "a",
  11: "b",
};

const ACCIDENTAL_SIGNS: Record<number, string> = {
  [-2]: "𝄫",
  [-1]: "♭",
  0: "",
  1: "♯",
  2: "𝄪",
};

type NoteNameOptions = Pick<
  AnnotationStyle,
  "naming" | "letterCase" | "showOctave"
>;

const defaultOptions: NoteNameOptions = {
  naming: "solfege",
  letterCase: "lower",
  showOctave: false,
};

function applyCase(name: string, letterCase: AnnotationStyle["letterCase"]) {
  if (letterCase === "upper") return name.toLocaleUpperCase();
  if (letterCase === "capitalized") {
    return name.charAt(0).toLocaleUpperCase() + name.slice(1);
  }
  return name;
}

/**
 * Names a written note, keeping its spelling: a B flat is "si♭", not "la♯".
 * `octave` is the scientific octave (middle C is do4). Returns null for a step
 * that is not a natural note.
 */
export function noteName(
  naturalSemitone: number,
  alterHalfTones = 0,
  octave?: number,
  options: NoteNameOptions = defaultOptions,
) {
  const names = options.naming === "letters" ? LETTER_NAMES : SOLFEGE_NAMES;
  const base = names[naturalSemitone];
  if (!base) return null;

  const accidental = ACCIDENTAL_SIGNS[Math.round(alterHalfTones)] ?? "";
  const octaveText =
    options.showOctave && octave !== undefined ? String(octave) : "";
  return applyCase(base, options.letterCase) + accidental + octaveText;
}
