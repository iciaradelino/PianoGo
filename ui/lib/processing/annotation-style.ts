export const namingSystems = ["solfege", "letters"] as const;
export const labelSizes = ["small", "medium", "large"] as const;
export const labelColors = [
  "blue",
  "red",
  "green",
  "purple",
  "orange",
  "black",
] as const;
export const letterCases = ["lower", "capitalized", "upper"] as const;
export const labelPositions = ["beside", "below"] as const;

export type NamingSystem = (typeof namingSystems)[number];
export type LabelSize = (typeof labelSizes)[number];
export type LabelColor = (typeof labelColors)[number];
export type LetterCase = (typeof letterCases)[number];
export type LabelPosition = (typeof labelPositions)[number];

export type AnnotationStyle = {
  naming: NamingSystem;
  size: LabelSize;
  color: LabelColor;
  letterCase: LetterCase;
  position: LabelPosition;
  showOctave: boolean;
};

export const defaultAnnotationStyle: AnnotationStyle = {
  naming: "solfege",
  size: "medium",
  color: "blue",
  letterCase: "lower",
  position: "beside",
  showOctave: false,
};

export const labelColorValues: Record<LabelColor, string> = {
  blue: "#2563eb",
  red: "#dc2626",
  green: "#15803d",
  purple: "#7c3aed",
  orange: "#c2410c",
  black: "#18181b",
};

// Font sizes are in score units, where one staff space is 10.
export const labelFontSizes: Record<LabelSize, number> = {
  small: 8,
  medium: 10,
  large: 13,
};

function pick<T extends string>(
  options: readonly T[],
  value: unknown,
  fallback: T,
): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

/** Turns untrusted JSON into a complete style, filling gaps with defaults. */
export function parseAnnotationStyle(value: unknown): AnnotationStyle {
  const record =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const fallback = defaultAnnotationStyle;
  return {
    naming: pick(namingSystems, record.naming, fallback.naming),
    size: pick(labelSizes, record.size, fallback.size),
    color: pick(labelColors, record.color, fallback.color),
    letterCase: pick(letterCases, record.letterCase, fallback.letterCase),
    position: pick(labelPositions, record.position, fallback.position),
    showOctave:
      typeof record.showOctave === "boolean"
        ? record.showOctave
        : fallback.showOctave,
  };
}
