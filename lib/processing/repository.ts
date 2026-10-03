import { getDb } from "@/lib/db";

export type AnnotationStatus = "none" | "ready";

function validSheetId(sheetId: number) {
  return Number.isInteger(sheetId) && sheetId > 0;
}

export function getAnnotationStatus(sheetId: number): AnnotationStatus | null {
  if (!validSheetId(sheetId)) return null;

  const row = getDb()
    .prepare(
      `SELECT sheets.id AS sheetId, annotations.status AS status
       FROM sheets
       LEFT JOIN annotations ON annotations.sheet_id = sheets.id
       WHERE sheets.id = ?`,
    )
    .get(sheetId) as { sheetId: number; status: string | null } | undefined;
  if (!row) return null;
  return row.status === "ready" ? "ready" : "none";
}

/**
 * Records that a MusicXML sheet has been annotated. Returns null when the
 * sheet does not exist or is not MusicXML (PDF annotation is not supported yet).
 */
export function markAnnotated(sheetId: number): AnnotationStatus | null {
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
  return "ready";
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
