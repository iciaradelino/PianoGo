import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const schema = `
CREATE TABLE IF NOT EXISTS sheets (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  composer TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (
    difficulty IN ('Beginner', 'Intermediate', 'Advanced')
  ),
  original_filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'musicxml')),
  practice_status TEXT NOT NULL DEFAULT 'Not started' CHECK (
    practice_status IN ('Not started', 'In progress', 'Completed')
  ),
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS sheet_tags (
  sheet_id INTEGER NOT NULL REFERENCES sheets(id),
  tag_id INTEGER NOT NULL REFERENCES tags(id),
  PRIMARY KEY (sheet_id, tag_id)
);

CREATE TABLE IF NOT EXISTS annotations (
  id INTEGER PRIMARY KEY,
  sheet_id INTEGER NOT NULL UNIQUE REFERENCES sheets(id),
  status TEXT NOT NULL,
  style TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY,
  annotation_id INTEGER NOT NULL REFERENCES annotations(id),
  pitch TEXT NOT NULL,
  measure INTEGER NOT NULL,
  beat REAL NOT NULL,
  duration TEXT NOT NULL,
  piano_key_index INTEGER NOT NULL
);
`;

// Notes read from a PDF, with where their notehead sits on the page so that
// labels can be drawn over the original file.
const pdfNotesTable = `
CREATE TABLE IF NOT EXISTS pdf_notes (
  id INTEGER PRIMARY KEY,
  annotation_id INTEGER NOT NULL REFERENCES annotations(id),
  page INTEGER NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  staff_space REAL NOT NULL,
  staff_bottom REAL NOT NULL,
  step TEXT NOT NULL CHECK (step IN ('C', 'D', 'E', 'F', 'G', 'A', 'B')),
  alteration INTEGER NOT NULL,
  octave INTEGER NOT NULL,
  measure INTEGER NOT NULL,
  piano_key_index INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS pdf_notes_annotation
  ON pdf_notes (annotation_id, page);
`;

const globalForDb = globalThis as unknown as {
  pianogoDb?: Database.Database;
  // The MIGRATIONS_VERSION that migrate() last ran with on the cached connection.
  pianogoMigrated?: number;
};

// Bump when migrate() changes, so a dev hot reload runs it again.
const MIGRATIONS_VERSION = 2;

export function dataDir() {
  return process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(process.cwd(), "data");
}

// CREATE TABLE IF NOT EXISTS leaves older tables alone, so add later columns here.
function migrate(database: Database.Database) {
  database.exec(pdfNotesTable);
  const annotationColumns = database
    .prepare(`PRAGMA table_info(annotations)`)
    .all() as { name: string }[];
  if (!annotationColumns.some((column) => column.name === "style")) {
    database.exec(
      `ALTER TABLE annotations ADD COLUMN style TEXT NOT NULL DEFAULT '{}'`,
    );
  }
}

export function getDb() {
  const cached = globalForDb.pianogoDb;
  if (cached) {
    // A dev hot reload keeps the connection but brings in new code.
    if (globalForDb.pianogoMigrated !== MIGRATIONS_VERSION) {
      migrate(cached);
      globalForDb.pianogoMigrated = MIGRATIONS_VERSION;
    }
    return cached;
  }

  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  const database = new Database(path.join(dir, "pianogo.db"));
  database.pragma("foreign_keys = ON");
  database.exec(schema);
  migrate(database);
  globalForDb.pianogoDb = database;
  globalForDb.pianogoMigrated = MIGRATIONS_VERSION;
  return database;
}
