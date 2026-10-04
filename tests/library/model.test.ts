import {
  fileKind,
  SheetInputError,
  validateSheetDetails,
  validateUpload,
} from "@/lib/library/model";

const upload = {
  title: "Für Elise",
  composer: "Beethoven",
  difficulty: "Intermediate",
  originalFilename: "fur-elise.pdf",
};

describe("fileKind", () => {
  it.each([
    ["score.pdf", "pdf"],
    ["SCORE.PDF", "pdf"],
    ["score.musicxml", "musicxml"],
    ["score.xml", "musicxml"],
    ["score.MXL", "musicxml"],
    ["score.docx", null],
    ["pdf", null],
  ])("classifies %s as %s", (filename, kind) => {
    expect(fileKind(filename)).toBe(kind);
  });
});

describe("validateUpload", () => {
  it("trims the fields and works out the file type and extension", () => {
    expect(
      validateUpload({ ...upload, title: "  Für Elise ", composer: " Beethoven " }),
    ).toEqual({
      title: "Für Elise",
      composer: "Beethoven",
      difficulty: "Intermediate",
      originalFilename: "fur-elise.pdf",
      fileType: "pdf",
      extension: ".pdf",
    });
  });

  it("keeps only the file name of a path, without null bytes", () => {
    const parsed = validateUpload({
      ...upload,
      originalFilename: "C:\\Users\\me/../Scores/wal\0tz.MusicXML",
    });
    expect(parsed.originalFilename).toBe("waltz.MusicXML");
    expect(parsed.fileType).toBe("musicxml");
    expect(parsed.extension).toBe(".musicxml");
  });

  it("names an unknown composer", () => {
    expect(validateUpload({ ...upload, composer: "   " }).composer).toBe("Unknown");
  });

  it.each([
    [{ title: "   " }, "Add a title."],
    [{ title: "x".repeat(201) }, "Title is too long."],
    [{ composer: "x".repeat(201) }, "Composer is too long."],
    [{ difficulty: "Expert" }, "Choose a difficulty."],
    [{ originalFilename: "notes.txt" }, "Use a PDF or MusicXML file."],
    [{ originalFilename: "folder/" }, "Use a PDF or MusicXML file."],
    [{ originalFilename: `${"x".repeat(252)}.pdf` }, "Use a PDF or MusicXML file."],
  ])("rejects %o", (change, message) => {
    const run = () => validateUpload({ ...upload, ...change });
    expect(run).toThrow(SheetInputError);
    expect(run).toThrow(message);
  });
});

describe("validateSheetDetails", () => {
  const details = {
    title: "Minuet",
    composer: "",
    difficulty: "Beginner",
    status: "In progress",
  };

  it("accepts a valid edit", () => {
    expect(validateSheetDetails(details)).toEqual({
      title: "Minuet",
      composer: "Unknown",
      difficulty: "Beginner",
      status: "In progress",
    });
  });

  it("rejects an unknown practice status", () => {
    expect(() => validateSheetDetails({ ...details, status: "Done" })).toThrow(
      "Choose a practice status.",
    );
  });
});
