import type { ReadSheetFile, SheetFile } from "../../src/library-client";
import { defaultAnnotationStyle } from "../../src/processing/annotation-style";
import { audiverisPath, recognise } from "../../src/processing/omr/audiveris";
import { readOmrProject } from "../../src/processing/omr/read-omr";
import { extractPdfNotes, type PdfPageNote } from "../../src/processing/pdf/extract";
import {
  createAnnotationRepository,
  type AnnotationRepository,
} from "../../src/processing/repository";
import { describeWithDatabase, useTestDatabase } from "../helpers/database";

// pdf.js and Audiveris are outside code; their output is faked here.
jest.mock("../../src/processing/pdf/extract", () => ({ extractPdfNotes: jest.fn() }));
jest.mock("../../src/processing/omr/audiveris", () => ({
  audiverisPath: jest.fn(),
  recognise: jest.fn(),
}));
jest.mock("../../src/processing/omr/read-omr", () => ({ readOmrProject: jest.fn() }));

const extract = jest.mocked(extractPdfNotes);
const findAudiveris = jest.mocked(audiverisPath);
const runAudiveris = jest.mocked(recognise);
const readProject = jest.mocked(readOmrProject);

function note(overrides: Partial<PdfPageNote> = {}): PdfPageNote {
  return {
    page: 1,
    x: 60.25,
    y: 100.125,
    width: 8,
    height: 6,
    staffSpace: 6,
    staffBottom: 124,
    step: "C",
    alter: 0,
    octave: 4,
    measure: 1,
    ...overrides,
  };
}

const onePage = [{ width: 600, height: 800 }];

