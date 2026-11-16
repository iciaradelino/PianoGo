import sql from "mssql";
import type { ReadSheetFile } from "../library-client";
import {
  defaultAnnotationStyle,
  parseAnnotationStyle,
  type AnnotationStyle,
} from "./annotation-style";
import { audiverisPath, recognise, type OmrProgress } from "./omr/audiveris";
import { readOmrProject } from "./omr/read-omr";
import { extractPdfNotes, type PdfPageNote } from "./pdf/extract";
import { STEP_SEMITONES, type PdfNote, type Step } from "./pdf/find-notes";

export type AnnotationStatus = "none" | "processing" | "ready" | "failed";

export type AnnotationRecord = {
  sheetId: number;
  status: AnnotationStatus;
  style: AnnotationStyle;
  /** While a scan is being read: the page Audiveris is on. */
  progress?: OmrProgress;
};

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
  | { ok: false; reason: "not-found" | "no-reader" | "library-unavailable" };

const STATUSES: AnnotationStatus[] = ["none", "processing", "ready", "failed"];

// MIDI number of A0, the lowest key on a piano.
const LOWEST_PIANO_MIDI = 21;

function pianoKeyIndex(note: PdfNote) {
  const midi = (note.octave + 1) * 12 + STEP_SEMITONES[note.step] + note.alter;
  return midi - LOWEST_PIANO_MIDI;
}

function validSheetId(sheetId: number) {
  return Number.isInteger(sheetId) && sheetId > 0 && sheetId <= 2147483647;
}

function parseStoredStyle(style: string | null) {
  if (!style) return defaultAnnotationStyle;
  try {
    return parseAnnotationStyle(JSON.parse(style));
  } catch {
    return defaultAnnotationStyle;
  }
}

/**
 * Processing's data access. Sheet files come from `readSheetFile`, which is
 * the library client in the service and a fake in tests.
 */
