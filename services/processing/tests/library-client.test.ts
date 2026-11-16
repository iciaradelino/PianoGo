import http from "node:http";
import type { AddressInfo } from "node:net";
import { createLibraryClient } from "../src/library-client";

// A stand-in for the library service, answering by sheet id.
let server: http.Server;
let baseUrl: string;

beforeAll((done) => {
  server = http.createServer((req, res) => {
    const id = req.url?.match(/^\/sheets\/(\d+)\/file$/)?.[1];
    if (id === "1") {
      res.writeHead(200, { "Content-Type": "application/pdf" }).end("%PDF");
    } else if (id === "2") {
      res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" }).end("<x/>");
    } else if (id === "500") {
      res.writeHead(500).end();
    } else if (id === "999") {
      // Never answers, like a library stuck on a paused database.
    } else {
      res.writeHead(404, { "Content-Type": "application/json" }).end("{}");
    }
  });
  server.listen(0, () => {
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    done();
  });
});

afterAll((done) => {
  server.closeAllConnections();
  server.close(done);
});

describe("createLibraryClient", () => {
  const lines: string[] = [];
  const log = (line: string) => lines.push(line);
  beforeEach(() => (lines.length = 0));

  it("returns the file and its type", async () => {
    const read = createLibraryClient(baseUrl, 1000, log);
    expect(await read(1)).toEqual({
      ok: true,
      file: { fileType: "pdf", bytes: Buffer.from("%PDF") },
    });
    expect(await read(2)).toMatchObject({ ok: true, file: { fileType: "musicxml" } });
  });

  it("passes on a 404 as not-found", async () => {
    expect(await createLibraryClient(baseUrl, 1000, log)(7)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("treats a library error as unavailable", async () => {
    expect(await createLibraryClient(baseUrl, 1000, log)(500)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(lines).toEqual(["library answered 500 for sheet 500"]);
  });

  it("gives up after the timeout", async () => {
    const started = Date.now();
    expect(await createLibraryClient(baseUrl, 200, log)(999)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(lines).toEqual(["library unreachable for sheet 999: no answer within 200 ms"]);
  });

  it("treats a library that is not running as unavailable", async () => {
    // Take a free port and close it again, so nothing is listening there.
    const closed = http.createServer();
    await new Promise<void>((resolve) => closed.listen(0, resolve));
    const port = (closed.address() as AddressInfo).port;
    await new Promise((resolve) => closed.close(resolve));

    const read = createLibraryClient(`http://127.0.0.1:${port}`, 1000, log);
    expect(await read(1)).toEqual({ ok: false, reason: "unavailable" });
    expect(lines[0]).toMatch(/^library unreachable for sheet 1: .*ECONNREFUSED/);
  });
});
