import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir, getDb } from "@/lib/db";
import {
  SheetInputError,
  validateSheetDetails,
  validateUpload,
  type Difficulty,
  type PracticeStatus,
  type Sheet,
} from "@/lib/library/model";

const maxBytes = 20 * 1024 * 1024;

type SheetRow = {
  id: number;
  title: string;
  composer: string;
  difficulty: string;
  status: string;
  fileType: string;
};

const sheetColumns = `id, title, composer, difficulty, practice_status AS status,
  file_type AS fileType`;

export function sheetPreviewPath(id: number) {
  if (!Number.isInteger(id) || id < 1) return null;
  return path.join(dataDir(), "previews", `${id}.png`);
}

function storedFilePath(filePath: string) {
  const uploadsDir = path.resolve(dataDir(), "uploads");
  const absolute = path.resolve(dataDir(), filePath);
  const relative = path.relative(uploadsDir, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return absolute;
}

function toSheet(row: SheetRow): Sheet {
  return {
    id: row.id,
    title: row.title,
    composer: row.composer,
    difficulty: row.difficulty as Difficulty,
    status: row.status as PracticeStatus,
    fileType: row.fileType === "pdf" ? "pdf" : "musicxml",
  };
}

export function readSheetFile(id: number) {
  if (!Number.isInteger(id) || id < 1) return null;

  const row = getDb()
    .prepare(
      `SELECT original_filename, file_path, file_type
       FROM sheets
       WHERE id = ?`,
    )
    .get(id) as
    | { original_filename: string; file_path: string; file_type: string }
    | undefined;
  if (!row || (row.file_type !== "pdf" && row.file_type !== "musicxml")) {
    return null;
  }

  const absolute = storedFilePath(row.file_path);
  if (!absolute || !fs.existsSync(absolute)) return null;

  return {
    filename: row.original_filename,
    fileType: row.file_type as Sheet["fileType"],
    bytes: fs.readFileSync(absolute),
  };
}

function getSheet(id: number) {
  const row = getDb()
    .prepare(`SELECT ${sheetColumns} FROM sheets WHERE id = ?`)
    .get(id) as SheetRow | undefined;
  return row ? toSheet(row) : null;
}

export function listSheets(): Sheet[] {
  const rows = getDb()
    .prepare(
      `SELECT ${sheetColumns}
       FROM sheets
       ORDER BY id DESC`,
    )
    .all() as SheetRow[];

  return rows.map(toSheet);
}

export function updateSheet(
  id: number,
  input: {
    title: string;
    composer: string;
    difficulty: string;
    status: string;
  },
) {
  if (!Number.isInteger(id) || id < 1) return null;
  const details = validateSheetDetails(input);
  const result = getDb()
    .prepare(
      `UPDATE sheets
       SET title = ?, composer = ?, difficulty = ?, practice_status = ?
       WHERE id = ?`,
    )
    .run(details.title, details.composer, details.difficulty, details.status, id);
  if (result.changes === 0) return null;
  return getSheet(id);
}

export function deleteSheet(id: number) {
  if (!Number.isInteger(id) || id < 1) return false;
  const row = getDb()
    .prepare(`SELECT file_path FROM sheets WHERE id = ?`)
    .get(id) as { file_path: string } | undefined;
  if (!row) return false;

  const absolute = storedFilePath(row.file_path);
  const preview = sheetPreviewPath(id);
  const result = getDb().prepare(`DELETE FROM sheets WHERE id = ?`).run(id);
  if (absolute) fs.rmSync(absolute, { force: true });
  if (preview) fs.rmSync(preview, { force: true });
  return result.changes > 0;
}

export function createSheet(input: {
  title: string;
  composer: string;
  difficulty: string;
  originalFilename: string;
  bytes: Buffer;
}): Sheet {
  if (input.bytes.length === 0) {
    throw new SheetInputError("This file is empty.");
  }
  if (input.bytes.length > maxBytes) {
    throw new SheetInputError("This file is too large.");
  }

  const parsed = validateUpload(input);
  const storedName = `${randomBytes(16).toString("hex")}${parsed.extension}`;
  const absolutePath = path.join(dataDir(), "uploads", storedName);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, input.bytes);

  try {
    const result = getDb()
      .prepare(
        `INSERT INTO sheets (
          title, composer, difficulty, original_filename, file_path, file_type, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        parsed.title,
        parsed.composer,
        parsed.difficulty,
        parsed.originalFilename,
        path.posix.join("uploads", storedName),
        parsed.fileType,
        new Date().toISOString(),
      );

    return {
      id: Number(result.lastInsertRowid),
      title: parsed.title,
      composer: parsed.composer,
      difficulty: parsed.difficulty,
      status: "Not started",
      fileType: parsed.fileType,
    };
  } catch (error) {
    fs.rmSync(absolutePath, { force: true });
    throw error;
  }
}
