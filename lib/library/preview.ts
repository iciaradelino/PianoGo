import "server-only";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import mupdf from "mupdf";
import { getDataDirectory } from "@/lib/db";

const previewWidth = 900;

export function readSheetPreview(id: number) {
  const filePath = sheetPreviewPath(id);
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath);
}

export function savePdfPreview(id: number, pdfBytes: Buffer) {
  const existing = readSheetPreview(id);
  if (existing) return existing;

  const png = renderPdfFirstPage(pdfBytes);
  const filePath = sheetPreviewPath(id);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, png);
  return png;
}

function sheetPreviewPath(id: number) {
  return path.join(getDataDirectory(), "previews", `${id}.png`);
}

function renderPdfFirstPage(pdfBytes: Buffer) {
  const doc = mupdf.Document.openDocument(pdfBytes, "application/pdf");

  try {
    const page = doc.loadPage(0);
    const bounds = page.getBounds();
    const pageWidth = bounds[2] - bounds[0];
    const scale = pageWidth > 0 ? previewWidth / pageWidth : 1;
    const pixmap = page.toPixmap(
      mupdf.Matrix.scale(scale, scale),
      mupdf.ColorSpace.DeviceRGB,
      false,
    );

    try {
      return Buffer.from(pixmap.asPNG());
    } finally {
      pixmap.destroy();
      page.destroy();
    }
  } finally {
    doc.destroy();
  }
}
