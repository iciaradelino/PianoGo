import path from "node:path";
import { randomBytes } from "node:crypto";
import sql from "mssql";
import { connectDatabase } from "../../src/db";
import { migrate, readMigrations } from "../../src/migrate";

/**
 * Tests that need SQL Server run only when TEST_DATABASE_URL is set: a
 * connection string for a login that may create databases (sa in the local
 * or CI container). CI must always set it, or these tests are skipped.
 */
export const describeWithDatabase = process.env.TEST_DATABASE_URL
  ? describe
  : describe.skip;

/**
 * Creates a throwaway database for one test file, applies this service's
 * migrations to it, and drops it when the file is done. Call it inside
 * describeWithDatabase.
 */
export function useTestDatabase() {
  const serverUrl = process.env.TEST_DATABASE_URL!;
  const name = `pianogo_test_${randomBytes(4).toString("hex")}`;
  let admin: sql.ConnectionPool;
  let pool: sql.ConnectionPool;

  beforeAll(async () => {
    admin = await connectDatabase(serverUrl, { attempts: 3, log: () => {} });
    await admin.request().batch(`CREATE DATABASE [${name}]`);
    const config = sql.ConnectionPool.parseConnectionString(serverUrl);
    pool = await new sql.ConnectionPool({ ...config, database: name }).connect();
    await migrate(pool, readMigrations(path.join(__dirname, "..", "..", "migrations")), () => {});
  }, 60000);

  afterAll(async () => {
    await pool?.close();
    await admin
      ?.request()
      .batch(
        `ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
         DROP DATABASE [${name}];`,
      );
    await admin?.close();
  });

  return {
    pool: () => pool,
    /** Deletes every row from the given tables, in order. */
    async empty(...tables: string[]) {
      for (const table of tables) await pool.request().batch(`DELETE FROM ${table}`);
    },
  };
}