export function createAnnotationRepository(
  pool: sql.ConnectionPool,
  readSheetFile: ReadSheetFile,
) {
  // Scans being read in the background, by sheet, with their progress. Only
  // one replica runs (ADR-8), so this process sees every running job.
  const scanJobs = new Map<number, { progress: OmrProgress | null; done: Promise<void> }>();

  function statusOf(sheetId: number, stored: string | null): AnnotationStatus {
    const status = STATUSES.find((candidate) => candidate === stored) ?? "none";
    // A job that stopped with the server will never finish.
    if (status === "processing" && !scanJobs.has(sheetId)) return "failed";
    return status;
  }

  async function inTransaction<T>(work: (request: () => sql.Request) => Promise<T>) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const result = await work(() => new sql.Request(transaction));
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Creates or refreshes the sheet's annotation row, keeping its style, and
   * returns its id. The locks stop two requests for the same sheet from both
   * inserting at once.
   */
  async function upsertAnnotation(
    request: () => sql.Request,
    sheetId: number,
    status: Exclude<AnnotationStatus, "none">,
  ) {
    const result = await request()
      .input("sheetId", sql.Int, sheetId)
      .input("status", sql.NVarChar(20), status)
      .query<{ id: number }>(
        `UPDATE annotations WITH (UPDLOCK, SERIALIZABLE)
         SET status = @status, created_at = SYSUTCDATETIME()
         OUTPUT INSERTED.id
         WHERE sheet_id = @sheetId;
         IF @@ROWCOUNT = 0
           INSERT INTO annotations (sheet_id, status) OUTPUT INSERTED.id
           VALUES (@sheetId, @status);`,
      );
    const rows = (result.recordsets as { id: number }[][]).flat();
    return rows[0].id;
  }

  function saveAnnotation(sheetId: number, status: Exclude<AnnotationStatus, "none">) {
    return inTransaction((request) => upsertAnnotation(request, sheetId, status));
  }

  /** Replaces the sheet's notes in one transaction, in a single INSERT. */
  function savePdfNotes(sheetId: number, notes: PdfPageNote[]) {
    const rows = notes.map((note) => ({ ...note, pianoKeyIndex: pianoKeyIndex(note) }));
    return inTransaction(async (request) => {
      const id = await upsertAnnotation(request, sheetId, "ready");
      await request()
        .input("id", sql.Int, id)
        .input("notes", sql.NVarChar(sql.MAX), JSON.stringify(rows))
        .query(
          `DELETE FROM pdf_notes WHERE annotation_id = @id;
           INSERT INTO pdf_notes (
             annotation_id, page, x, y, width, height, staff_space, staff_bottom,
             step, alteration, octave, measure, piano_key_index
           )
           SELECT @id, page, x, y, width, height, staffSpace, staffBottom,
                  step, [alter], octave, measure, pianoKeyIndex
           FROM OPENJSON(@notes) WITH (
             page INT, x FLOAT, y FLOAT, width FLOAT, height FLOAT,
             staffSpace FLOAT, staffBottom FLOAT, step NCHAR(1), [alter] INT,
             octave INT, measure INT, pianoKeyIndex INT
           );`,
        );
    });
  }

  async function getAnnotation(sheetId: number): Promise<AnnotationRecord | null> {
    if (!validSheetId(sheetId)) return null;
    const result = await pool
      .request()
      .input("sheetId", sql.Int, sheetId)
      .query<{ status: string; style: string }>(
        `SELECT status, style FROM annotations WHERE sheet_id = @sheetId`,
      );
    // No row means "not annotated yet". Whether the sheet exists is the
    // library's to say; the UI only asks about sheets it got from there.
    const row = result.recordset[0];
    const progress = scanJobs.get(sheetId)?.progress;
    return {
      sheetId,
      status: statusOf(sheetId, row?.status ?? null),
      style: parseStoredStyle(row?.style ?? null),
      ...(progress ? { progress } : {}),
    };
  }

  /**
   * Reads a scan with Audiveris in the background, then stores its notes. The
   * annotation stays "processing" until then, and the viewer polls for it.
   */
  async function startScanJob(
    sheetId: number,
    pdf: Buffer,
    pages: { width: number; height: number }[],
  ) {
    const job = { progress: null as OmrProgress | null, done: Promise.resolve() };
    scanJobs.set(sheetId, job);
    try {
      await saveAnnotation(sheetId, "processing");
    } catch (error) {
      scanJobs.delete(sheetId);
      throw error;
    }

    job.done = recognise(pdf, pages.length, (progress) => {
      job.progress = progress;
    })
      .then(async (project) => {
        const notes = readOmrProject(project, pages);
        if (notes.length === 0) throw new Error("No notes were recognised.");
        await savePdfNotes(sheetId, notes);
      })
      .catch(async (error: unknown) => {
        console.error(`Could not read the scan of sheet ${sheetId}.`, error);
        await saveAnnotation(sheetId, "failed").catch(() => {});
      })
      .finally(() => {
        scanJobs.delete(sheetId);
      });
  }

  return {
    getAnnotation,

    /**
     * Annotates a sheet, fetching its file from the library. MusicXML scores
     * are named in the browser as they are drawn, so only the annotation is
     * recorded. PDFs exported from notation software are read here at once;
     * any other PDF, such as a scan, is handed to Audiveris in the background.
     */
    async generateAnnotations(sheetId: number): Promise<GenerateResult> {
      if (!validSheetId(sheetId)) return { ok: false, reason: "not-found" };

      if (!scanJobs.has(sheetId)) {
        const fetched = await readSheetFile(sheetId);
        if (!fetched.ok) {
          return {
            ok: false,
            reason: fetched.reason === "not-found" ? "not-found" : "library-unavailable",
          };
        }
        const { file } = fetched;

        if (file.fileType === "musicxml") {
          await saveAnnotation(sheetId, "ready");
        } else {
          const { notes, pages } = await extractPdfNotes(new Uint8Array(file.bytes));
          if (notes.length > 0) {
            await savePdfNotes(sheetId, notes);
          } else {
            // No notation font was found, as with scans.
            if (!audiverisPath()) return { ok: false, reason: "no-reader" };
            await startScanJob(sheetId, file.bytes, pages);
          }
        }
      }

      const annotation = (await getAnnotation(sheetId))!;
      return { ok: true, annotation };
    },

    async getPdfNotes(sheetId: number): Promise<PdfNoteRecord[]> {
      if (!validSheetId(sheetId)) return [];
      const result = await pool
        .request()
        .input("sheetId", sql.Int, sheetId)
        .query<PdfNoteRecord>(
          `SELECT page, x, y, width, height,
                  staff_space AS staffSpace, staff_bottom AS staffBottom,
                  step, alteration AS [alter], octave, measure,
                  piano_key_index AS pianoKeyIndex
           FROM pdf_notes
           JOIN annotations ON annotations.id = pdf_notes.annotation_id
           WHERE annotations.sheet_id = @sheetId
           ORDER BY page, pdf_notes.id`,
        );
      return result.recordset;
    },

    /** Saves how a sheet's annotations look. Returns null if it has none yet. */
    async updateAnnotationStyle(
      sheetId: number,
      style: unknown,
    ): Promise<AnnotationRecord | null> {
      if (!validSheetId(sheetId)) return null;
      const result = await pool
        .request()
        .input("sheetId", sql.Int, sheetId)
        .input("style", sql.NVarChar(sql.MAX), JSON.stringify(parseAnnotationStyle(style)))
        .query(`UPDATE annotations SET style = @style WHERE sheet_id = @sheetId`);
      if (result.rowsAffected[0] === 0) return null;
      return getAnnotation(sheetId);
    },

    /** Removes a sheet's annotation and notes; called by the UI after a delete. */
    async deleteAnnotations(sheetId: number) {
      if (!validSheetId(sheetId)) return;
      await inTransaction(async (request) => {
        await request()
          .input("sheetId", sql.Int, sheetId)
          .query(
            `DELETE FROM pdf_notes
             WHERE annotation_id IN (SELECT id FROM annotations WHERE sheet_id = @sheetId);
             DELETE FROM annotations WHERE sheet_id = @sheetId;`,
          );
      });
    },

    /** Waits for every background scan to finish (for tests and shutdown). */
    async idle() {
      await Promise.all([...scanJobs.values()].map((job) => job.done));
    },
  };
}

export type AnnotationRepository = ReturnType<typeof createAnnotationRepository>;
