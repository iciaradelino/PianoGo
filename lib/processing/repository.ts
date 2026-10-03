import { getDb } from "@/lib/db";
import { readSheetFile } from "@/lib/library/repository";
import {
  audiverisPath,
  recognise,
  type OmrProgress,
} from "@/lib/processing/omr/audiveris";
import { readOmrProject } from "@/lib/processing/omr/read-omr";
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

export type AnnotationStatus = "none" | "processing" | "ready" | "failed";

export type AnnotationRecord = {
  sheetId: number;
  status: AnnotationStatus;
  style: AnnotationStyle;
  /** While a scan is being read: the page Audiveris is on. */
  progress?: OmrProgress;
};

// Scans being read in the background, by sheet. Kept on globalThis so a dev
// hot reload does not forget jobs that are still running.
const scanJobs = ((globalThis as { pianogoScanJobs?: Map<number, OmrProgress | null> })
  .pianogoScanJobs ??= new Map<number, OmrProgress | null>());

const STATUSES: AnnotationStatus[] = ["none", "processing", "ready", "failed"];

function statusOf(sheetId: number, stored: string | null): AnnotationStatus {
  const status = STATUSES.find((candidate) => candidate === stored) ?? "none";
  // A job that stopped with the server will never finish.
  if (status === "processing" && !scanJobs.has(sheetId)) return "failed";
  return status;
}

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
  const progress = scanJobs.get(sheetId);
  return {
    sheetId,
    status: statusOf(sheetId, row.status),
    style: parseStoredStyle(row.style),
    ...(progress ? { progress } : {}),
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
  | { ok: false; reason: "not-found" | "no-reader" };

// MIDI number of A0, the lowest key on a piano.
const LOWEST_PIANO_MIDI = 21;

function pianoKeyIndex(note: PdfNote) {
  const midi = (note.octave + 1) * 12 + STEP_SEMITONES[note.step] + note.alter;
  return midi - LOWEST_PIANO_MIDI;
}

/** Creates or refreshes the sheet's annotation row, keeping its style. */
function saveAnnotation(sheetId: number, status: AnnotationStatus = "ready") {
  return getDb()
    .prepare(
      `INSERT INTO annotations (sheet_id, status, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT (sheet_id) DO UPDATE
       SET status = excluded.status, created_at = excluded.created_at
       RETURNING id`,
    )
    .get(sheetId, status, new Date().toISOString()) as { id: number };
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
 * Reads a scan with Audiveris in the background, then stores its notes. The
 * annotation stays "processing" until then, and the viewer polls for it.
 */
function startScanJob(
  sheetId: number,
  pdf: Buffer,
  pages: { width: number; height: number }[],
) {
  scanJobs.set(sheetId, null);
  saveAnnotation(sheetId, "processing");

  void recognise(pdf, pages.length, (progress) => {
    scanJobs.set(sheetId, progress);
  })
    .then((project) => {
      const notes = readOmrProject(project, pages);
      if (notes.length === 0) throw new Error("No notes were recognised.");
      savePdfNotes(sheetId, notes);
    })
    .catch((error: unknown) => {
      console.error(`Could not read the scan of sheet ${sheetId}.`, error);
      try {
        saveAnnotation(sheetId, "failed");
      } catch {
        // The sheet was removed while it was being read.
      }
    })
    .finally(() => scanJobs.delete(sheetId));
}

/**
 * Annotates a sheet. MusicXML scores are named in the browser as they are
 * drawn, so only the annotation is recorded. PDFs exported from notation
 * software are read here at once; any other PDF, such as a scan, is handed to
 * Audiveris and finishes in the background.
 */
export async function generateAnnotations(
  sheetId: number,
): Promise<GenerateResult> {
  if (!validSheetId(sheetId)) return { ok: false, reason: "not-found" };
  const file = readSheetFile(sheetId);
  if (!file) return { ok: false, reason: "not-found" };

  if (file.fileType === "musicxml") {
    saveAnnotation(sheetId);
  } else if (!scanJobs.has(sheetId)) {
    const { notes, pages } = await extractPdfNotes(new Uint8Array(file.bytes));
    if (notes.length > 0) {
      savePdfNotes(sheetId, notes);
    } else {
      // No notation font was found, as with scans.
      if (!audiverisPath()) return { ok: false, reason: "no-reader" };
      startScanJob(sheetId, file.bytes, pages);
    }
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
