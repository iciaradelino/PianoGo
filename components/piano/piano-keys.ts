const NAMES = [
  "do",
  "do♯",
  "re",
  "re♯",
  "mi",
  "fa",
  "fa♯",
  "sol",
  "sol♯",
  "la",
  "la♯",
  "si",
] as const;
const BLACK_PITCHES = new Set([1, 3, 6, 8, 10]);
export const FIRST_MIDI = 21;
const LAST_MIDI = 108;
export const WHITE_KEYS_PER_OCTAVE = 7;

export type PianoKey = {
  midi: number;
  name: (typeof NAMES)[number];
  label: string;
  octave: number;
  isBlack: boolean;
  whiteIndex: number;
};

function createPianoKeys(): PianoKey[] {
  let whiteIndex = 0;

  return Array.from({ length: LAST_MIDI - FIRST_MIDI + 1 }, (_, index) => {
    const midi = FIRST_MIDI + index;
    const pitchIndex = midi % 12;
    const name = NAMES[pitchIndex];
    const octave = Math.floor(midi / 12) - 1;
    const isBlack = BLACK_PITCHES.has(pitchIndex);
    const key = {
      midi,
      name,
      label: `${name}${octave}`,
      octave,
      isBlack,
      whiteIndex: isBlack ? whiteIndex - 1 : whiteIndex,
    };

    if (!isBlack) whiteIndex += 1;
    return key;
  });
}

export const PIANO_KEYS = createPianoKeys();
export const WHITE_KEYS = PIANO_KEYS.filter((key) => !key.isBlack);
export const BLACK_KEYS = PIANO_KEYS.filter((key) => key.isBlack);
export const MIDDLE_WHITE_INDEX = WHITE_KEYS.findIndex((key) => key.midi === 60);

export function clampWindow(start: number, visibleCount: number) {
  return Math.min(Math.max(start, 0), WHITE_KEYS.length - visibleCount);
}

/** Whether a key shows in the window of white keys starting at `start`. */
export function inWindow(key: PianoKey, start: number, visibleCount: number) {
  // A black key needs the white key on its right in view as well.
  const last = key.isBlack ? start + visibleCount - 1 : start + visibleCount;
  return key.whiteIndex >= start && key.whiteIndex < last;
}
