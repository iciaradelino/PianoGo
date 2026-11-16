import express from "express";
import type { AnnotationRepository } from "./repository";

function sheetIdFromQuery(req: express.Request) {
  return Number(req.query.sheetId);
}

function body(req: express.Request) {
  return req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
}

/** Processing's HTTP API: annotations, their notes and their style. */
export function annotationRoutes(annotations: AnnotationRepository) {
  const router = express.Router();
  router.use(express.json());

  router.get("/annotations", async (req, res) => {
    const annotation = await annotations.getAnnotation(sheetIdFromQuery(req));
    if (!annotation) {
      res.status(404).json({ error: "Sheet not found." });
      return;
    }
    res.json(annotation);
  });

  // The cross-seam flow: this fetches the sheet's file from the library.
  router.post("/annotations", async (req, res) => {
    const result = await annotations.generateAnnotations(Number(body(req).sheetId));
    if (result.ok) {
      const processing = result.annotation.status === "processing";
      res.status(processing ? 202 : 201).json(result.annotation);
    } else if (result.reason === "library-unavailable") {
      res.status(503).json({
        error:
          "The library is not responding, so this sheet can't be annotated right now. Try again in a minute.",
      });
    } else if (result.reason === "no-reader") {
      res.status(503).json({
        error:
          "This looks like a scanned sheet. Reading scans needs Audiveris, which is not installed on this server.",
      });
    } else {
      res.status(404).json({ error: "Sheet not found." });
    }
  });

  router.patch("/annotations", async (req, res) => {
    const { sheetId, style } = body(req);
    const annotation = await annotations.updateAnnotationStyle(Number(sheetId), style);
    if (!annotation) {
      res.status(404).json({ error: "Generate annotations for this sheet first." });
      return;
    }
    res.json(annotation);
  });

  router.get("/annotations/notes", async (req, res) => {
    res.json({ notes: await annotations.getPdfNotes(sheetIdFromQuery(req)) });
  });

  router.delete("/annotations", async (req, res) => {
    await annotations.deleteAnnotations(sheetIdFromQuery(req));
    res.status(204).end();
  });

  return router;
}
