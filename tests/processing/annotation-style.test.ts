import {
  defaultAnnotationStyle,
  parseAnnotationStyle,
} from "@/lib/processing/annotation-style";

describe("parseAnnotationStyle", () => {
  it("keeps a complete, valid style", () => {
    const style = {
      naming: "letters",
      size: "large",
      color: "purple",
      letterCase: "upper",
      position: "below",
      showOctave: true,
    };
    expect(parseAnnotationStyle(style)).toEqual(style);
  });

  it.each([null, undefined, "blue", 42, []])(
    "falls back to the default style for %p",
    (value) => {
      expect(parseAnnotationStyle(value)).toEqual(defaultAnnotationStyle);
    },
  );

  it("replaces only the fields that are missing or invalid", () => {
    expect(
      parseAnnotationStyle({
        naming: "letters",
        size: "huge",
        color: "#ff0000",
        showOctave: "yes",
        extra: "ignored",
      }),
    ).toEqual({ ...defaultAnnotationStyle, naming: "letters" });
  });
});
