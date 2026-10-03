import type { PdfPageNote } from "../pdf/extract";
import {
  diatonicAt,
  STEPS,
  stepIndexOf,
  TREBLE,
  type Clef,
  type Key,
} from "../pdf/find-notes";
import type { ClefLetter } from "../pdf/music-glyphs";
import {
  child,
  childrenNamed,
  numberAttribute,
  parseXml,
  type XmlElement,
} from "./xml";
import { readZip } from "./zip";

/**
 * Reads the notes out of an Audiveris project (.omr). Audiveris finds every
 * notehead, clef, key signature and accidental on a scanned page. Pitches are
 * worked out here the same way as for PDFs with notation fonts, and positions
 * are scaled from the image Audiveris read to the PDF page.
 */

type Box = { x: number; y: number; width: number; height: number };

type StaffInfo = { id: string; bottom: number };

type Event =
  | { x: number; kind: "clef"; clef: Clef }
  | { x: number; kind: "key"; key: Key }
  | { x: number; kind: "head"; step: number; alter: number | null; box: Box };

const EVENT_ORDER: Record<Event["kind"], number> = { clef: 0, key: 1, head: 2 };

// Accidentals, by Audiveris shape name.
const ALTERS: Record<string, number> = {
  DOUBLE_FLAT: -2,
  FLAT: -1,
  NATURAL: 0,
  SHARP: 1,
  DOUBLE_SHARP: 2,
};

// Order in which sharps (and, reversed, flats) enter a key signature.
const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"] as const;

const OCTAVE_SHIFTS: Record<string, number> = {
  "8VA": 1,
  "8VB": -1,
  "15MA": 2,
  "15MB": -2,
};

function boxOf(element: XmlElement): Box | null {
  const bounds = child(element, "bounds");
  const x = numberAttribute(bounds, "x");
  const y = numberAttribute(bounds, "y");
  const width = numberAttribute(bounds, "w");
  const height = numberAttribute(bounds, "h");
  if (x === null || y === null || width === null || height === null) return null;
  return { x, y, width, height };
}

/** Audiveris counts staff positions down from the middle line; steps go up. */
function stepOf(element: XmlElement) {
  const pitch = numberAttribute(element, "pitch");
  return pitch === null ? null : -Math.round(pitch);
}

function clefOf(element: XmlElement): Clef | null {
  const match = /^([GFC])_CLEF(?:_SMALL)?(?:_(8VA|8VB|15MA|15MB))?$/.exec(
    element.attributes.shape ?? "",
  );
  const step = stepOf(element);
  if (!match || step === null) return null;
  return {
    letter: match[1] as ClefLetter,
    octaveShift: match[2] ? OCTAVE_SHIFTS[match[2]] : 0,
    step,
  };
}

function keyOf(fifths: number): Key {
  const key: Key = new Map();
  const order = fifths >= 0 ? SHARP_ORDER : [...SHARP_ORDER].reverse();
  for (const step of order.slice(0, Math.min(Math.abs(fifths), 7))) {
    key.set(STEPS.indexOf(step), fifths >= 0 ? 1 : -1);
  }
  return key;
}

function lineHeight(line: XmlElement) {
  const ys = childrenNamed(line, "point")
    .map((point) => numberAttribute(point, "y"))
    .filter((y): y is number => y !== null);
  return ys.length > 0 ? ys.reduce((sum, y) => sum + y, 0) / ys.length : null;
}

function stavesOf(system: XmlElement): StaffInfo[] {
  return childrenNamed(system, "part").flatMap((part) =>
    childrenNamed(part, "staff").flatMap((staff) => {
      const lines = childrenNamed(child(staff, "lines"), "line");
      const bottom = lines.length > 0 ? lineHeight(lines[lines.length - 1]) : null;
      const id = staff.attributes.id;
      return id && bottom !== null ? [{ id, bottom }] : [];
    }),
  );
}

/** Maps each notehead to the accidental written before it. */
function accidentalsByHead(system: XmlElement, inters: XmlElement[]) {
  const alters = new Map<string, number>();
  for (const inter of inters) {
    const alter = ALTERS[inter.attributes.shape ?? ""];
    if (inter.name === "alter" && alter !== undefined) {
      alters.set(inter.attributes.id, alter);
    }
  }

  const byHead = new Map<string, number>();
  const relations = childrenNamed(child(child(system, "sig"), "relations"), "relation");
  for (const relation of relations) {
    if (!child(relation, "alter-head")) continue;
    const alter = alters.get(relation.attributes.source);
    if (alter !== undefined) byHead.set(relation.attributes.target, alter);
  }
  return byHead;
}

type Scale = { x: number; y: number };

type Context = { clefs: Clef[]; keys: Key[]; measure: number };

