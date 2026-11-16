import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../../src/app";
import type { ReadSheetFile } from "../../src/library-client";
import { audiverisPath } from "../../src/processing/omr/audiveris";
import { extractPdfNotes } from "../../src/processing/pdf/extract";
import { createAnnotationRepository } from "../../src/processing/repository";
import { annotationRoutes } from "../../src/processing/routes";
import { describeWithDatabase, useTestDatabase } from "../helpers/database";

jest.mock("../../src/processing/pdf/extract", () => ({ extractPdfNotes: jest.fn() }));
jest.mock("../../src/processing/omr/audiveris", () => ({
  audiverisPath: jest.fn(),
  recognise: jest.fn(),
}));

describeWithDatabase("processing HTTP API", () => {
  const database = useTestDatabase();
  let server: Server;
  let baseUrl: string;

  // Sheet 1 is MusicXML, sheet 2 a scan, 503 a library that is down.
  const readSheetFile: ReadSheetFile = async (id) => {
    if (id === 1) return { ok: true, file: { fileType: "musicxml", bytes: Buffer.from("<x/>") } };
    if (id === 2) return { ok: true, file: { fileType: "pdf", bytes: Buffer.from("%PDF") } };
    if (id === 503) return { ok: false, reason: "unavailable" };
    return { ok: false, reason: "not-found" };
  };

  beforeAll((done) => {
    const app = createApp({
      config: {
        port: 0,
        databaseUrl: "",
        allowedOrigin: "http://ui",
        version: "test",
        libraryUrl: "",
        libraryTimeoutMs: 1000,
      },
      checkDatabase: async () => true,
      log: () => {},
      routes: annotationRoutes(createAnnotationRepository(database.pool(), readSheetFile)),
    });
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => database.empty("pdf_notes", "annotations"));

  function send(method: string, body: unknown) {
    return fetch(`${baseUrl}/annotations`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("generates, styles, reads and deletes an annotation", async () => {
    const created = await send("POST", { sheetId: 1 });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ sheetId: 1, status: "ready" });

    const styled = await send("PATCH", { sheetId: 1, style: { naming: "letters" } });
    expect(await styled.json()).toMatchObject({ style: { naming: "letters" } });

    const read = await fetch(`${baseUrl}/annotations?sheetId=1`);
    expect(await read.json()).toMatchObject({ status: "ready", style: { naming: "letters" } });

    const notes = await fetch(`${baseUrl}/annotations/notes?sheetId=1`);
    expect(await notes.json()).toEqual({ notes: [] });

    const deleted = await fetch(`${baseUrl}/annotations?sheetId=1`, { method: "DELETE" });
    expect(deleted.status).toBe(204);
    const after = await fetch(`${baseUrl}/annotations?sheetId=1`);
    expect(await after.json()).toMatchObject({ status: "none" });
  });

  it("answers 503 with a clear message when the library is down", async () => {
    const response = await send("POST", { sheetId: 503 });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error:
        "The library is not responding, so this sheet can't be annotated right now. Try again in a minute.",
    });
  });

  it("answers 503 for scans when Audiveris is missing", async () => {
    jest.mocked(extractPdfNotes).mockResolvedValue({ pages: [], pagesWithStaves: 0, notes: [] });
    jest.mocked(audiverisPath).mockReturnValue(null);
    const response = await send("POST", { sheetId: 2 });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("Audiveris");
  });

  it("answers 404 for unknown or invalid sheets", async () => {
    expect((await send("POST", { sheetId: 7 })).status).toBe(404);
    expect((await send("POST", {})).status).toBe(404);
    expect((await fetch(`${baseUrl}/annotations?sheetId=abc`)).status).toBe(404);
    expect((await send("PATCH", { sheetId: 7, style: {} })).status).toBe(404);
  });

  it("answers broken JSON with 400", async () => {
    const response = await fetch(`${baseUrl}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{oops",
    });
    expect(response.status).toBe(400);
  });
});
