/**
 * The only place processing talks to the library service (ADR-6): it fetches
 * a sheet's file over HTTP instead of reading the library's database.
 */

export type SheetFile = { fileType: "pdf" | "musicxml"; bytes: Buffer };

export type SheetFileResult =
  | { ok: true; file: SheetFile }
  | { ok: false; reason: "not-found" | "unavailable" };

export type ReadSheetFile = (sheetId: number) => Promise<SheetFileResult>;

export function createLibraryClient(
  baseUrl: string,
  timeoutMs: number,
  log: (line: string) => void = console.log,
): ReadSheetFile {
  return async (sheetId) => {
    try {
      // The timeout covers the whole call, including reading the file, so a
      // library that hangs can never hang this request.
      const response = await fetch(`${baseUrl}/sheets/${sheetId}/file`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 404) return { ok: false, reason: "not-found" };
      if (!response.ok) {
        log(`library answered ${response.status} for sheet ${sheetId}`);
        return { ok: false, reason: "unavailable" };
      }
      const type = response.headers.get("content-type") ?? "";
      return {
        ok: true,
        file: {
          fileType: type.startsWith("application/pdf") ? "pdf" : "musicxml",
          bytes: Buffer.from(await response.arrayBuffer()),
        },
      };
    } catch (error) {
      // fetch fails with "fetch failed" and puts the real reason (such as
      // ECONNREFUSED) in `cause`.
      const failure = error as { name?: string; message?: string; cause?: { message?: string } };
      const reason =
        failure.name === "TimeoutError"
          ? `no answer within ${timeoutMs} ms`
          : (failure.cause?.message ?? failure.message ?? String(error));
      log(`library unreachable for sheet ${sheetId}: ${reason}`);
      return { ok: false, reason: "unavailable" };
    }
  };
}
