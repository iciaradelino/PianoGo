export const difficulties = ["Beginner", "Intermediate", "Advanced"] as const;
export type Difficulty = (typeof difficulties)[number];

export const practiceStatuses = [
  "Not started",
  "In progress",
  "Completed",
] as const;
export type PracticeStatus = (typeof practiceStatuses)[number];

export const acceptedExtensions = [".pdf", ".musicxml", ".xml", ".mxl"];

export type FileType = "pdf" | "musicxml";

export type Sheet = {
  id: number;
  title: string;
  composer: string;
  difficulty: Difficulty;
  status: PracticeStatus;
  fileType: FileType;
};

const titleMax = 200;
const composerMax = 200;
const filenameMax = 255;

export class SheetInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SheetInputError";
  }
}

export function fileKind(filename: string): FileType | null {
  const lower = filename.toLocaleLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (
    lower.endsWith(".musicxml") ||
    lower.endsWith(".xml") ||
    lower.endsWith(".mxl")
  ) {
    return "musicxml";
  }
  return null;
}

function cleanTitle(value: string) {
  const title = value.trim();
  if (!title) throw new SheetInputError("Add a title.");
  if (title.length > titleMax) throw new SheetInputError("Title is too long.");
  return title;
}

function cleanComposer(value: string) {
  const composer = value.trim() || "Unknown";
  if (composer.length > composerMax) {
    throw new SheetInputError("Composer is too long.");
  }
  return composer;
}

function cleanDifficulty(value: string): Difficulty {
  if (!difficulties.includes(value as Difficulty)) {
    throw new SheetInputError("Choose a difficulty.");
  }
  return value as Difficulty;
}

function cleanStatus(value: string): PracticeStatus {
  if (!practiceStatuses.includes(value as PracticeStatus)) {
    throw new SheetInputError("Choose a practice status.");
  }
  return value as PracticeStatus;
}

export function validateSheetDetails(input: {
  title: string;
  composer: string;
  difficulty: string;
  status: string;
}) {
  return {
    title: cleanTitle(input.title),
    composer: cleanComposer(input.composer),
    difficulty: cleanDifficulty(input.difficulty),
    status: cleanStatus(input.status),
  };
}

export function validateUpload(input: {
  title: string;
  composer: string;
  difficulty: string;
  originalFilename: string;
}) {
  const title = cleanTitle(input.title);
  const composer = cleanComposer(input.composer);
  const difficulty = cleanDifficulty(input.difficulty);

  const originalFilename =
    input.originalFilename.split(/[/\\]/).pop()?.replaceAll("\0", "") ?? "";
  if (!originalFilename || originalFilename.length > filenameMax) {
    throw new SheetInputError("Use a PDF or MusicXML file.");
  }

  const fileType = fileKind(originalFilename);
  if (!fileType) throw new SheetInputError("Use a PDF or MusicXML file.");

  const extension = originalFilename
    .slice(originalFilename.lastIndexOf("."))
    .toLocaleLowerCase();

  return {
    title,
    composer,
    difficulty,
    originalFilename,
    fileType,
    extension,
  };
}
