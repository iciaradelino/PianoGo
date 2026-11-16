import express, { type ErrorRequestHandler } from "express";
import multer from "multer";
import { SheetInputError } from "./model";
import type { PreviewCache } from "./preview";
import { MAX_FILE_BYTES, type SheetRepository } from "./repository";

// The upload stays in memory until it is written to the database.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 10 },
});

function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "");
  return `inline; filename="${ascii || "sheet"}"`;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

/** The library's HTTP API: sheets, their files and previews. */
export function sheetRoutes(sheets: SheetRepository, previews: PreviewCache) {
  const router = express.Router();

  router.get("/sheets", async (_req, res) => {
    res.json(await sheets.listSheets());
  });

  router.post("/sheets", upload.single("file"), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "Choose a PDF or MusicXML file." });
      return;
    }
    const sheet = await sheets.createSheet({
      title: text(req.body?.title),
      composer: text(req.body?.composer),
      difficulty: text(req.body?.difficulty),
      // Multer reads the file name as Latin-1; browsers send UTF-8.
      originalFilename: Buffer.from(req.file.originalname, "latin1").toString("utf8"),
      bytes: req.file.buffer,
    });
    res.status(201).json(sheet);
  });

  router.patch("/sheets/:id", express.json(), async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const sheet = await sheets.updateSheet(Number(req.params.id), {
      title: text(body.title),
      composer: text(body.composer),
      difficulty: text(body.difficulty),
      status: text(body.status),
    });
    if (!sheet) {
      res.status(404).json({ error: "Sheet not found." });
      return;
    }
    res.json(sheet);
  });

  router.delete("/sheets/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!(await sheets.deleteSheet(id))) {
      res.status(404).json({ error: "Sheet not found." });
      return;
    }
    previews.forget(id);
    res.status(204).end();
  });

  // Called by the UI to show the score, and by processing to read its notes.
  router.get("/sheets/:id/file", async (req, res) => {
    const file = await sheets.readSheetFile(Number(req.params.id));
    if (!file) {
      res.status(404).json({ error: "Sheet not found." });
      return;
    }
    res
      .type(file.fileType === "pdf" ? "application/pdf" : "application/xml")
      .set("Content-Disposition", contentDisposition(file.filename))
      .send(file.bytes);
  });

  router.get("/sheets/:id/preview", async (req, res) => {
    const png = await previews.preview(Number(req.params.id));
    if (!png) {
      res.status(404).json({ error: "Preview not available." });
      return;
    }
    res.type("image/png").set("Cache-Control", "private, max-age=86400").send(png);
  });

  // Turns input mistakes into 400s; anything else goes on to the 500 handler.
  const inputErrors: ErrorRequestHandler = (error, _req, res, next) => {
    if (error instanceof SheetInputError) {
      res.status(400).json({ error: error.message });
    } else if (error instanceof multer.MulterError) {
      res.status(400).json({
        error:
          error.code === "LIMIT_FILE_SIZE"
            ? "This file is too large."
            : "Choose a PDF or MusicXML file.",
      });
    } else {
      next(error);
    }
  };
  router.use(inputErrors);

  return router;
}