function readSystem(
  system: XmlElement,
  scale: Scale,
  staffSpace: number,
  context: Context,
): Omit<PdfPageNote, "page">[] {
  const staves = stavesOf(system);
  const inters = child(child(system, "sig"), "inters")?.children ?? [];
  const alters = accidentalsByHead(system, inters);
  const stacks = childrenNamed(system, "stack").map((stack) => ({
    left: numberAttribute(stack, "left") ?? 0,
    right: numberAttribute(stack, "right") ?? 0,
  }));

  const eventsByStaff = new Map<string, Event[]>(
    staves.map((staff) => [staff.id, []]),
  );
  for (const inter of inters) {
    const events = eventsByStaff.get(inter.attributes.staff ?? "");
    const box = boxOf(inter);
    if (!events || !box) continue;
    if (inter.name === "clef") {
      const clef = clefOf(inter);
      if (clef) events.push({ x: box.x, kind: "clef", clef });
    } else if (inter.name === "key") {
      const fifths = numberAttribute(inter, "fifths");
      if (fifths !== null) events.push({ x: box.x, kind: "key", key: keyOf(fifths) });
    } else if (inter.name === "head") {
      const step = stepOf(inter);
      if (step === null) continue;
      const alter = alters.get(inter.attributes.id) ?? null;
      events.push({ x: box.x, kind: "head", step, alter, box });
    }
  }

  const notes: Omit<PdfPageNote, "page">[] = [];
  staves.forEach((staff, index) => {
    const events = eventsByStaff
      .get(staff.id)!
      .sort((a, b) => a.x - b.x || EVENT_ORDER[a.kind] - EVENT_ORDER[b.kind]);
    let clef = context.clefs[index] ?? TREBLE;
    let key: Key = context.keys[index] ?? new Map();
    let barAccidentals = new Map<string, number>();
    let currentStack = -1;

    for (const event of events) {
      if (event.kind === "clef") {
        clef = event.clef;
        continue;
      }
      if (event.kind === "key") {
        key = event.key;
        continue;
      }

      const centre = event.box.x + event.box.width / 2;
      const stack = stacks.findIndex(
        (candidate) => centre >= candidate.left && centre <= candidate.right,
      );
      if (stack !== currentStack) {
        currentStack = stack;
        barAccidentals = new Map();
      }
      const diatonic = diatonicAt(clef, event.step);
      const stepIndex = stepIndexOf(diatonic);
      if (event.alter !== null) barAccidentals.set(String(diatonic), event.alter);

      notes.push({
        x: event.box.x * scale.x,
        y: event.box.y * scale.y,
        width: event.box.width * scale.x,
        height: event.box.height * scale.y,
        staffSpace: staffSpace * scale.y,
        staffBottom: staff.bottom * scale.y,
        step: STEPS[stepIndex],
        alter: barAccidentals.get(String(diatonic)) ?? key.get(stepIndex) ?? 0,
        octave: Math.floor(diatonic / 7),
        measure: context.measure + Math.max(stack, 0),
      });
    }
    context.clefs[index] = clef;
    context.keys[index] = key;
  });

  context.measure += stacks.length;
  return notes;
}

/**
 * Which PDF page each Audiveris sheet was read from. The page number is text
 * inside <input>, which the XML reader skips, so it is matched directly.
 */
function sheetPages(bookXml: string) {
  const pages = new Map<number, number>();
  const pattern =
    /<sheet\s+number="(\d+)"[^>]*>\s*<input>[\s\S]*?<number>(\d+)<\/number>/g;
  for (const [, sheet, page] of bookXml.matchAll(pattern)) {
    pages.set(Number(sheet), Number(page));
  }
  return pages;
}

/**
 * @param pageSizes PDF page sizes in points, indexed by page number - 1.
 */
export function readOmrProject(
  project: Buffer,
  pageSizes: { width: number; height: number }[],
): PdfPageNote[] {
  const files = readZip(project, (name) => /(^|\/)(book|sheet#\d+)\.xml$/.test(name));
  const book = files.get("book.xml");
  const pages = book ? sheetPages(book.toString("utf8")) : new Map<number, number>();

  const sheets = [...files.keys()]
    .map((name) => ({ name, number: Number(/sheet#(\d+)\.xml$/.exec(name)?.[1]) }))
    .filter((sheet) => Number.isFinite(sheet.number))
    .sort((a, b) => a.number - b.number);

  const context: Context = { clefs: [], keys: [], measure: 1 };
  const notes: PdfPageNote[] = [];

  for (const { name, number } of sheets) {
    const sheet = parseXml(files.get(name)!.toString("utf8"));
    const picture = child(sheet, "picture");
    const pageNumber = pages.get(number) ?? number;
    const size = pageSizes[pageNumber - 1];
    const pictureWidth = numberAttribute(picture, "width");
    const pictureHeight = numberAttribute(picture, "height");
    const interline = numberAttribute(child(child(sheet, "scale"), "interline"), "main");
    // Sheets Audiveris could not read (a cover page, say) have no staves.
    if (!size || !pictureWidth || !pictureHeight || !interline) continue;

    const scale = { x: size.width / pictureWidth, y: size.height / pictureHeight };
    for (const page of childrenNamed(sheet, "page")) {
      for (const system of childrenNamed(page, "system")) {
        const systemNotes = readSystem(system, scale, interline, context);
        notes.push(...systemNotes.map((note) => ({ ...note, page: pageNumber })));
      }
    }
  }
  return notes;
}
