import "server-only";

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDataDirectory, getDatabase } from "@/lib/db";
import type { Difficulty, FileType, PracticeStatus, Sheet } from "./model";

const difficulties = new Set<Difficulty>([
  "Beginner",
  "Intermediate",
  "Advanced",
]);

type SheetRow = {
  id: number;
  title: string;
  composer: string;
  difficulty: Difficulty;
  original_filename: string;
  file_path: string;
  file_type: FileType;
  practice_status: PracticeStatus;
  is_favorite: number;
  created_at: string;
};

export type SheetFile = {
  filename: string;
  fileType: FileType;
  bytes: Buffer;
};

type NewSheet = {
  title: string;
  composer: string;
  difficulty: string;
  fileName: string;
  bytes: Buffer;
};

export function listSheets(): Sheet[] {
  const rows = getDatabase()
    .prepare(
      `SELECT id, title, composer, difficulty, original_filename, file_path,
              file_type, practice_status, is_favorite, created_at
       FROM sheets
       ORDER BY created_at DESC, id DESC`,
    )
    .all() as SheetRow[];

  return rows.map(toSheet);
}

export function createSheet(input: NewSheet): Sheet {
  const title = input.title.trim();
  const composer = input.composer.trim() || "Unknown";
  const difficulty = input.difficulty.trim();
  const fileType = fileTypeFromName(input.fileName);

  if (!title) throw new Error("Add a title.");
  if (!difficulties.has(difficulty as Difficulty)) {
    throw new Error("Choose a difficulty.");
  }
  if (!fileType) throw new Error("Use a PDF or MusicXML file.");
  if (input.bytes.length === 0) throw new Error("The file is empty.");

  const extension = path.extname(input.fileName).toLowerCase();
  const storedName = `${randomBytes(16).toString("hex")}${extension}`;
  const uploadsDirectory = path.join(getDataDirectory(), "uploads");
  mkdirSync(uploadsDirectory, { recursive: true });
  writeFileSync(path.join(uploadsDirectory, storedName), input.bytes);

  const createdAt = new Date().toISOString();
  const result = getDatabase()
    .prepare(
      `INSERT INTO sheets (
         title, composer, difficulty, original_filename, file_path, file_type,
         practice_status, is_favorite, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'Not started', 0, ?)`,
    )
    .run(
      title,
      composer,
      difficulty,
      path.basename(input.fileName),
      `uploads/${storedName}`,
      fileType,
      createdAt,
    );

  return toSheet({
    id: Number(result.lastInsertRowid),
    title,
    composer,
    difficulty: difficulty as Difficulty,
    original_filename: path.basename(input.fileName),
    file_path: `uploads/${storedName}`,
    file_type: fileType,
    practice_status: "Not started",
    is_favorite: 0,
    created_at: createdAt,
  });
}

export function openSheetFile(id: number): SheetFile | null {
  const row = getDatabase()
    .prepare(
      `SELECT id, title, composer, difficulty, original_filename, file_path,
              file_type, practice_status, is_favorite, created_at
       FROM sheets
       WHERE id = ?`,
    )
    .get(id) as SheetRow | undefined;

  if (!row) return null;

  const absolutePath = resolveUploadPath(row.file_path);
  if (!absolutePath || !existsSync(absolutePath)) return null;

  return {
    filename: row.original_filename,
    fileType: row.file_type,
    bytes: readFileSync(absolutePath),
  };
}

function toSheet(row: SheetRow): Sheet {
  return {
    id: row.id,
    title: row.title,
    composer: row.composer,
    difficulty: row.difficulty,
    status: row.practice_status,
    originalFilename: row.original_filename,
    fileType: row.file_type,
    isFavorite: row.is_favorite === 1,
    createdAt: row.created_at,
  };
}

function fileTypeFromName(name: string): FileType | null {
  const lower = name.toLowerCase();
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

function resolveUploadPath(relativePath: string) {
  const uploadsRoot = path.resolve(getDataDirectory(), "uploads");
  const absolutePath = path.resolve(getDataDirectory(), relativePath);
  const relative = path.relative(uploadsRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return absolutePath;
}
