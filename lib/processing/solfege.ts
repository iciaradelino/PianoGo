// Fixed-do names keyed by the semitone of the natural note (C = 0 ... B = 11),
// which is how MusicXML steps and OSMD's NoteEnum are numbered.
const NATURAL_NAMES: Record<number, string> = {
  0: "do",
  2: "re",
  4: "mi",
  5: "fa",
  7: "sol",
  9: "la",
  11: "si",
};

const ACCIDENTAL_SIGNS: Record<number, string> = {
  [-2]: "𝄫",
  [-1]: "♭",
  0: "",
  1: "♯",
  2: "𝄪",
};

/**
 * Names a written note in fixed-do solfège, keeping its spelling:
 * a B flat is "si♭", not "la♯". Returns null for a step that is not a natural note.
 */
export function solfegeName(naturalSemitone: number, alterHalfTones = 0) {
  const name = NATURAL_NAMES[naturalSemitone];
  if (!name) return null;
  const alter = Math.round(alterHalfTones);
  return name + (ACCIDENTAL_SIGNS[alter] ?? "");
}
