import { SheetInputError } from "../../src/library/model";
import {
  createSheetRepository,
  MAX_FILE_BYTES,
  type SheetRepository,
} from "../../src/library/repository";
import { describeWithDatabase, useTestDatabase } from "../helpers/database";

describeWithDatabase("sheet repository", () => {
  const database = useTestDatabase();
  let sheets: SheetRepository;

  beforeAll(() => {
    sheets = createSheetRepository(database.pool());
  });

  beforeEach(() => database.empty("sheets"));

  function upload(overrides: Partial<Parameters<SheetRepository["createSheet"]>[0]> = {}) {
    return sheets.createSheet({
      title: "Waltz in G",
      composer: "PianoGo Examples",
      difficulty: "Beginner",
      originalFilename: "waltz.musicxml",
      bytes: Buffer.from("<score-partwise/>"),
      ...overrides,
    });
  }

  describe("createSheet", () => {
    it("stores the sheet and its file in one row", async () => {
      const sheet = await upload();
      expect(sheet).toEqual({
        id: expect.any(Number),
        title: "Waltz in G",
        composer: "PianoGo Examples",
        difficulty: "Beginner",
        status: "Not started",
        fileType: "musicxml",
      });

      const row = await database
        .pool()
        .request()
        .query(`SELECT original_filename, file_bytes FROM sheets`);
      expect(row.recordset[0].original_filename).toBe("waltz.musicxml");
      expect(row.recordset[0].file_bytes.toString()).toBe("<score-partwise/>");
    });

    it("rejects empty, oversized and unsupported files before writing anything", async () => {
      await expect(upload({ bytes: Buffer.alloc(0) })).rejects.toThrow("This file is empty.");
      await expect(upload({ bytes: Buffer.alloc(MAX_FILE_BYTES + 1) })).rejects.toThrow(
        "This file is too large.",
      );
      await expect(upload({ originalFilename: "song.mp3" })).rejects.toThrow(SheetInputError);
      expect(await sheets.listSheets()).toEqual([]);
    });

    it("keeps names with accents and other scripts", async () => {
      const sheet = await upload({ title: "Für Elise", composer: "ベートーヴェン" });
      expect(sheet).toMatchObject({ title: "Für Elise", composer: "ベートーヴェン" });
    });
  });

  describe("listSheets", () => {
    it("lists the newest sheet first", async () => {
      const first = await upload({ title: "First" });
      const second = await upload({ title: "Second", originalFilename: "second.pdf" });
      expect((await sheets.listSheets()).map((sheet) => [sheet.id, sheet.fileType])).toEqual([
        [second.id, "pdf"],
        [first.id, "musicxml"],
      ]);
    });
  });

  describe("readSheetFile", () => {
    it("returns the stored bytes with the original file name", async () => {
      const sheet = await upload();
      expect(await sheets.readSheetFile(sheet.id)).toEqual({
        filename: "waltz.musicxml",
        fileType: "musicxml",
        bytes: Buffer.from("<score-partwise/>"),
      });
    });

    it("returns null for bad ids and unknown sheets", async () => {
      expect(await sheets.readSheetFile(0)).toBeNull();
      expect(await sheets.readSheetFile(1.5)).toBeNull();
      expect(await sheets.readSheetFile(2 ** 40)).toBeNull();
      expect(await sheets.readSheetFile(999999)).toBeNull();
    });
  });

  describe("updateSheet", () => {
    const details = {
      title: " Waltz ",
      composer: "Me",
      difficulty: "Advanced",
      status: "Completed",
    };

    it("saves new details and returns the updated sheet", async () => {
      const sheet = await upload();
      const updated = await sheets.updateSheet(sheet.id, details);
      expect(updated).toEqual({
        ...sheet,
        title: "Waltz",
        composer: "Me",
        difficulty: "Advanced",
        status: "Completed",
      });
      expect(await sheets.listSheets()).toEqual([updated]);
    });

    it("returns null for a sheet that does not exist", async () => {
      expect(await sheets.updateSheet(-1, details)).toBeNull();
      expect(await sheets.updateSheet(999999, details)).toBeNull();
    });

    it("validates before writing", async () => {
      const sheet = await upload();
      await expect(sheets.updateSheet(sheet.id, { ...details, title: "" })).rejects.toThrow(
        SheetInputError,
      );
      expect((await sheets.listSheets())[0].title).toBe("Waltz in G");
    });
  });

  describe("deleteSheet", () => {
    it("removes the row and its file", async () => {
      const sheet = await upload();
      expect(await sheets.deleteSheet(sheet.id)).toBe(true);
      expect(await sheets.listSheets()).toEqual([]);
      expect(await sheets.readSheetFile(sheet.id)).toBeNull();
    });

    it("returns false when there is nothing to delete", async () => {
      expect(await sheets.deleteSheet(0)).toBe(false);
      expect(await sheets.deleteSheet(999999)).toBe(false);
    });

    it("never gives a deleted sheet's id to a new sheet", async () => {
      const first = await upload();
      await sheets.deleteSheet(first.id);
      const second = await upload();
      expect(second.id).toBeGreaterThan(first.id);
    });
  });
});
