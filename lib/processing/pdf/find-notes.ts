import { identifyGlyphs, type ClefLetter } from "./music-glyphs";
import type { PageContent, PlacedGlyph, Segment } from "./read-page";

/**
 * Turns the glyphs and lines of one page into named notes.
 *
 * Pitch comes from where a notehead sits on its staff, measured in half staff
 * spaces ("steps") up from the bottom line, read through the clef before it,
 * the key signature and any accidental earlier in the same bar.
 */

export const STEPS = ["C", "D", "E", "F", "G", "A", "B"] as const;
export type Step = (typeof STEPS)[number];

/** Semitones above C of each natural note, as `noteName` expects. */
export const STEP_SEMITONES: Record<Step, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

export type PdfNote = {
  /** Notehead box in page points, origin at the top left. */
  x: number;
  y: number;
  width: number;
  height: number;
  staffSpace: number;
  /** Bottom line of the note's staff, for labels placed under it. */
  staffBottom: number;
  step: Step;
  alter: number;
  octave: number;
  measure: number;
};

type Staff = {
  top: number;
  bottom: number;
  space: number;
  left: number;
  right: number;
  barlines: number[];
};

type Clef = { letter: ClefLetter; octaveShift: number; step: number };
type Key = Map<number, number>;

/** What carries over from one system, or page, to the next. */
export type ScoreContext = {
  clefs: Clef[];
  keys: Key[];
  measure: number;
};

export function emptyContext(): ScoreContext {
  return { clefs: [], keys: [], measure: 1 };
}

const MIN_STAFF_LINE_LENGTH = 40;
const MAX_STAFF_LINE_THICKNESS = 1.6;
const SPACING_TOLERANCE = 0.15;
const MIN_STAFF_SPACE = 2;
const MAX_STAFF_SPACE = 30;
// Ledger notes rarely sit more than six ledger lines away from their staff.
const MAX_STEPS_OUTSIDE_STAFF = 14;
// An accidental sits at most this many staff spaces left of its notehead.
const ACCIDENTAL_REACH = 5;
// Key signature symbols are packed closer together than this.
const KEY_SIGNATURE_GAP = 2.5;
const KEY_SIGNATURE_REACH = 3;
// Barline ends may overshoot the outer staff lines by their own thickness.
const BARLINE_END_TOLERANCE = 0.3;
// How far beside a notehead a stem can be attached.
const STEM_REACH = 0.3;

// Diatonic number (octave * 7 + step index) of each clef's own line.
const CLEF_PITCH: Record<ClefLetter, number> = {
  G: 4 * 7 + 4, // G4
  F: 3 * 7 + 3, // F3
  C: 4 * 7 + 0, // C4
};

const TREBLE: Clef = { letter: "G", octaveShift: 0, step: 2 };

type Line = { at: number; start: number; end: number };

function joinLines(segments: Segment[]) {
  const sorted = segments
    .filter((segment) => segment.thickness <= MAX_STAFF_LINE_THICKNESS)
    .sort((a, b) => a.at - b.at || a.start - b.start);
  const lines: Line[] = [];
  for (const segment of sorted) {
    const match = lines.find(
      (line) =>
        Math.abs(line.at - segment.at) < 0.3 &&
        segment.start <= line.end + 2 &&
        segment.end >= line.start - 2,
    );
    if (match) {
      // Weighted by length, so a tiny mark on a line cannot shift it.
      const matchLength = match.end - match.start;
      const segmentLength = segment.end - segment.start;
      const total = matchLength + segmentLength;
      if (total > 0) {
        match.at =
          (match.at * matchLength + segment.at * segmentLength) / total;
      }
      match.start = Math.min(match.start, segment.start);
      match.end = Math.max(match.end, segment.end);
    } else {
      lines.push({ at: segment.at, start: segment.start, end: segment.end });
    }
  }
  return lines
    .filter((line) => line.end - line.start >= MIN_STAFF_LINE_LENGTH)
    .sort((a, b) => a.at - b.at);
}

