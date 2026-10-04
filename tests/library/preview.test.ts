import fs from "node:fs";
import path from "node:path";
import { createSheet, sheetPreviewPath } from "@/lib/library/repository";
import { sheetPreview } from "@/lib/library/preview";
import { dataDir } from "@/lib/db";
import { resetDb } from "../helpers/db";

beforeEach(() => {
  resetDb();
  // Sheet ids are reused once the table is empty, and so are preview names.
  fs.rmSync(path.join(dataDir(), "previews"), { recursive: true, force: true });
});

function upload(originalFilename: string) {
  return createSheet({
    title: "Preview",
    composer: "",
    difficulty: "Beginner",
    originalFilename,
    bytes: Buffer.from("content"),
  });
}

describe("sheetPreview", () => {
  it("returns null for invalid ids", async () => {
    await expect(sheetPreview(0)).resolves.toBeNull();
    await expect(sheetPreview(2.5)).resolves.toBeNull();
  });

  it("serves a preview that was already rendered", async () => {
    const sheet = upload("score.pdf");
    const target = sheetPreviewPath(sheet.id)!;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "cached png");

    const preview = await sheetPreview(sheet.id);
    expect(preview?.toString()).toBe("cached png");
  });

  it("does not render MusicXML or missing sheets on the server", async () => {
    const sheet = upload("score.musicxml");
    await expect(sheetPreview(sheet.id)).resolves.toBeNull();
    await expect(sheetPreview(9999)).resolves.toBeNull();
  });

  it("shares one render between callers asking at the same time", async () => {
    const sheet = upload("score.musicxml");
    const first = sheetPreview(sheet.id);
    expect(sheetPreview(sheet.id)).toBe(first);
    await first;
  });
});
