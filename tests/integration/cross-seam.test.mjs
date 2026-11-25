// Cross-seam integration test: both services running for real, as in
// docker compose, with no fakes. It checks the one server-side call across
// the seam (processing -> GET library/sheets/{id}/file) and what happens when
// library is down.
//
// Run from the repository root, with the stack up:
//   docker compose up -d --build library processing
//   node --test "tests/integration/*.test.mjs"
//
// It stops and restarts the library container itself (`docker compose stop`),
// so it needs the docker CLI. It uses only Node's built-in modules.

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const LIBRARY = process.env.LIBRARY_URL ?? "http://localhost:8001";
const PROCESSING = process.env.PROCESSING_URL ?? "http://localhost:8002";
// Processing's LIBRARY_TIMEOUT_S in docker-compose.yml, plus some slack.
const LIBRARY_TIMEOUT_MS = 10_000;

const fixture = new URL(
  "../../services/processing/tests/processing/fixtures/waltz-in-g.musicxml",
  import.meta.url,
);

function compose(...args) {
  execFileSync("docker", ["compose", ...args], { stdio: "inherit" });
}

async function waitForHealth(baseUrl, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5_000) });
      if (response.status === 200) return;
    } catch {
      // Not up yet.
    }
    if (Date.now() > deadline) throw new Error(`${baseUrl}/health never returned 200`);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

function annotate(sheetId) {
  return fetch(`${PROCESSING}/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sheetId }),
  });
}

let sheetId;

before(async () => {
  await waitForHealth(LIBRARY);
  await waitForHealth(PROCESSING);

  const form = new FormData();
  form.set("title", "Cross-seam test");
  form.set("difficulty", "Beginner");
  form.set("file", new Blob([await readFile(fixture)]), "waltz-in-g.musicxml");
  const response = await fetch(`${LIBRARY}/sheets`, { method: "POST", body: form });
  assert.equal(response.status, 201);
  sheetId = (await response.json()).id;
});

after(async () => {
  // Leave the stack as it was found, and remove the test data from both sides.
  compose("start", "library");
  await waitForHealth(LIBRARY);
  if (sheetId) {
    await fetch(`${LIBRARY}/sheets/${sheetId}`, { method: "DELETE" });
    await fetch(`${PROCESSING}/annotations?sheetId=${sheetId}`, { method: "DELETE" });
  }
});

test("processing annotates a sheet whose file it fetches from library", async () => {
  const response = await annotate(sheetId);
  assert.equal(response.status, 201);
  const annotation = await response.json();
  assert.equal(annotation.sheetId, sheetId);
  assert.equal(annotation.status, "ready");

  const stored = await (await fetch(`${PROCESSING}/annotations?sheetId=${sheetId}`)).json();
  assert.equal(stored.status, "ready");
});

test("a sheet library does not have is a 404, not a 503", async () => {
  const response = await annotate(2_000_000_000);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Sheet not found." });
});

test("with library stopped, the cross-seam call fails fast with a clear 503", async () => {
  compose("stop", "library");

  const started = Date.now();
  const response = await annotate(sheetId);
  const elapsed = Date.now() - started;

  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /library is not responding/);
  assert.ok(elapsed < LIBRARY_TIMEOUT_MS + 5_000, `took ${elapsed} ms`);
});

test("with library stopped, processing still serves its own data and is healthy", async () => {
  const annotation = await fetch(`${PROCESSING}/annotations?sheetId=${sheetId}`);
  assert.equal(annotation.status, 200);
  assert.equal((await annotation.json()).status, "ready");

  const style = await fetch(`${PROCESSING}/annotations`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sheetId, style: { color: "green" } }),
  });
  assert.equal(style.status, 200);
  assert.equal((await style.json()).style.color, "green");

  const health = await fetch(`${PROCESSING}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).db, "ok");
});

test("once library is back, the cross-seam call works again", async () => {
  compose("start", "library");
  await waitForHealth(LIBRARY);

  const response = await annotate(sheetId);
  assert.equal(response.status, 201);
});