/** The lines of one staff run side by side and are about as long. */
function parallel(a: Line, b: Line) {
  const shared = Math.min(a.end, b.end) - Math.max(a.start, b.start);
  return shared >= 0.8 * Math.max(a.end - a.start, b.end - b.start);
}

function staffFrom(first: Line, second: Line, lines: Line[], used: Set<Line>) {
  let space = second.at - first.at;
  const group = [first, second];
  for (let k = 2; k < 5; k++) {
    const target = group[k - 1].at + space;
    const line = lines.find(
      (candidate) =>
        !used.has(candidate) &&
        Math.abs(candidate.at - target) <= SPACING_TOLERANCE * space &&
        parallel(first, candidate),
    );
    if (!line) return null;
    group.push(line);
    space = (line.at - first.at) / k;
  }
  return group;
}

/** Finds groups of five evenly spaced, parallel lines. */
function findStaves(horizontal: Segment[]): Staff[] {
  const lines = joinLines(horizontal);
  const used = new Set<Line>();
  const staves: Staff[] = [];

  for (let i = 0; i < lines.length; i++) {
    const first = lines[i];
    if (used.has(first)) continue;
    let group: Line[] | null = null;
    for (const second of lines.slice(i + 1)) {
      const space = second.at - first.at;
      if (space > MAX_STAFF_SPACE) break;
      if (space < MIN_STAFF_SPACE || used.has(second)) continue;
      if (!parallel(first, second)) continue;
      group = staffFrom(first, second, lines, used);
      if (group) break;
    }
    if (!group) continue;

    group.forEach((line) => used.add(line));
    staves.push({
      top: first.at,
      bottom: group[4].at,
      space: (group[4].at - first.at) / 4,
      left: Math.min(...group.map((line) => line.start)),
      right: Math.max(...group.map((line) => line.end)),
      barlines: [],
    });
  }
  return staves.sort((a, b) => a.top - b.top);
}

function spansStaff(segment: Segment, staff: Staff) {
  const tolerance = staff.space * 0.4;
  return (
    segment.start <= staff.top + tolerance &&
    segment.end >= staff.bottom - tolerance &&
    segment.at >= staff.left - tolerance &&
    segment.at <= staff.right + tolerance
  );
}

/** True when a notehead sits at either end of a vertical line, as on a stem. */
function endsAtNotehead(segment: Segment, heads: PlacedGlyph[], space: number) {
  return heads.some(
    (head) =>
      segment.at >= head.x - STEM_REACH * space &&
      segment.at <= head.x + head.width + STEM_REACH * space &&
      (Math.abs(head.y - segment.start) <= space ||
        Math.abs(head.y - segment.end) <= space),
  );
}

/**
 * A barline runs from the top line of a staff to the bottom line of the same
 * or a lower staff. Stems can do that too, but they end at a notehead.
 */
function findBarlines(
  staves: Staff[],
  vertical: Segment[],
  heads: PlacedGlyph[],
) {
  const barlines: Segment[] = [];
  const space = staves[0]?.space ?? 0;
  const tolerance = space * BARLINE_END_TOLERANCE;
  const near = (value: number, targets: number[]) =>
    targets.some((target) => Math.abs(value - target) <= tolerance);
  const tops = staves.map((staff) => staff.top);
  const bottoms = staves.map((staff) => staff.bottom);

  for (const segment of vertical) {
    if (!near(segment.start, tops) || !near(segment.end, bottoms)) continue;
    if (endsAtNotehead(segment, heads, space)) continue;
    barlines.push(segment);
    for (const staff of staves) {
      if (!spansStaff(segment, staff)) continue;
      const duplicate = staff.barlines.some(
        (x) => Math.abs(x - segment.at) < staff.space,
      );
      if (!duplicate) staff.barlines.push(segment.at);
    }
  }
  staves.forEach((staff) => staff.barlines.sort((a, b) => a - b));
  return barlines;
}

/** Groups staves joined by a barline into systems, top to bottom. */
function findSystems(staves: Staff[], barlines: Segment[]) {
  const systems: Staff[][] = [];
  for (const staff of staves) {
    const previous = systems.at(-1)?.at(-1);
    const joined =
      previous &&
      barlines.some(
        (segment) => spansStaff(segment, previous) && spansStaff(segment, staff),
      );
    if (joined) systems.at(-1)!.push(staff);
    else systems.push([staff]);
  }
  return systems;
}

