import "server-only";

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

const dataDirectory = path.resolve(process.env.DATA_DIR ?? "./data");
const databasePath = path.join(dataDirectory, "pianogo.db");

declare global {
  var pianoGoDatabase: Database.Database | undefined;
}

export function getDatabase() {
  if (global.pianoGoDatabase) return global.pianoGoDatabase;

  mkdirSync(dataDirectory, { recursive: true });
  const database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS sheets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      composer TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT NOT NULL,
      practice_status TEXT NOT NULL DEFAULT 'Not started',
      is_favorite INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  global.pianoGoDatabase = database;
  return database;
}

export function getDataDirectory() {
  return dataDirectory;
}

