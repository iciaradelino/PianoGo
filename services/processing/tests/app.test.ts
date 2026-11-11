import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../src/app";
import type { Config } from "../src/config";

const config: Config = {
  port: 0,
  databaseUrl: "unused",
  allowedOrigin: "https://ui.example.net",
  version: "abc123",
  libraryUrl: "http://library.invalid",
  libraryTimeoutMs: 1000,
};

let server: Server;
let baseUrl: string;
let databaseOk = true;
let lines: string[] = [];

beforeAll((done) => {
  const app = createApp({
    config,
    checkDatabase: async () => databaseOk,
    log: (line) => lines.push(line),
  });
  server = app.listen(0, () => {
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    done();
  });
});

afterAll((done) => {
  server.close(done);
});

beforeEach(() => {
  databaseOk = true;
  lines = [];
});

describe("GET /health", () => {
  it("is 200 with the version when the database works", async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      service: "processing",
      db: "ok",
      version: "abc123",
    });
  });

  it("is 503 when the database does not", async () => {
    databaseOk = false;
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: "error", db: "error" });
  });
});

describe("request log", () => {
  it("writes one line with method, path, status and duration", async () => {
    await fetch(`${baseUrl}/health?probe=1`);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^GET \/health 200 \d+\.\dms$/);
  });
});

describe("CORS", () => {
  it("allows the UI's origin", async () => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { Origin: "https://ui.example.net" },
    });
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://ui.example.net",
    );
  });

  it("gives no CORS headers to other origins", async () => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { Origin: "https://evil.example.com" },
    });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("answers the UI's preflight requests", async () => {
    const response = await fetch(`${baseUrl}/sheets`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://ui.example.net",
        "Access-Control-Request-Method": "PATCH",
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain("PATCH");
  });
});

describe("errors", () => {
  it("answers unknown paths with JSON", async () => {
    const response = await fetch(`${baseUrl}/nope`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found." });
  });
});