/** Half staff spaces up from the bottom line. */
function stepOn(staff: Staff, y: number) {
  return Math.round((staff.bottom - y) / (staff.space / 2));
}

function staffFor(glyph: PlacedGlyph, staves: Staff[]) {
  let best: Staff | null = null;
  let bestDistance = Infinity;
  for (const staff of staves) {
    if (glyph.x < staff.left - staff.space || glyph.x > staff.right + staff.space) {
      continue;
    }
    const outside =
      glyph.y < staff.top
        ? staff.top - glyph.y
        : glyph.y > staff.bottom
          ? glyph.y - staff.bottom
          : 0;
    const distance = outside / (staff.space / 2);
    if (distance < bestDistance) {
      best = staff;
      bestDistance = distance;
    }
  }
  return bestDistance <= MAX_STEPS_OUTSIDE_STAFF ? best : null;
}

function diatonicAt(clef: Clef, step: number) {
  return CLEF_PITCH[clef.letter] + clef.octaveShift * 7 + (step - clef.step);
}

type Placed<T> = T & { glyph: PlacedGlyph; step: number };
type HeadItem = Placed<{ kind: "notehead"; alter: number | null }>;
type ClefItem = Placed<{ kind: "clef"; letter: ClefLetter; octaveShift: number }>;
type AccidentalItem = Placed<{ kind: "accidental"; alter: number }>;
type StaffItem = HeadItem | ClefItem | AccidentalItem;

type Event =
  | { x: number; kind: "clef"; clef: Clef }
  | { x: number; kind: "key"; accidentals: AccidentalItem[] }
  | { x: number; kind: "barline" }
  | { x: number; kind: "notehead"; head: HeadItem };

const EVENT_ORDER: Record<Event["kind"], number> = {
  barline: 0,
  clef: 1,
  key: 2,
  notehead: 3,
};

/** Gives each accidental beside a notehead to that notehead. */
function attachAccidentals(items: StaffItem[], space: number) {
  const heads = items.filter((item): item is HeadItem => item.kind === "notehead");
  const loose: AccidentalItem[] = [];
  for (const item of items) {
    if (item.kind !== "accidental") continue;
    const head = heads
      .filter(
        (candidate) =>
          candidate.step === item.step &&
          candidate.glyph.x > item.glyph.x &&
          candidate.glyph.x - item.glyph.x <= ACCIDENTAL_REACH * space,
      )
      .sort((a, b) => a.glyph.x - b.glyph.x)[0];
    if (head && head.alter === null) head.alter = item.alter;
    else if (!head) loose.push(item);
  }
  return loose;
}

/**
 * Key signatures are runs of accidentals that belong to no notehead and come
 * straight after a clef, a barline or the start of the staff.
 */
function keySignatures(
  loose: AccidentalItem[],
  staff: Staff,
  clefs: ClefItem[],
): Event[] {
  const runs: AccidentalItem[][] = [];
  for (const item of loose.sort((a, b) => a.glyph.x - b.glyph.x)) {
    const run = runs.at(-1);
    const last = run?.at(-1);
    if (
      run &&
      last &&
      item.glyph.x - (last.glyph.x + last.glyph.width) <=
        KEY_SIGNATURE_GAP * staff.space
    ) {
      run.push(item);
    } else {
      runs.push([item]);
    }
  }

  const anchors = [
    staff.left,
    ...staff.barlines,
    ...clefs.map((clef) => clef.glyph.x + clef.glyph.width),
  ];
  return runs
    .filter((run) => {
      const start = run[0].glyph.x;
      const inStaff = run.every((item) => item.step >= -3 && item.step <= 11);
      const anchored = anchors.some(
        (anchor) =>
          start >= anchor - staff.space &&
          start - anchor <= KEY_SIGNATURE_REACH * staff.space,
      );
      return inStaff && anchored;
    })
    .map((run) => ({ x: run[0].glyph.x, kind: "key", accidentals: run }));
}

