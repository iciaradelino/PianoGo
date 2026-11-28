/**
 * Runs against a real SQL Server. TEST_DATABASE_URL is a connection string for
 * a login that may create databases (sa in the local or CI container); each
 * run creates its own throwaway database and drops it afterwards. Without
 * TEST_DATABASE_URL these tests are skipped, so CI must always set it.
 */
import path from "node:path";
import { randomBytes } from "node:crypto";
import sql from "mssql";
import { checkDatabase, connectDatabase } from "../src/db";
import { checksumOf, migrate, readMigrations, type Migration } from "../src/migrate";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = serverUrl ? describe : describe.skip;

describeWithDatabase("with SQL Server", () => {
  const databaseName = `pianogo_test_${randomBytes(4).toString("hex")}`;
  let admin: sql.ConnectionPool;
  let pool: sql.ConnectionPool;
  const silent = () => {};

  beforeAll(async () => {
    admin = await connectDatabase(serverUrl!, { attempts: 3, log: silent });
    await admin.request().batch(`CREATE DATABASE [${databaseName}]`);
    const config = sql.ConnectionPool.parseConnectionString(serverUrl!);
    pool = await new sql.ConnectionPool({ ...config, database: databaseName }).connect();
  }, 60000);

  afterAll(async () => {
    await pool?.close();
    await admin
      ?.request()
      .batch(
        `ALTER DATABASE [${databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
         DROP DATABASE [${databaseName}];`,
      );
    await admin?.close();
  });

  const migrations = readMigrations(path.join(__dirname, "..", "migrations"));

  it("applies every migration on an empty database, then nothing", async () => {
    const lines: string[] = [];
    expect(await migrate(pool, migrations, (line) => lines.push(line))).toEqual(
      migrations.map((m) => m.name),
    );
    expect(lines[0]).toBe("migration applied: 001_init.sql");

    expect(await migrate(pool, migrations, silent)).toEqual([]);
    const rows = await pool.request().query(`SELECT version FROM schema_migrations`);
    expect(rows.recordset).toHaveLength(migrations.length);
  });

  it("reports a healthy database once migrated", async () => {
    await expect(checkDatabase(pool)).resolves.toBe(true);
  });

  it("002 keeps the sheets that 001's table already holds", async () => {
    // A database of its own, migrated only to 001 and filled with sheets, as
    // the deployed databases were before 002 shipped.
    const name = `${databaseName}_002`;
    await admin.request().batch(`CREATE DATABASE [${name}]`);
    const config = sql.ConnectionPool.parseConnectionString(serverUrl!);
    const old = await new sql.ConnectionPool({ ...config, database: name }).connect();
    try {
      await migrate(old, migrations.slice(0, 1), silent);
      await old.request().batch(
        `INSERT INTO sheets (title, composer, difficulty, original_filename, file_type,
                             file_bytes, practice_status, created_at)
         VALUES (N'Für Elise', N'Beethoven', N'Intermediate', N'elise.pdf', N'pdf',
                 0x255044462D, N'In progress', '2026-10-01T09:30:00'),
                (N'Waltz', N'Me', N'Beginner', N'waltz.musicxml', N'musicxml',
                 0x3C73636F72652F3E, N'Not started', '2026-10-02T18:00:00');`,
      );
      const columns = `id, title, composer, difficulty, original_filename, file_type,
                       file_bytes, practice_status, created_at`;
      const before = (await old.request().query(`SELECT ${columns} FROM sheets ORDER BY id`))
        .recordset;

      const lines: string[] = [];
      await migrate(old, migrations.slice(0, 2), (line) => lines.push(line));
      expect(lines).toEqual(["migration applied: 002_add_sheet_updated_at.sql"]);

      const after = await old
        .request()
        .query(`SELECT ${columns}, updated_at FROM sheets ORDER BY id`);
      // Every column 001 made is unchanged, and updated_at is the backfill.
      for (const [i, row] of after.recordset.entries()) {
        const { updated_at: updatedAt, ...rest } = row;
        expect(rest).toEqual(before[i]);
        expect(updatedAt).toEqual(row.created_at);
      }
      expect(after.recordset).toHaveLength(before.length);

      const nullable = await old
        .request()
        .query(
          `SELECT is_nullable FROM sys.columns
           WHERE object_id = OBJECT_ID(N'sheets') AND name = N'updated_at'`,
        );
      expect(nullable.recordset[0].is_nullable).toBe(false);
    } finally {
      await old.close();
      await admin
        .request()
        .batch(
          `ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
           DROP DATABASE [${name}];`,
        );
    }
  }, 60000);

  it("rolls back a failing migration completely", async () => {
    const broken: Migration = {
      version: "999",
      name: "999_broken.sql",
      sql: "CREATE TABLE half_done (id INT);\nGO\nSELECT * FROM no_such_table;",
      checksum: checksumOf("broken"),
    };
    await expect(migrate(pool, [...migrations, broken], silent)).rejects.toThrow();

    const table = await pool.request().query(`SELECT OBJECT_ID(N'half_done') AS id`);
    expect(table.recordset[0].id).toBeNull();
    const row = await pool
      .request()
      .query(`SELECT COUNT(*) AS n FROM schema_migrations WHERE version = '999'`);
    expect(row.recordset[0].n).toBe(0);
  });
});