describeWithDatabase("annotation repository", () => {
  const database = useTestDatabase();
  let annotations: AnnotationRepository;

  // The library is faked: sheet 1 is MusicXML, 2 to 9 are PDFs, 404 is
  // unknown, and 503 stands for a library that is down.
  const files = new Map<number, SheetFile>([
    [1, { fileType: "musicxml", bytes: Buffer.from("<score-partwise/>") }],
  ]);
  for (let id = 2; id <= 9; id++) files.set(id, { fileType: "pdf", bytes: Buffer.from("%PDF") });
  const readSheetFile = jest.fn<ReturnType<ReadSheetFile>, [number]>(async (id) => {
    if (id === 503) return { ok: false, reason: "unavailable" };
    const file = files.get(id);
    return file ? { ok: true, file } : { ok: false, reason: "not-found" };
  });

  beforeAll(() => {
    annotations = createAnnotationRepository(database.pool(), readSheetFile);
  });

  beforeEach(async () => {
    await database.empty("pdf_notes", "annotations");
    extract.mockReset();
    findAudiveris.mockReset();
    runAudiveris.mockReset();
    readProject.mockReset();
  });

  describe("getAnnotation", () => {
    it("returns null for invalid ids", async () => {
      expect(await annotations.getAnnotation(0)).toBeNull();
      expect(await annotations.getAnnotation(1.5)).toBeNull();
    });

    it("reports 'none' with the default style before a sheet is annotated", async () => {
      // Even for ids the library does not know: that is the library's to say.
      for (const id of [1, 999]) {
        expect(await annotations.getAnnotation(id)).toEqual({
          sheetId: id,
          status: "none",
          style: defaultAnnotationStyle,
        });
      }
    });

    it("treats a scan that stopped with the server as failed", async () => {
      await database
        .pool()
        .request()
        .query(`INSERT INTO annotations (sheet_id, status) VALUES (4, 'processing')`);
      expect(await annotations.getAnnotation(4)).toMatchObject({ status: "failed" });
    });
  });

  describe("generateAnnotations", () => {
    it("returns not-found for invalid ids and sheets the library does not have", async () => {
      expect(await annotations.generateAnnotations(-3)).toEqual({
        ok: false,
        reason: "not-found",
      });
      expect(await annotations.generateAnnotations(404)).toEqual({
        ok: false,
        reason: "not-found",
      });
    });

    it("reports a library that is down without storing anything", async () => {
      expect(await annotations.generateAnnotations(503)).toEqual({
        ok: false,
        reason: "library-unavailable",
      });
      expect((await annotations.getAnnotation(503))?.status).toBe("none");
    });

    it("only records the annotation for MusicXML, which is named in the browser", async () => {
      expect(await annotations.generateAnnotations(1)).toEqual({
        ok: true,
        annotation: { sheetId: 1, status: "ready", style: defaultAnnotationStyle },
      });
      expect(extract).not.toHaveBeenCalled();
    });

    it("stores the notes of a PDF with their piano key", async () => {
      extract.mockResolvedValue({
        pages: onePage,
        pagesWithStaves: 1,
        notes: [
          note(), // C4, middle C
          note({ step: "F", alter: 1, octave: 5, x: 80 }),
          note({ step: "A", octave: 0, page: 2, measure: 9 }), // lowest key
        ],
      });

      const result = await annotations.generateAnnotations(2);
      expect(result).toMatchObject({ ok: true, annotation: { status: "ready" } });

      const notes = await annotations.getPdfNotes(2);
      expect(notes.map((n) => [n.page, n.step, n.alter, n.pianoKeyIndex])).toEqual([
        [1, "C", 0, 39],
        [1, "F", 1, 57],
        [2, "A", 0, 0],
      ]);
      // Positions keep their decimals: the columns are FLOAT, not REAL.
      expect(notes[0]).toEqual({ ...note(), pianoKeyIndex: 39 });
    });

    it("replaces old notes and keeps the style when a sheet is annotated again", async () => {
      extract.mockResolvedValue({ pages: onePage, pagesWithStaves: 1, notes: [note(), note()] });
      await annotations.generateAnnotations(2);
      await annotations.updateAnnotationStyle(2, { color: "red" });

      extract.mockResolvedValue({ pages: onePage, pagesWithStaves: 1, notes: [note({ step: "D" })] });
      const result = await annotations.generateAnnotations(2);

      expect((await annotations.getPdfNotes(2)).map((n) => n.step)).toEqual(["D"]);
      expect(result).toMatchObject({ annotation: { style: { color: "red" } } });
    });

    it("annotates the same sheet twice at once without a duplicate row", async () => {
      await Promise.all([annotations.generateAnnotations(1), annotations.generateAnnotations(1)]);
      const rows = await database
        .pool()
        .request()
        .query(`SELECT COUNT(*) AS n FROM annotations WHERE sheet_id = 1`);
      expect(rows.recordset[0].n).toBe(1);
    });

    it("reports that scans cannot be read without Audiveris", async () => {
      extract.mockResolvedValue({ pages: onePage, pagesWithStaves: 0, notes: [] });
      findAudiveris.mockReturnValue(null);

      expect(await annotations.generateAnnotations(3)).toEqual({
        ok: false,
        reason: "no-reader",
      });
      expect((await annotations.getAnnotation(3))?.status).toBe("none");
    });

    describe("with Audiveris installed", () => {
      beforeEach(() => {
        extract.mockResolvedValue({ pages: onePage, pagesWithStaves: 0, notes: [] });
        findAudiveris.mockReturnValue("/opt/audiveris/bin/Audiveris");
        jest.spyOn(console, "error").mockImplementation(() => {});
      });

      afterEach(() => jest.mocked(console.error).mockRestore());

      it("reads a scan in the background and reports progress", async () => {
        let finish!: (project: Buffer) => void;
        runAudiveris.mockImplementation((_pdf, _pages, onProgress) => {
          onProgress?.({ sheet: 1, sheets: 1 });
          return new Promise((resolve) => (finish = resolve));
        });
        readProject.mockReturnValue([note({ step: "G" })]);

        expect(await annotations.generateAnnotations(4)).toEqual({
          ok: true,
          annotation: {
            sheetId: 4,
            status: "processing",
            style: defaultAnnotationStyle,
            progress: { sheet: 1, sheets: 1 },
          },
        });

        // Asking again while it runs neither starts a second job nor refetches.
        readSheetFile.mockClear();
        await annotations.generateAnnotations(4);
        expect(runAudiveris).toHaveBeenCalledTimes(1);
        expect(readSheetFile).not.toHaveBeenCalled();

        finish(Buffer.from("omr"));
        await annotations.idle();

        expect(readProject).toHaveBeenCalledWith(Buffer.from("omr"), onePage);
        expect(await annotations.getAnnotation(4)).toEqual({
          sheetId: 4,
          status: "ready",
          style: defaultAnnotationStyle,
        });
        expect((await annotations.getPdfNotes(4)).map((n) => n.step)).toEqual(["G"]);
      });

      it("marks the annotation failed when Audiveris fails", async () => {
        runAudiveris.mockRejectedValue(new Error("Audiveris could not read this scan."));
        await annotations.generateAnnotations(5);
        await annotations.idle();

        expect((await annotations.getAnnotation(5))?.status).toBe("failed");
        expect(console.error).toHaveBeenCalled();
      });

      it("marks the annotation failed when no notes are recognised", async () => {
        runAudiveris.mockResolvedValue(Buffer.from("omr"));
        readProject.mockReturnValue([]);
        await annotations.generateAnnotations(6);
        await annotations.idle();

        expect((await annotations.getAnnotation(6))?.status).toBe("failed");
        expect(await annotations.getPdfNotes(6)).toEqual([]);
      });
    });
  });

  describe("getPdfNotes", () => {
    it("returns nothing for invalid ids or sheets without notes", async () => {
      expect(await annotations.getPdfNotes(0)).toEqual([]);
      expect(await annotations.getPdfNotes(2)).toEqual([]);
    });
  });

  describe("updateAnnotationStyle", () => {
    it("saves a cleaned style", async () => {
      await annotations.generateAnnotations(1);
      const updated = await annotations.updateAnnotationStyle(1, {
        naming: "letters",
        showOctave: true,
        color: "not a colour",
      });

      expect(updated?.style).toEqual({
        ...defaultAnnotationStyle,
        naming: "letters",
        showOctave: true,
      });
      expect((await annotations.getAnnotation(1))?.style).toEqual(updated?.style);
    });

    it("returns null when the sheet has no annotation yet", async () => {
      expect(await annotations.updateAnnotationStyle(0, {})).toBeNull();
      expect(await annotations.updateAnnotationStyle(1, {})).toBeNull();
    });
  });

  describe("deleteAnnotations", () => {
    it("removes the annotation and its notes", async () => {
      extract.mockResolvedValue({ pages: onePage, pagesWithStaves: 1, notes: [note()] });
      await annotations.generateAnnotations(2);

      await annotations.deleteAnnotations(2);
      await annotations.deleteAnnotations(0);

      expect(await annotations.getPdfNotes(2)).toEqual([]);
      expect((await annotations.getAnnotation(2))?.status).toBe("none");
      const count = await database.pool().request().query(`SELECT COUNT(*) AS n FROM pdf_notes`);
      expect(count.recordset[0].n).toBe(0);
    });
  });
});