function readStaff(
  staff: Staff,
  items: StaffItem[],
  context: { clef: Clef | undefined; key: Key | undefined; measure: number },
) {
  const loose = attachAccidentals(items, staff.space);
  const clefItems = items.filter((item): item is ClefItem => item.kind === "clef");
  const events: Event[] = [
    ...clefItems.map((item) => ({
      x: item.glyph.x,
      kind: "clef" as const,
      clef: { letter: item.letter, octaveShift: item.octaveShift, step: item.step },
    })),
    ...keySignatures(loose, staff, clefItems),
    // A barline at the very start of the staff begins no new bar.
    ...staff.barlines
      .filter((x) => x - staff.left > staff.space)
      .map((x) => ({ x, kind: "barline" as const })),
    ...items
      .filter((item): item is HeadItem => item.kind === "notehead")
      .map((head) => ({ x: head.glyph.x, kind: "notehead" as const, head })),
  ].sort((a, b) => a.x - b.x || EVENT_ORDER[a.kind] - EVENT_ORDER[b.kind]);

  let clef = context.clef ?? TREBLE;
  let key: Key = context.key ?? new Map();
  let measure = context.measure;
  let barAccidentals = new Map<number, number>();
  const notes: PdfNote[] = [];

  for (const event of events) {
    if (event.kind === "clef") {
      clef = event.clef;
    } else if (event.kind === "key") {
      key = new Map();
      for (const item of event.accidentals) {
        if (item.alter === 0) continue;
        const diatonic = diatonicAt(clef, item.step);
        key.set(((diatonic % 7) + 7) % 7, item.alter);
      }
    } else if (event.kind === "barline") {
      measure += 1;
      barAccidentals = new Map();
    } else {
      const { head } = event;
      const diatonic = diatonicAt(clef, head.step);
      if (head.alter !== null) barAccidentals.set(diatonic, head.alter);
      const stepIndex = ((diatonic % 7) + 7) % 7;
      const glyph = head.glyph;
      notes.push({
        x: glyph.x,
        y: glyph.y - staff.space / 2,
        width: glyph.width,
        height: staff.space,
        staffSpace: staff.space,
        staffBottom: staff.bottom,
        step: STEPS[stepIndex],
        alter: barAccidentals.get(diatonic) ?? key.get(stepIndex) ?? 0,
        octave: Math.floor(diatonic / 7),
        measure,
      });
    }
  }
  return { notes, clef, key };
}

export function findNotes(content: PageContent, context: ScoreContext) {
  const symbols = identifyGlyphs(content.glyphs);
  const heads = content.glyphs.filter(
    (_, index) => symbols[index]?.kind === "notehead",
  );
  const staves = findStaves(content.horizontal);
  const barlines = findBarlines(staves, content.vertical, heads);
  const systems = findSystems(staves, barlines);

  const itemsByStaff = new Map<Staff, StaffItem[]>();
  content.glyphs.forEach((glyph, index) => {
    const symbol = symbols[index];
    if (!symbol) return;
    const staff = staffFor(glyph, staves);
    if (!staff) return;
    const step = stepOn(staff, glyph.y);
    const item: StaffItem =
      symbol.kind === "notehead"
        ? { kind: "notehead", alter: null, glyph, step }
        : { ...symbol, glyph, step };
    const list = itemsByStaff.get(staff) ?? [];
    list.push(item);
    itemsByStaff.set(staff, list);
  });

  const notes: PdfNote[] = [];
  let { measure } = context;
  const clefs = [...context.clefs];
  const keys = [...context.keys];

  for (const system of systems) {
    let bars = 0;
    system.forEach((staff, index) => {
      const result = readStaff(staff, itemsByStaff.get(staff) ?? [], {
        clef: clefs[index],
        key: keys[index],
        measure,
      });
      notes.push(...result.notes);
      clefs[index] = result.clef;
      keys[index] = result.key;
      if (index === 0) {
        bars = staff.barlines.filter((x) => x - staff.left > staff.space).length;
      }
    });
    measure += bars;
  }

  return { notes, context: { clefs, keys, measure }, staves };
}
