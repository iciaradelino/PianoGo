import fs from "node:fs";
import path from "node:path";
import { dataDir, getDb } from "@/lib/db";
import { SheetInputError } from "@/lib/library/model";
import {
  createSheet,
  deleteSheet,
  listSheets,
  readSheetFile,
  sheetPreviewPath,
  updateSheet,
} from "@/lib/library/repository";
import { resetDb } from "../helpers/db";

function upload(overrides: Partial<Parameters<typeof createSheet>[0]> = {}) {
  return createSheet({
    title: "Waltz in G",
    composer: "PianoGo Examples",
    difficulty: "Beginner",
    originalFilename: "waltz.musicxml",
    bytes: Buffer.from("<score-partwise/>"),
    ...overrides,
  });
}

function uploadedFiles() {
  const directory = path.join(dataDir(), "uploads");
  return fs.existsSync(directory) ? fs.readdirSync(directory) : [];
}

beforeEach(() => {
  resetDb();
  fs.rmSync(path.join(dataDir(), "uploads"), { recursive: true, force: true });
});

describe("createSheet", () => {
  it("stores the file under DATA_DIR and a row in sheets", () => {
    const sheet = upload();

    expect(sheet).toEqual({
      id: expect.any(Number),
      title: "Waltz in G",
      composer: "PianoGo Examples",
      difficulty: "Beginner",
      status: "Not started",
      fileType: "musicxml",
    });
    const row = getDb()
      .prepare(`SELECT file_path, original_filename FROM sheets WHERE id = ?`)
      .get(sheet.id) as { file_path: string; original_filename: string };
    expect(row.original_filename).toBe("waltz.musicxml");
    expect(row.file_path).toMatch(/^uploads\/[0-9a-f]{32}\.musicxml$/);
    expect(fs.readFileSync(path.join(dataDir(), row.file_path), "utf8")).toBe(
      "<score-partwise/>",
    );
  });

  it("rejects empty, oversized and unsupported files before writing anything", () => {
    expect(() => upload({ bytes: Buffer.alloc(0) })).toThrow("This file is empty.");
    expect(() => upload({ bytes: Buffer.alloc(20 * 1024 * 1024 + 1) })).toThrow(
      "This file is too large.",
    );
    expect(() => upload({ originalFilename: "song.mp3" })).toThrow(SheetInputError);
    expect(uploadedFiles()).toEqual([]);
    expect(listSheets()).toEqual([]);
  });

  it("removes the stored file when the database insert fails", () => {
    const database = getDb();
    database.exec(`ALTER TABLE sheets RENAME TO sheets_away`);
    try {
      expect(() => upload()).toThrow();
    } finally {
      database.exec(`ALTER TABLE sheets_away RENAME TO sheets`);
    }
    expect(uploadedFiles()).toEqual([]);
  });
});

describe("listSheets", () => {
  it("lists the newest sheet first", () => {
    const first = upload({ title: "First" });
    const second = upload({ title: "Second", originalFilename: "second.pdf" });

    expect(listSheets().map((sheet) => [sheet.id, sheet.fileType])).toEqual([
      [second.id, "pdf"],
      [first.id, "musicxml"],
    ]);
  });
});

describe("readSheetFile", () => {
  it("returns the stored bytes with the original file name", () => {
    const sheet = upload();
    const file = readSheetFile(sheet.id);

    expect(file?.filename).toBe("waltz.musicxml");
    expect(file?.fileType).toBe("musicxml");
    expect(file?.bytes.toString()).toBe("<score-partwise/>");
  });

  it("returns null for bad ids, unknown sheets and missing files", () => {
    expect(readSheetFile(0)).toBeNull();
    expect(readSheetFile(1.5)).toBeNull();
    expect(readSheetFile(9999)).toBeNull();

    const sheet = upload();
    for (const file of uploadedFiles()) {
      fs.rmSync(path.join(dataDir(), "uploads", file));
    }
    expect(readSheetFile(sheet.id)).toBeNull();
  });

  it("never reads a stored path outside the uploads folder", () => {
    fs.writeFileSync(path.join(dataDir(), "secret.txt"), "secret");
    const sheet = upload();
    getDb()
      .prepare(`UPDATE sheets SET file_path = ? WHERE id = ?`)
      .run("uploads/../secret.txt", sheet.id);

    expect(readSheetFile(sheet.id)).toBeNull();
  });
});

describe("updateSheet", () => {
  const details = {
    title: " Waltz ",
    composer: "Me",
    difficulty: "Advanced",
    status: "Completed",
  };

  it("saves new details and returns the updated sheet", () => {
    const sheet = upload();
    const updated = updateSheet(sheet.id, details);

    expect(updated).toEqual({
      ...sheet,
      title: "Waltz",
      composer: "Me",
      difficulty: "Advanced",
      status: "Completed",
    });
    expect(listSheets()).toEqual([updated]);
  });

  it("returns null for a sheet that does not exist", () => {
    expect(updateSheet(-1, details)).toBeNull();
    expect(updateSheet(9999, details)).toBeNull();
  });

  it("validates before writing", () => {
    const sheet = upload();
    expect(() => updateSheet(sheet.id, { ...details, title: "" })).toThrow(
      SheetInputError,
    );
    expect(listSheets()[0].title).toBe("Waltz in G");
  });
});

describe("deleteSheet", () => {
  it("removes the row, the uploaded file and the cached preview", () => {
    const sheet = upload({ originalFilename: "score.pdf" });
    const preview = sheetPreviewPath(sheet.id)!;
    fs.mkdirSync(path.dirname(preview), { recursive: true });
    fs.writeFileSync(preview, "png");

    expect(deleteSheet(sheet.id)).toBe(true);
    expect(listSheets()).toEqual([]);
    expect(uploadedFiles()).toEqual([]);
    expect(fs.existsSync(preview)).toBe(false);
  });

  it("returns false when there is nothing to delete", () => {
    expect(deleteSheet(0)).toBe(false);
    expect(deleteSheet(9999)).toBe(false);
  });
});

describe("sheetPreviewPath", () => {
  it("only builds paths for valid ids", () => {
    expect(sheetPreviewPath(3)).toBe(path.join(dataDir(), "previews", "3.png"));
    expect(sheetPreviewPath(0)).toBeNull();
    expect(sheetPreviewPath(Number.NaN)).toBeNull();
  });
});
