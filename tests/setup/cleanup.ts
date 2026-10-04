import fs from "node:fs";
import type Database from "better-sqlite3";

afterAll(() => {
  const cached = globalThis as { pianogoDb?: Database.Database };
  cached.pianogoDb?.close();
  cached.pianogoDb = undefined;
  fs.rmSync(process.env.DATA_DIR!, { recursive: true, force: true });
});
