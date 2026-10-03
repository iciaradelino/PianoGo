import { emptyContext, findNotes, type PdfNote } from "./find-notes";
import {
  readPage,
  type OperatorList,
  type PdfFont,
  type PdfOps,
} from "./read-page";

export type PdfPageNote = PdfNote & { page: number };

export type PdfExtraction = {
  pages: { width: number; height: number }[];
  notes: PdfPageNote[];
  /** Pages where staves were found; zero means the PDF is likely a scan. */
  pagesWithStaves: number;
};

type PdfPage = {
  getViewport: (options: { scale: number }) => {
    width: number;
    height: number;
    transform: number[];
  };
  getOperatorList: () => Promise<OperatorList>;
  commonObjs: { get: (id: string) => unknown };
  cleanup: () => void;
};

type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
};

type PdfJs = {
  OPS: PdfOps;
  getDocument: (src: {
    data: Uint8Array;
    disableFontFace: boolean;
    fontExtraProperties: boolean;
    isEvalSupported: boolean;
    useSystemFonts: boolean;
    verbosity: number;
  }) => { promise: Promise<PdfDocument> };
};

function fontLookup(page: PdfPage) {
  return (id: string) => {
    try {
      const font = page.commonObjs.get(id) as (PdfFont & { name?: string }) | null;
      return font ? { name: font.name ?? id, font } : null;
    } catch {
      return null;
    }
  };
}

/** Finds and names every notehead in a PDF exported from notation software. */
export async function extractPdfNotes(bytes: Uint8Array): Promise<PdfExtraction> {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJs;
  const pdf = await pdfjs.getDocument({
    data: bytes,
    disableFontFace: true,
    // Keeps each font's glyph names, which LilyPond scores are read by.
    fontExtraProperties: true,
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;

  try {
    const pages: PdfExtraction["pages"] = [];
    const notes: PdfPageNote[] = [];
    let pagesWithStaves = 0;
    let context = emptyContext();

    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const operators = await page.getOperatorList();
      const content = readPage(operators, pdfjs.OPS, viewport, fontLookup(page));
      const result = findNotes(content, context);

      context = result.context;
      if (result.staves.length > 0) pagesWithStaves += 1;
      pages.push({ width: viewport.width, height: viewport.height });
      notes.push(...result.notes.map((note) => ({ ...note, page: number })));
      page.cleanup();
    }
    return { pages, notes, pagesWithStaves };
  } finally {
    await pdf.destroy();
  }
}
