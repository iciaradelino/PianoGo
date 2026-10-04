import { getDb } from "@/lib/db";
import { createSheet } from "@/lib/library/repository";
import { defaultAnnotationStyle } from "@/lib/processing/annotation-style";
import { audiverisPath, recognise } from "@/lib/processing/omr/audiveris";
import { readOmrProject } from "@/lib/processing/omr/read-omr";
import { extractPdfNotes, type PdfPageNote } from "@/lib/processing/pdf/extract";
import {
  deleteAnnotations,
  generateAnnotations,
  getAnnotation,
  getPdfNotes,
  updateAnnotationStyle,
} from "@/lib/processing/repository";
import { resetDb } from "../helpers/db";

// pdf.js and Audiveris are outside code; their output is faked here.
jest.mock("@/lib/processing/pdf/extract", () => ({ extractPdfNotes: jest.fn() }));
jest.mock("@/lib/processing/omr/audiveris", () => ({
  audiverisPath: jest.fn(),
  recognise: jest.fn(),
}));
jest.mock("@/lib/processing/omr/read-omr", () => ({ readOmrProject: jest.fn() }));

const extract = jest.mocked(extractPdfNotes);
const findAudiveris = jest.mocked(audiverisPath);
const runAudiveris = jest.mocked(recognise);
const readProject = jest.mocked(readOmrProject);

function note(overrides: Partial<PdfPageNote> = {}): PdfPageNote {
  return {
    page: 1,
    x: 60,
    y: 100,
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

function upload(originalFilename: string) {
  return createSheet({
    title: "Sheet",
    composer: "",
    difficulty: "Beginner",
    originalFilename,
    bytes: Buffer.from("%PDF-1.7"),
  }).id;
}

const onePage = [{ width: 600, height: 800 }];
const settle = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  resetDb();
  jest.resetAllMocks();
});

describe("getAnnotation", () => {
  it("returns null for invalid ids and unknown sheets", () => {
    expect(getAnnotation(0)).toBeNull();
    expect(getAnnotation(9999)).toBeNull();
  });

  it("reports 'none' with the default style before a sheet is annotated", () => {
    const id = upload("score.musicxml");
    expect(getAnnotation(id)).toEqual({
      sheetId: id,
      status: "none",
      style: defaultAnnotationStyle,
    });
  });

  it("treats a scan that stopped with the server as failed", () => {
    const id = upload("scan.pdf");
    getDb()
      .prepare(
        `INSERT INTO annotations (sheet_id, status, style, created_at)
         VALUES (?, 'processing', 'not json', '')`,
      )
      .run(id);

    expect(getAnnotation(id)).toMatchObject({
      status: "failed",
      style: defaultAnnotationStyle,
    });
  });

  it("treats an unknown stored status as 'none'", () => {
    const id = upload("scan.pdf");
    getDb()
      .prepare(
        `INSERT INTO annotations (sheet_id, status, created_at) VALUES (?, 'odd', '')`,
      )
      .run(id);
    expect(getAnnotation(id)?.status).toBe("none");
  });
});

