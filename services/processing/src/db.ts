import sql from "mssql";

export type RetryOptions = {
  attempts?: number;
  firstDelayMs?: number;
  maxDelayMs?: number;
  log?: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Calls `connect` until it succeeds, waiting twice as long after each failure
 * (1 s, 2 s, 4 s, ... up to 15 s). With the defaults it keeps trying for about
 * 100 s, longer than an Azure SQL serverless database takes to resume from
 * pause (it refuses connections with error 40613 meanwhile).
 */
export async function withRetry<T>(
  connect: () => Promise<T>,
  {
    attempts = 10,
    firstDelayMs = 1000,
    maxDelayMs = 15000,
    log = console.log,
    sleep = wait,
  }: RetryOptions = {},
): Promise<T> {
  let delay = firstDelayMs;
  for (let attempt = 1; ; attempt++) {
    try {
      return await connect();
    } catch (error) {
      if (attempt >= attempts) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      log(
        `database not reachable (attempt ${attempt}/${attempts}): ${reason}; retrying in ${delay / 1000}s`,
      );
      await sleep(delay);
      delay = Math.min(delay * 2, maxDelayMs);
    }
  }
}

/** Opens a connection pool to this service's own database. */
export function connectDatabase(connectionString: string, options?: RetryOptions) {
  return withRetry(() => new sql.ConnectionPool(connectionString).connect(), options);
}

/**
 * True when the service can both write to and read from its own database.
 * `health_check` holds one row, created by the first migration.
 */
export async function checkDatabase(pool: sql.ConnectionPool) {
  try {
    const result = await pool.request().query<{ checked_at: Date }>(
      `UPDATE health_check SET checked_at = SYSUTCDATETIME() WHERE id = 1;
       SELECT checked_at FROM health_check WHERE id = 1;`,
    );
    return result.recordset.length === 1;
  } catch {
    return false;
  }
}
