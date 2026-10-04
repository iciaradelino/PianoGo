import { getDb } from "@/lib/db";

/** Empties every table so each test starts from a blank library. */
export function resetDb() {
  getDb().exec(`
    DELETE FROM pdf_notes;
    DELETE FROM notes;
    DELETE FROM annotations;
    DELETE FROM sheet_tags;
    DELETE FROM tags;
    DELETE FROM sheets;
  `);
}
