import { extractPdfNotes } from "@/lib/processing/pdf/extract";

// A fake pdf.js: every page draws one treble staff (lines at y = 100-124 on
// an 800 point page) and, unless it is blank, one notehead on its top line.
const OPS = { constructPath: 1, stroke: 2, moveTo: 3, lineTo: 4, beginText: 5, setFont: 6, setTextMatrix: 7, showText: 8 };

function staffPage(withNote: boolean) {
  const fnArray: number[] = [];
  const argsArray: unknown[][] = [];
  for (const y of [700, 694, 688, 682, 676]) {
    fnArray.push(OPS.constructPath, OPS.stroke);
    argsArray.push([[OPS.moveTo, OPS.lineTo], [10, y, 500, y]], []);
  }
  if (withNote) {
    fnArray.push(OPS.beginText, OPS.setFont, OPS.setTextMatrix, OPS.showText);
    argsArray.push(
      [],
      ["font", 24],
      [[1, 0, 0, 1, 60, 700]],
      [[{ unicode: "", width: 300 }]],
    );
  }
  return { fnArray, argsArray };
}

const pages = [staffPage(true), { fnArray: [], argsArray: [] }, staffPage(true)];
const destroy = jest.fn();
const cleanup = jest.fn();

jest.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  OPS,
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: pages.length,
      getPage: async (number: number) => ({
        getViewport: () => ({ width: 600, height: 800, transform: [1, 0, 0, -1, 0, 800] }),
        getOperatorList: async () => pages[number - 1],
        commonObjs: {
          get: (id: string) => {
            if (id !== "font") throw new Error("Font not loaded.");
            return { fontMatrix: [0.001] };
          },
        },
        cleanup,
      }),
      destroy,
    }),
  }),
}), { virtual: true });

describe("extractPdfNotes", () => {
  it("reads every page, numbering notes by page", async () => {
    const result = await extractPdfNotes(new Uint8Array([1]));

    expect(result.pages).toEqual([
      { width: 600, height: 800 },
      { width: 600, height: 800 },
      { width: 600, height: 800 },
    ]);
    expect(result.pagesWithStaves).toBe(2);
    // PDF y = 700 is page y = 100, the top line of a treble staff: F5.
    expect(result.notes.map((note) => [note.page, note.step, note.octave])).toEqual([
      [1, "F", 5],
      [3, "F", 5],
    ]);
    expect(cleanup).toHaveBeenCalledTimes(3);
    expect(destroy).toHaveBeenCalled();
  });
});
