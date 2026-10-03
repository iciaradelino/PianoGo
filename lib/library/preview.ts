import fs from "node:fs";
import path from "node:path";
import { readSheetFile, sheetPreviewPath } from "@/lib/library/repository";

const previewWidth = 480;

type PdfPage = {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void> };
};

type PdfCanvas = {
  width: number;
  height: number;
  toBuffer: (mimeType: "image/png") => Buffer;
};

type PdfDocument = {
  getPage: (pageNumber: number) => Promise<PdfPage>;
  // pdf.js draws images on canvases from its own copy of @napi-rs/canvas.
  // Mixing in canvases or Path2D from another copy crashes Node on pages
  // with images, such as scans, so every canvas comes from here.
  canvasFactory: {
    create: (
      width: number,
      height: number,
    ) => { canvas: PdfCanvas; context: CanvasRenderingContext2D | null };
  };
  destroy: () => Promise<void>;
};

const pending = new Map<number, Promise<Buffer | null>>();

function readCachedPreview(id: number) {
  const filePath = sheetPreviewPath(id);
  if (!filePath || !fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
}

async function renderPreview(id: number) {
  const file = readSheetFile(id);
  const target = sheetPreviewPath(id);
  if (!file || file.fileType !== "pdf" || !target) return null;

  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as {
    getDocument: (src: {
      data: Uint8Array;
      disableWorker: boolean;
      isEvalSupported: boolean;
      useSystemFonts: boolean;
    }) => { promise: Promise<PdfDocument> };
  };
  const pdf = await pdfjs
    .getDocument({
      data: new Uint8Array(file.bytes),
      disableWorker: true,
      isEvalSupported: false,
      useSystemFonts: true,
    })
    .promise;

  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: previewWidth / base.width });
    const { canvas, context } = pdf.canvasFactory.create(
      Math.floor(viewport.width),
      Math.floor(viewport.height),
    );
    if (!context) return null;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;

    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp`;
    fs.writeFileSync(temporary, canvas.toBuffer("image/png"));
    fs.renameSync(temporary, target);
    return fs.readFileSync(target);
  } finally {
    await pdf.destroy();
  }
}

export function sheetPreview(id: number) {
  if (!Number.isInteger(id) || id < 1) return Promise.resolve(null);

  const cached = readCachedPreview(id);
  if (cached) return Promise.resolve(cached);

  const running = pending.get(id);
  if (running) return running;

  const job = renderPreview(id).finally(() => pending.delete(id));
  pending.set(id, job);
  return job;
}
