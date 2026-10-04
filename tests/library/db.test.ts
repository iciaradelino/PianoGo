import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { dataDir, getDb } from "@/lib/db";

type Cache = { pianogoDb?: Database.Database; pianogoMigrated?: number };
const cache = globalThis as Cache;

function columns(database: Database.Database, table: string) {
  return (
    database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  ).map((column) => column.name);
}

describe("dataDir", () => {
  const original = process.env.DATA_DIR;
  afterEach(() => {
    process.env.DATA_DIR = original;
  });

  it("uses DATA_DIR when it is set", () => {
    process.env.DATA_DIR = "some/relative/dir";
    expect(dataDir()).toBe(path.resolve("some/relative/dir"));
  });

  it("falls back to ./data", () => {
    delete process.env.DATA_DIR;
    expect(dataDir()).toBe(path.join(process.cwd(), "data"));
  });
});

describe("getDb", () => {
  it("creates pianogo.db with every table on first use and reuses it", () => {
    const database = getDb();

    expect(fs.existsSync(path.join(dataDir(), "pianogo.db"))).toBe(true);
    const tables = (
      database
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
        .all() as { name: string }[]
    ).map((table) => table.name);
    expect(tables).toEqual(
      expect.arrayContaining([
        "sheets",
        "annotations",
        "pdf_notes",
      ]),
    );
    expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(getDb()).toBe(database);
  });

  it("adds later columns and tables to a database from an older version", () => {
    cache.pianogoDb?.close();
    cache.pianogoDb = undefined;
    const file = path.join(dataDir(), "pianogo.db");
    fs.rmSync(file, { force: true });

    const old = new Database(file);
    old.exec(`
      CREATE TABLE sheets (id INTEGER PRIMARY KEY, title TEXT NOT NULL);
      CREATE TABLE annotations (
        id INTEGER PRIMARY KEY,
        sheet_id INTEGER NOT NULL UNIQUE REFERENCES sheets(id),
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    old.close();

    const database = getDb();
    expect(columns(database, "annotations")).toContain("style");
    expect(columns(database, "pdf_notes")).toContain("piano_key_index");
  });

  it("migrates again after a hot reload brings in newer code", () => {
    const database = getDb();
    database.exec(`DROP TABLE pdf_notes`);
    cache.pianogoMigrated = 1;

    expect(getDb()).toBe(database);
    expect(columns(database, "pdf_notes")).not.toHaveLength(0);
    expect(cache.pianogoMigrated).toBe(2);
  });
});