describe("generateAnnotations", () => {
  it("returns not-found for invalid ids and sheets without a file", async () => {
    await expect(generateAnnotations(-3)).resolves.toEqual({
      ok: false,
      reason: "not-found",
    });
    await expect(generateAnnotations(9999)).resolves.toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("only records the annotation for MusicXML, which is named in the browser", async () => {
    const id = upload("waltz.musicxml");
    const result = await generateAnnotations(id);

    expect(result).toEqual({
      ok: true,
      annotation: { sheetId: id, status: "ready", style: defaultAnnotationStyle },
    });
    expect(extract).not.toHaveBeenCalled();
  });

  it("stores the notes of a PDF with their piano key", async () => {
    const id = upload("score.pdf");
    extract.mockResolvedValue({
      pages: onePage,
      pagesWithStaves: 1,
      notes: [
        note(), // C4, middle C
        note({ step: "F", alter: 1, octave: 5, x: 80 }),
        note({ step: "A", octave: 0, page: 2, measure: 9 }), // lowest key
      ],
    });

    const result = await generateAnnotations(id);

    expect(result).toMatchObject({ ok: true, annotation: { status: "ready" } });
    expect(
      getPdfNotes(id).map((stored) => [stored.page, stored.step, stored.alter, stored.pianoKeyIndex]),
    ).toEqual([
      [1, "C", 0, 39],
      [1, "F", 1, 57],
      [2, "A", 0, 0],
    ]);
    expect(getPdfNotes(id)[0]).toEqual({ ...note(), pianoKeyIndex: 39 });
  });

  it("replaces old notes and keeps the style when a sheet is annotated again", async () => {
    const id = upload("score.pdf");
    extract.mockResolvedValue({ pages: onePage, pagesWithStaves: 1, notes: [note(), note()] });
    await generateAnnotations(id);
    updateAnnotationStyle(id, { color: "red" });

    extract.mockResolvedValue({ pages: onePage, pagesWithStaves: 1, notes: [note({ step: "D" })] });
    const result = await generateAnnotations(id);

    expect(getPdfNotes(id).map((stored) => stored.step)).toEqual(["D"]);
    expect(result).toMatchObject({ annotation: { style: { color: "red" } } });
  });

  it("reports that scans cannot be read without Audiveris", async () => {
    const id = upload("scan.pdf");
    extract.mockResolvedValue({ pages: onePage, pagesWithStaves: 0, notes: [] });
    findAudiveris.mockReturnValue(null);

    await expect(generateAnnotations(id)).resolves.toEqual({
      ok: false,
      reason: "no-reader",
    });
    expect(getAnnotation(id)?.status).toBe("none");
  });

  describe("with Audiveris installed", () => {
    beforeEach(() => {
      extract.mockResolvedValue({ pages: onePage, pagesWithStaves: 0, notes: [] });
      findAudiveris.mockReturnValue("/opt/audiveris/bin/Audiveris");
      jest.spyOn(console, "error").mockImplementation(() => {});
    });

    it("reads a scan in the background and reports progress", async () => {
      const id = upload("scan.pdf");
      let finish!: (project: Buffer) => void;
      runAudiveris.mockImplementation((_pdf, _pages, onProgress) => {
        onProgress?.({ sheet: 1, sheets: 1 });
        return new Promise((resolve) => (finish = resolve));
      });
      readProject.mockReturnValue([note({ step: "G" })]);

      const result = await generateAnnotations(id);
      expect(result).toEqual({
        ok: true,
        annotation: {
          sheetId: id,
          status: "processing",
          style: defaultAnnotationStyle,
          progress: { sheet: 1, sheets: 1 },
        },
      });

      // Asking again while it runs does not start a second job.
      await generateAnnotations(id);
      expect(runAudiveris).toHaveBeenCalledTimes(1);

      finish(Buffer.from("omr"));
      await settle();

      expect(readProject).toHaveBeenCalledWith(Buffer.from("omr"), onePage);
      expect(getAnnotation(id)).toEqual({
        sheetId: id,
        status: "ready",
        style: defaultAnnotationStyle,
      });
      expect(getPdfNotes(id).map((stored) => stored.step)).toEqual(["G"]);
    });

    it("marks the annotation failed when Audiveris fails", async () => {
      const id = upload("scan.pdf");
      runAudiveris.mockRejectedValue(new Error("Audiveris could not read this scan."));

      await generateAnnotations(id);
      await settle();

      expect(getAnnotation(id)?.status).toBe("failed");
      expect(console.error).toHaveBeenCalled();
    });

    it("marks the annotation failed when no notes are recognised", async () => {
      const id = upload("scan.pdf");
      runAudiveris.mockResolvedValue(Buffer.from("omr"));
      readProject.mockReturnValue([]);

      await generateAnnotations(id);
      await settle();

      expect(getAnnotation(id)?.status).toBe("failed");
      expect(getPdfNotes(id)).toEqual([]);
    });
  });
});

describe("getPdfNotes", () => {
  it("returns nothing for invalid ids or sheets without notes", () => {
    expect(getPdfNotes(0)).toEqual([]);
    expect(getPdfNotes(upload("score.pdf"))).toEqual([]);
  });
});

describe("updateAnnotationStyle", () => {
  it("saves a cleaned style", async () => {
    const id = upload("waltz.musicxml");
    await generateAnnotations(id);

    const updated = updateAnnotationStyle(id, {
      naming: "letters",
      showOctave: true,
      color: "not a colour",
    });

    expect(updated?.style).toEqual({
      ...defaultAnnotationStyle,
      naming: "letters",
      showOctave: true,
    });
    expect(getAnnotation(id)?.style).toEqual(updated?.style);
  });

  it("returns null when the sheet has no annotation yet", () => {
    expect(updateAnnotationStyle(0, {})).toBeNull();
    expect(updateAnnotationStyle(upload("waltz.musicxml"), {})).toBeNull();
  });
});

describe("deleteAnnotations", () => {
  it("removes the annotation and its notes but not the sheet", async () => {
    const id = upload("score.pdf");
    extract.mockResolvedValue({ pages: onePage, pagesWithStaves: 1, notes: [note()] });
    await generateAnnotations(id);

    deleteAnnotations(id);
    deleteAnnotations(0);

    expect(getPdfNotes(id)).toEqual([]);
    expect(getAnnotation(id)).toEqual({
      sheetId: id,
      status: "none",
      style: defaultAnnotationStyle,
    });
    const count = getDb().prepare(`SELECT COUNT(*) AS n FROM pdf_notes`).get() as { n: number };
    expect(count.n).toBe(0);
  });
});
