import { getDb } from "@/lib/db";
import { readSheetFile } from "@/lib/library/repository";
import { extractPdfNotes, type PdfPageNote } from "@/lib/processing/pdf/extract";
import {
  STEP_SEMITONES,
  type PdfNote,
  type Step,
} from "@/lib/processing/pdf/find-notes";
import {
  defaultAnnotationStyle,
  parseAnnotationStyle,
  type AnnotationStyle,
} from "@/lib/processing/annotation-style";

export type AnnotationStatus = "none" | "ready";

export type AnnotationRecord = {
  sheetId: number;
  status: AnnotationStatus;
  style: AnnotationStyle;
};

function validSheetId(sheetId: number) {
  return Number.isInteger(sheetId) && sheetId > 0;
}

function parseStoredStyle(style: string | null) {
  if (!style) return defaultAnnotationStyle;
  try {
    return parseAnnotationStyle(JSON.parse(style));
  } catch {
    return defaultAnnotationStyle;
  }
}

export function getAnnotation(sheetId: number): AnnotationRecord | null {
  if (!validSheetId(sheetId)) return null;

  const row = getDb()
    .prepare(
      `SELECT annotations.status AS status, annotations.style AS style
       FROM sheets
       LEFT JOIN annotations ON annotations.sheet_id = sheets.id
       WHERE sheets.id = ?`,
    )
    .get(sheetId) as
    | { status: string | null; style: string | null }
    | undefined;
  if (!row) return null;
  return {
    sheetId,
    status: row.status === "ready" ? "ready" : "none",
    style: parseStoredStyle(row.style),
  };
}

export type PdfNoteRecord = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  staffSpace: number;
  staffBottom: number;
  step: Step;
  alter: number;
  octave: number;
  measure: number;
  pianoKeyIndex: number;
};

export type GenerateResult =
  | { ok: true; annotation: AnnotationRecord }
  | { ok: false; reason: "not-found" | "no-notation" };

// MIDI number of A0, the lowest key on a piano.
const LOWEST_PIANO_MIDI = 21;

function pianoKeyIndex(note: PdfNote) {
  const midi = (note.octave + 1) * 12 + STEP_SEMITONES[note.step] + note.alter;
  return midi - LOWEST_PIANO_MIDI;
}

/** Creates or refreshes the sheet's annotation row, keeping its style. */
function saveAnnotation(sheetId: number) {
  return getDb()
    .prepare(
      `INSERT INTO annotations (sheet_id, status, created_at)
       VALUES (?, 'ready', ?)
       ON CONFLICT (sheet_id) DO UPDATE
       SET status = excluded.status, created_at = excluded.created_at
       RETURNING id`,
    )
    .get(sheetId, new Date().toISOString()) as { id: number };
}

function savePdfNotes(sheetId: number, notes: PdfPageNote[]) {
  const database = getDb();
  const insert = database.prepare(
    `INSERT INTO pdf_notes (
       annotation_id, page, x, y, width, height, staff_space, staff_bottom,
       step, alteration, octave, measure, piano_key_index
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  database.transaction(() => {
    const { id } = saveAnnotation(sheetId);
    database.prepare(`DELETE FROM pdf_notes WHERE annotation_id = ?`).run(id);
    for (const note of notes) {
      insert.run(
        id,
        note.page,
        note.x,
        note.y,
        note.width,
        note.height,
        note.staffSpace,
        note.staffBottom,
        note.step,
        note.alter,
        note.octave,
        note.measure,
        pianoKeyIndex(note),
      );
    }
  })();
}

/**
 * Annotates a sheet. MusicXML scores are named in the browser as they are
 * drawn, so only the annotation is recorded. PDFs are read here, and every
 * note is stored with its position on the page.
 */
export async function generateAnnotations(
  sheetId: number,
): Promise<GenerateResult> {
  if (!validSheetId(sheetId)) return { ok: false, reason: "not-found" };
  const file = readSheetFile(sheetId);
  if (!file) return { ok: false, reason: "not-found" };

  if (file.fileType === "musicxml") {
    saveAnnotation(sheetId);
  } else {
    const { notes } = await extractPdfNotes(new Uint8Array(file.bytes));
    // No notes means the PDF holds no notation font, as with scans.
    if (notes.length === 0) return { ok: false, reason: "no-notation" };
    savePdfNotes(sheetId, notes);
  }

  const annotation = getAnnotation(sheetId);
  return annotation
    ? { ok: true, annotation }
    : { ok: false, reason: "not-found" };
}

export function getPdfNotes(sheetId: number): PdfNoteRecord[] {
  if (!validSheetId(sheetId)) return [];

  return getDb()
    .prepare(
      `SELECT page, x, y, width, height,
              staff_space AS staffSpace, staff_bottom AS staffBottom,
              step, alteration AS "alter", octave, measure,
              piano_key_index AS pianoKeyIndex
       FROM pdf_notes
       JOIN annotations ON annotations.id = pdf_notes.annotation_id
       WHERE annotations.sheet_id = ?
       ORDER BY page, pdf_notes.id`,
    )
    .all(sheetId) as PdfNoteRecord[];
}

/** Saves how a sheet's annotations look. Returns null if it has none yet. */
export function updateAnnotationStyle(
  sheetId: number,
  style: unknown,
): AnnotationRecord | null {
  if (!validSheetId(sheetId)) return null;

  const result = getDb()
    .prepare(`UPDATE annotations SET style = ? WHERE sheet_id = ?`)
    .run(JSON.stringify(parseAnnotationStyle(style)), sheetId);
  if (result.changes === 0) return null;
  return getAnnotation(sheetId);
}

export function deleteAnnotations(sheetId: number) {
  if (!validSheetId(sheetId)) return;

  const database = getDb();
  database.transaction(() => {
    database
      .prepare(
        `DELETE FROM notes
         WHERE annotation_id IN (SELECT id FROM annotations WHERE sheet_id = ?)`,
      )
      .run(sheetId);
    database
      .prepare(
        `DELETE FROM pdf_notes
         WHERE annotation_id IN (SELECT id FROM annotations WHERE sheet_id = ?)`,
      )
      .run(sheetId);
    database.prepare(`DELETE FROM annotations WHERE sheet_id = ?`).run(sheetId);
  })();
}
