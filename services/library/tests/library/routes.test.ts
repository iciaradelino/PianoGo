import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../../src/app";
import { createPreviewCache } from "../../src/library/preview";
import { createSheetRepository, MAX_FILE_BYTES } from "../../src/library/repository";
import { sheetRoutes } from "../../src/library/routes";
import { describeWithDatabase, useTestDatabase } from "../helpers/database";

describeWithDatabase("library HTTP API", () => {
  const database = useTestDatabase();
  let server: Server;
  let baseUrl: string;
  const render = jest.fn(async () => Buffer.from("png"));

  beforeAll((done) => {
    const sheets = createSheetRepository(database.pool());
    const app = createApp({
      config: { port: 0, databaseUrl: "", allowedOrigin: "http://ui", version: "test" },
      checkDatabase: async () => true,
      log: () => {},
      routes: sheetRoutes(sheets, createPreviewCache(sheets.readSheetFile, render)),
    });
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => database.empty("sheets"));

  function upload(fields: Record<string, string> = {}, file?: { name: string; bytes: Buffer }) {
    const form = new FormData();
    const values = { title: "Waltz", composer: "Me", difficulty: "Beginner", ...fields };
    for (const [key, value] of Object.entries(values)) form.set(key, value);
    const chosen = file ?? { name: "waltz.musicxml", bytes: Buffer.from("<score-partwise/>") };
    form.set("file", new Blob([new Uint8Array(chosen.bytes)]), chosen.name);
    return fetch(`${baseUrl}/sheets`, { method: "POST", body: form });
  }

  it("uploads, lists, edits, serves and deletes a sheet", async () => {
    const created = await upload({}, { name: "Für Elise.pdf", bytes: Buffer.from("%PDF") });
    expect(created.status).toBe(201);
    const sheet = await created.json();
    expect(sheet).toMatchObject({ title: "Waltz", fileType: "pdf", status: "Not started" });

    const list = await fetch(`${baseUrl}/sheets`);
    expect(await list.json()).toEqual([sheet]);

    const edited = await fetch(`${baseUrl}/sheets/${sheet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Waltz no. 2",
        composer: "Me",
        difficulty: "Advanced",
        status: "In progress",
      }),
    });
    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({ title: "Waltz no. 2", status: "In progress" });

    const file = await fetch(`${baseUrl}/sheets/${sheet.id}/file`);
    expect(file.headers.get("content-type")).toBe("application/pdf");
    expect(file.headers.get("content-disposition")).toBe('inline; filename="F_r Elise.pdf"');
    expect(Buffer.from(await file.arrayBuffer()).toString()).toBe("%PDF");

    const preview = await fetch(`${baseUrl}/sheets/${sheet.id}/preview`);
    expect(preview.headers.get("content-type")).toBe("image/png");

    expect((await fetch(`${baseUrl}/sheets/${sheet.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await fetch(`${baseUrl}/sheets/${sheet.id}/file`)).status).toBe(404);
  });

  it("keeps the original file name in UTF-8", async () => {
    const created = await (await upload({}, { name: "エリーゼ.xml", bytes: Buffer.from("<x/>") })).json();
    const file = await fetch(`${baseUrl}/sheets/${created.id}/file`);
    expect(file.headers.get("content-type")).toContain("application/xml");
    const row = await database.pool().request().query(`SELECT original_filename FROM sheets`);
    expect(row.recordset[0].original_filename).toBe("エリーゼ.xml");
  });

  it("answers bad uploads with 400 and a message", async () => {
    const noFile = await fetch(`${baseUrl}/sheets`, { method: "POST", body: new FormData() });
    expect(noFile.status).toBe(400);
    expect(await noFile.json()).toEqual({ error: "Choose a PDF or MusicXML file." });

    const wrongType = await upload({}, { name: "song.mp3", bytes: Buffer.from("x") });
    expect(wrongType.status).toBe(400);

    const noTitle = await upload({ title: " " });
    expect(await noTitle.json()).toEqual({ error: "Add a title." });

    const tooLarge = await upload({}, { name: "big.pdf", bytes: Buffer.alloc(MAX_FILE_BYTES + 1) });
    expect(tooLarge.status).toBe(400);
    expect(await tooLarge.json()).toEqual({ error: "This file is too large." });
  });

  it("answers broken JSON with 400", async () => {
    const response = await fetch(`${baseUrl}/sheets/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(response.status).toBe(400);
  });

  it("answers unknown sheets with 404", async () => {
    const patch = await fetch(`${baseUrl}/sheets/999999`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "x", difficulty: "Beginner", status: "Completed" }),
    });
    expect(patch.status).toBe(404);
    expect((await fetch(`${baseUrl}/sheets/abc`, { method: "DELETE" })).status).toBe(404);
    expect((await fetch(`${baseUrl}/sheets/999999/preview`)).status).toBe(404);
  });
});
