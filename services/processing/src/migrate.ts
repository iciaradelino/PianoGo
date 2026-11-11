import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sql from "mssql";

export type Migration = {
  /** The number at the start of the file name, such as "001". */
  version: string;
  /** The file name, such as "001_init.sql". */
  name: string;
  sql: string;
  /** SHA-256 of the file, to notice an applied migration being edited. */
  checksum: string;
};

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
  }
}

const FILE_NAME = /^(\d{3})_[a-z0-9_]+\.sql$/;

export function checksumOf(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

/** Reads `NNN_name.sql` files from `dir`, in order of their number. */
export function readMigrations(dir: string): Migration[] {
  const migrations = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => {
      const match = FILE_NAME.exec(file);
      if (!match) {
        throw new MigrationError(
          `${file} is not named like 001_description.sql (lowercase, underscores).`,
        );
      }
      const text = fs.readFileSync(path.join(dir, file), "utf8");
      return { version: match[1], name: file, sql: text, checksum: checksumOf(text) };
    })
    .sort((a, b) => a.version.localeCompare(b.version));

  for (let i = 1; i < migrations.length; i++) {
    if (migrations[i].version === migrations[i - 1].version) {
      throw new MigrationError(
        `${migrations[i - 1].name} and ${migrations[i].name} have the same number.`,
      );
    }
  }
  return migrations;
}

/**
 * Splits a script on lines that hold only `GO`, as sqlcmd does. SQL Server
 * needs statements such as CREATE VIEW to start their own batch.
 */
export function splitBatches(script: string) {
  return script
    .split(/^\s*GO\s*$/im)
    .map((batch) => batch.trim())
    .filter((batch) => batch.length > 0);
}

type AppliedRow = { version: string; name: string; checksum: string };

/**
 * Finds which migrations are not applied yet. Throws if an applied migration's
 * file was edited or removed, since corrections must be new migrations.
 */
export function pendingMigrations(migrations: Migration[], applied: AppliedRow[]) {
  const files = new Map(migrations.map((migration) => [migration.version, migration]));
  for (const row of applied) {
    const file = files.get(row.version);
    if (!file) {
      throw new MigrationError(`${row.name} was applied but its file is missing.`);
    }
    if (file.checksum !== row.checksum) {
      throw new MigrationError(
        `${row.name} was edited after it was applied. Put the change in a new migration.`,
      );
    }
  }
  const done = new Set(applied.map((row) => row.version));
  return migrations.filter((migration) => !done.has(migration.version));
}

const createTable = `
IF OBJECT_ID(N'schema_migrations', N'U') IS NULL
  CREATE TABLE schema_migrations (
    version NVARCHAR(10) NOT NULL PRIMARY KEY,
    name NVARCHAR(200) NOT NULL,
    checksum CHAR(64) NOT NULL,
    applied_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );`;

/**
 * Applies pending migrations in order, each in its own transaction together
 * with its row in `schema_migrations`, so a failed migration leaves nothing
 * behind and is retried on the next start. Returns the names it applied.
 *
 * Nothing stops two processes migrating at once: each service runs at most one
 * replica (ADR-8), so only one process starts at a time.
 */
export async function migrate(
  pool: sql.ConnectionPool,
  migrations: Migration[],
  log: (line: string) => void = console.log,
) {
  await pool.request().batch(createTable);
  const applied = (
    await pool
      .request()
      .query<AppliedRow>(`SELECT version, name, checksum FROM schema_migrations`)
  ).recordset;

  const pending = pendingMigrations(migrations, applied);
  for (const migration of pending) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      for (const batch of splitBatches(migration.sql)) {
        await new sql.Request(transaction).batch(batch);
      }
      await new sql.Request(transaction)
        .input("version", sql.NVarChar(10), migration.version)
        .input("name", sql.NVarChar(200), migration.name)
        .input("checksum", sql.Char(64), migration.checksum)
        .query(
          `INSERT INTO schema_migrations (version, name, checksum)
           VALUES (@version, @name, @checksum)`,
        );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    log(`migration applied: ${migration.name}`);
  }
  if (pending.length === 0) log("migrations: database is up to date");
  return pending.map((migration) => migration.name);
}
