import type { SheetFile } from "./repository";

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

type PdfJs = {
  getDocument: (src: {
    data: Uint8Array;
    disableWorker: boolean;
    isEvalSupported: boolean;
    useSystemFonts: boolean;
  }) => { promise: Promise<PdfDocument> };
};

/** Draws the first page of a PDF as a PNG 480 pixels wide. */
export async function renderFirstPage(bytes: Buffer): Promise<Buffer | null> {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJs;
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

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
    return canvas.toBuffer("image/png");
  } finally {
    await pdf.destroy();
  }
}

/**
 * Serves PDF previews from memory. The container's disk and memory are both
 * lost when it scales to zero, so this is only a cache: a preview is drawn
 * again from the file in the database the first time it is asked for.
 */
export function createPreviewCache(
  readSheetFile: (id: number) => Promise<SheetFile | null>,
  render: (bytes: Buffer) => Promise<Buffer | null> = renderFirstPage,
) {
  const cache = new Map<number, Buffer>();
  const pending = new Map<number, Promise<Buffer | null>>();

  async function draw(id: number) {
    const file = await readSheetFile(id);
    if (!file || file.fileType !== "pdf") return null;
    const png = await render(file.bytes);
    if (png) cache.set(id, png);
    return png;
  }

  return {
    preview(id: number): Promise<Buffer | null> {
      if (!Number.isInteger(id) || id < 1) return Promise.resolve(null);
      const cached = cache.get(id);
      if (cached) return Promise.resolve(cached);

      // Two requests for the same preview share one render.
      const running = pending.get(id);
      if (running) return running;
      const job = draw(id).finally(() => pending.delete(id));
      pending.set(id, job);
      return job;
    },

    forget(id: number) {
      cache.delete(id);
    },
  };
}

export type PreviewCache = ReturnType<typeof createPreviewCache>;
