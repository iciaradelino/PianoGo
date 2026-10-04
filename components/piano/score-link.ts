import type { PdfNoteRecord } from "@/lib/processing/repository";

export type Hand = "right" | "left";

export type LinkedNote = { id: string; midi: number; hand: Hand };

/** One measure of the score, its notes grouped into the steps played together. */
export type LinkedMeasure = { id: string; number: number; steps: LinkedNote[][] };

export type ScoreSelection = {
  measureId: string | null;
  /** Notes drawn as the current ones: the clicked note, or the step playing. */
  focusIds: string[];
  previewId: string | null;
};

/** Lets a score tell the piano which note was clicked, and show what the piano shows. */
export type ScoreLink = {
  selection: ScoreSelection;
  onMeasures: (measures: LinkedMeasure[]) => void;
  onNoteClick: (id: string) => void;
  onNoteHover: (id: string | null) => void;
};

// MIDI number of A0, the lowest key on a piano.
const LOWEST_PIANO_MIDI = 21;
// Chord notes on either side of the stem sit about a notehead apart.
const CHORD_TOLERANCE = 1.1;

export function pdfMeasureId(note: Pick<PdfNoteRecord, "page" | "measure">) {
  return `${note.page}-${note.measure}`;
}

/**
 * Staves that share measures form a system; its top staff is the right hand
 * and the rest the left. A staff alone on its system is taken as the right.
 */
function handsByStaff(notes: PdfNoteRecord[]) {
  const staves = new Map<
    string,
    { page: number; bottom: number; first: number; last: number }
  >();
  for (const note of notes) {
    const key = `${note.page}:${note.staffBottom}`;
    const staff = staves.get(key);
    if (staff) {
      staff.first = Math.min(staff.first, note.measure);
      staff.last = Math.max(staff.last, note.measure);
    } else {
      staves.set(key, {
        page: note.page,
        bottom: note.staffBottom,
        first: note.measure,
        last: note.measure,
      });
    }
  }

  const hands = new Map<string, Hand>();
  const ordered = [...staves.values()].sort(
    (a, b) => a.page - b.page || a.bottom - b.bottom,
  );
  let system: { page: number; first: number; last: number } | null = null;
  for (const staff of ordered) {
    const joined =
      system &&
      system.page === staff.page &&
      staff.first <= system.last &&
      staff.last >= system.first;
    if (system && joined) {
      system.first = Math.min(system.first, staff.first);
      system.last = Math.max(system.last, staff.last);
    } else {
      system = { page: staff.page, first: staff.first, last: staff.last };
    }
    hands.set(`${staff.page}:${staff.bottom}`, joined ? "left" : "right");
  }
  return hands;
}

/** Note ids are the notes' indexes in the list. */
export function pdfMeasures(notes: PdfNoteRecord[]): LinkedMeasure[] {
  const hands = handsByStaff(notes);
  const byMeasure = new Map<
    string,
    { page: number; number: number; notes: { note: PdfNoteRecord; id: string }[] }
  >();
  notes.forEach((note, index) => {
    const id = pdfMeasureId(note);
    const measure = byMeasure.get(id) ?? {
      page: note.page,
      number: note.measure,
      notes: [],
    };
    measure.notes.push({ note, id: String(index) });
    byMeasure.set(id, measure);
  });

  return [...byMeasure.entries()]
    .sort(([, a], [, b]) => a.page - b.page || a.number - b.number)
    .map(([id, measure]) => {
      const steps: { x: number; width: number; notes: LinkedNote[] }[] = [];
      const sorted = [...measure.notes].sort((a, b) => a.note.x - b.note.x);
      for (const { note, id: noteId } of sorted) {
        const linked: LinkedNote = {
          id: noteId,
          midi: note.pianoKeyIndex + LOWEST_PIANO_MIDI,
          hand: hands.get(`${note.page}:${note.staffBottom}`) ?? "right",
        };
        const step = steps.at(-1);
        if (step && note.x - step.x <= step.width * CHORD_TOLERANCE) {
          step.notes.push(linked);
        } else {
          steps.push({ x: note.x, width: note.width, notes: [linked] });
        }
      }
      return { id, number: measure.number, steps: steps.map((step) => step.notes) };
    });
}

/** Centres an element in the area that scrolls it, unless it is already in full view. */
export function revealElement(element: Element) {
  let scroller = element.parentElement;
  while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) {
    scroller = scroller.parentElement;
  }
  const view = scroller?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
  const box = element.getBoundingClientRect();
  if (box.top >= view.top && box.bottom <= view.bottom) return;
  element.scrollIntoView({ block: "center", behavior: "smooth" });
}
