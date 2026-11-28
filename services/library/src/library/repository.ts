import sql from "mssql";
import {
  SheetInputError,
  validateSheetDetails,
  validateUpload,
  type Difficulty,
  type FileType,
  type PracticeStatus,
  type Sheet,
} from "./model";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export type SheetFile = { filename: string; fileType: FileType; bytes: Buffer };

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

function validId(id: number) {
  return Number.isInteger(id) && id > 0 && id <= 2147483647;
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

/**
 * The library's data access. Every query takes the pool given here, so tests
 * can point it at a throwaway database.
 */
export function createSheetRepository(pool: sql.ConnectionPool) {
  return {
    async listSheets(): Promise<Sheet[]> {
      const result = await pool
        .request()
        .query<SheetRow>(`SELECT ${sheetColumns} FROM sheets ORDER BY id DESC`);
      return result.recordset.map(toSheet);
    },

    async readSheetFile(id: number): Promise<SheetFile | null> {
      if (!validId(id)) return null;
      const result = await pool
        .request()
        .input("id", sql.Int, id)
        .query<{ original_filename: string; file_type: string; file_bytes: Buffer }>(
          `SELECT original_filename, file_type, file_bytes FROM sheets WHERE id = @id`,
        );
      const row = result.recordset[0];
      if (!row) return null;
      return {
        filename: row.original_filename,
        fileType: row.file_type === "pdf" ? "pdf" : "musicxml",
        bytes: row.file_bytes,
      };
    },

    async createSheet(input: {
      title: string;
      composer: string;
      difficulty: string;
      originalFilename: string;
      bytes: Buffer;
    }): Promise<Sheet> {
      if (input.bytes.length === 0) {
        throw new SheetInputError("This file is empty.");
      }
      if (input.bytes.length > MAX_FILE_BYTES) {
        throw new SheetInputError("This file is too large.");
      }
      const parsed = validateUpload(input);

      // One statement, so the row and its file are stored together or not at all.
      const result = await pool
        .request()
        .input("title", sql.NVarChar(200), parsed.title)
        .input("composer", sql.NVarChar(200), parsed.composer)
        .input("difficulty", sql.NVarChar(20), parsed.difficulty)
        .input("filename", sql.NVarChar(255), parsed.originalFilename)
        .input("fileType", sql.NVarChar(10), parsed.fileType)
        .input("bytes", sql.VarBinary(sql.MAX), input.bytes)
        .query<SheetRow>(
          `INSERT INTO sheets (title, composer, difficulty, original_filename, file_type, file_bytes)
           OUTPUT INSERTED.id, INSERTED.title, INSERTED.composer, INSERTED.difficulty,
                  INSERTED.practice_status AS status, INSERTED.file_type AS fileType
           VALUES (@title, @composer, @difficulty, @filename, @fileType, @bytes)`,
        );
      return toSheet(result.recordset[0]);
    },

    async updateSheet(
      id: number,
      input: { title: string; composer: string; difficulty: string; status: string },
    ): Promise<Sheet | null> {
      if (!validId(id)) return null;
      const details = validateSheetDetails(input);
      const result = await pool
        .request()
        .input("id", sql.Int, id)
        .input("title", sql.NVarChar(200), details.title)
        .input("composer", sql.NVarChar(200), details.composer)
        .input("difficulty", sql.NVarChar(20), details.difficulty)
        .input("status", sql.NVarChar(20), details.status)
        .query<SheetRow>(
          `UPDATE sheets
           SET title = @title, composer = @composer, difficulty = @difficulty,
               practice_status = @status, updated_at = SYSUTCDATETIME()
           OUTPUT INSERTED.id, INSERTED.title, INSERTED.composer, INSERTED.difficulty,
                  INSERTED.practice_status AS status, INSERTED.file_type AS fileType
           WHERE id = @id`,
        );
      const row = result.recordset[0];
      return row ? toSheet(row) : null;
    },

    /** Deletes the sheet and its file. Annotations are processing's (ADR-6). */
    async deleteSheet(id: number): Promise<boolean> {
      if (!validId(id)) return false;
      const result = await pool
        .request()
        .input("id", sql.Int, id)
        .query(`DELETE FROM sheets WHERE id = @id`);
      return result.rowsAffected[0] > 0;
    },
  };
}

export type SheetRepository = ReturnType<typeof createSheetRepository>;
