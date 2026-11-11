import type sql from "mssql";
import { checkDatabase, withRetry } from "../src/db";

describe("withRetry", () => {
  it("doubles the wait after each failure up to the maximum", async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 5) throw new Error("Database is paused (40613)");
        return "pool";
      },
      {
        firstDelayMs: 1000,
        maxDelayMs: 5000,
        log: () => {},
        sleep: async (ms) => {
          waits.push(ms);
        },
      },
    );
    expect(result).toBe("pool");
    expect(waits).toEqual([1000, 2000, 4000, 5000]);
  });

  it("gives up after the last attempt with the last error", async () => {
    const lines: string[] = [];
    await expect(
      withRetry(() => Promise.reject(new Error("refused")), {
        attempts: 3,
        log: (line) => lines.push(line),
        sleep: async () => {},
      }),
    ).rejects.toThrow("refused");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("attempt 1/3");
  });
});

describe("checkDatabase", () => {
  function fakePool(query: () => Promise<unknown>) {
    return { request: () => ({ query }) } as unknown as sql.ConnectionPool;
  }

  it("is true when the health row is written and read back", async () => {
    const pool = fakePool(async () => ({ recordset: [{ checked_at: new Date() }] }));
    await expect(checkDatabase(pool)).resolves.toBe(true);
  });

  it("is false when the row is missing or the query fails", async () => {
    await expect(checkDatabase(fakePool(async () => ({ recordset: [] })))).resolves.toBe(
      false,
    );
    await expect(
      checkDatabase(fakePool(() => Promise.reject(new Error("timeout")))),
    ).resolves.toBe(false);
  });
});
