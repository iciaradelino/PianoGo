import { noteName } from "@/lib/processing/solfege";

describe("noteName", () => {
  it("names natural notes in lower-case solfège by default", () => {
    expect([0, 2, 4, 5, 7, 9, 11].map((semitone) => noteName(semitone))).toEqual([
      "do",
      "re",
      "mi",
      "fa",
      "sol",
      "la",
      "si",
    ]);
  });

  it("keeps the written spelling of accidentals", () => {
    expect(noteName(11, -1)).toBe("si♭");
    expect(noteName(5, 1)).toBe("fa♯");
    expect(noteName(0, 2)).toBe("do𝄪");
    expect(noteName(4, -2)).toBe("mi𝄫");
    expect(noteName(7, 0)).toBe("sol");
  });

  it("returns null for a semitone that is not a natural note", () => {
    expect(noteName(1)).toBeNull();
    expect(noteName(12)).toBeNull();
  });

  it("applies the naming, case and octave options", () => {
    const letters = { naming: "letters", showOctave: true } as const;
    expect(noteName(0, 0, 4, { ...letters, letterCase: "upper" })).toBe("C4");
    expect(noteName(9, -1, 3, { ...letters, letterCase: "lower" })).toBe("a♭3");
    expect(
      noteName(7, 1, 5, { naming: "solfege", letterCase: "capitalized", showOctave: true }),
    ).toBe("Sol♯5");
    expect(
      noteName(7, 0, undefined, { naming: "solfege", letterCase: "upper", showOctave: true }),
    ).toBe("SOL");
  });

  it("ignores accidentals it has no sign for", () => {
    expect(noteName(0, 3)).toBe("do");
  });
});
