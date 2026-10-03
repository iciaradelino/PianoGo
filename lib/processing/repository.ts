import { getDb } from "@/lib/db";
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

/**
 * Records that a MusicXML sheet has been annotated, keeping any style it
 * already had. Returns null when the sheet does not exist or is not MusicXML
 * (PDF annotation is not supported yet).
 */
export function markAnnotated(sheetId: number): AnnotationRecord | null {
  if (!validSheetId(sheetId)) return null;

  const sheet = getDb()
    .prepare(`SELECT file_type FROM sheets WHERE id = ?`)
    .get(sheetId) as { file_type: string } | undefined;
  if (sheet?.file_type !== "musicxml") return null;

  getDb()
    .prepare(
      `INSERT INTO annotations (sheet_id, status, created_at)
       VALUES (?, 'ready', ?)
       ON CONFLICT (sheet_id) DO UPDATE
       SET status = excluded.status, created_at = excluded.created_at`,
    )
    .run(sheetId, new Date().toISOString());
  return getAnnotation(sheetId);
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
    database.prepare(`DELETE FROM annotations WHERE sheet_id = ?`).run(sheetId);
  })();
}
