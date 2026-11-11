import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  checksumOf,
  MigrationError,
  pendingMigrations,
  readMigrations,
  splitBatches,
} from "../src/migrate";

function migrationsDir(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "migrations-"));
  for (const [name, text] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

describe("readMigrations", () => {
  it("reads .sql files in order of their number", () => {
    const dir = migrationsDir({
      "010_later.sql": "SELECT 10",
      "002_add_column.sql": "SELECT 2",
      "001_init.sql": "SELECT 1",
      "README.md": "not a migration",
    });
    const migrations = readMigrations(dir);
    expect(migrations.map((m) => m.name)).toEqual([
      "001_init.sql",
      "002_add_column.sql",
      "010_later.sql",
    ]);
    expect(migrations[0]).toMatchObject({ version: "001", checksum: checksumOf("SELECT 1") });
  });

  it("rejects badly named files", () => {
    expect(() => readMigrations(migrationsDir({ "1_init.sql": "" }))).toThrow(MigrationError);
    expect(() => readMigrations(migrationsDir({ "001-Init.sql": "" }))).toThrow(
      MigrationError,
    );
  });

  it("rejects two files with the same number", () => {
    const dir = migrationsDir({ "001_a.sql": "", "001_b.sql": "" });
    expect(() => readMigrations(dir)).toThrow("have the same number");
  });

  it("reads this service's own migrations", () => {
    const migrations = readMigrations(path.join(__dirname, "..", "migrations"));
    expect(migrations[0].name).toBe("001_init.sql");
  });
});

describe("splitBatches", () => {
  it("splits on lines that hold only GO, in any case", () => {
    expect(splitBatches("CREATE TABLE a (x INT);\nGO\nCREATE VIEW v AS SELECT x FROM a;\n  go  \n")).toEqual([
      "CREATE TABLE a (x INT);",
      "CREATE VIEW v AS SELECT x FROM a;",
    ]);
  });

  it("leaves GO inside other words alone", () => {
    expect(splitBatches("SELECT 'GOOD' AS going;")).toEqual(["SELECT 'GOOD' AS going;"]);
  });
});

describe("pendingMigrations", () => {
  const files = [
    { version: "001", name: "001_init.sql", sql: "A", checksum: checksumOf("A") },
    { version: "002", name: "002_more.sql", sql: "B", checksum: checksumOf("B") },
  ];

  it("returns every migration on an empty database", () => {
    expect(pendingMigrations(files, [])).toEqual(files);
  });

  it("returns nothing when everything is applied", () => {
    const applied = files.map(({ version, name, checksum }) => ({ version, name, checksum }));
    expect(pendingMigrations(files, applied)).toEqual([]);
  });

  it("returns only the ones not applied yet", () => {
    const applied = [{ version: "001", name: "001_init.sql", checksum: checksumOf("A") }];
    expect(pendingMigrations(files, applied)).toEqual([files[1]]);
  });

  it("refuses an applied migration that was edited", () => {
    const applied = [{ version: "001", name: "001_init.sql", checksum: checksumOf("old") }];
    expect(() => pendingMigrations(files, applied)).toThrow("was edited");
  });

  it("refuses an applied migration whose file is gone", () => {
    const applied = [{ version: "003", name: "003_gone.sql", checksum: "x" }];
    expect(() => pendingMigrations(files, applied)).toThrow("file is missing");
  });
});
