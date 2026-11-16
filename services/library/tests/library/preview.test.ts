import { createPreviewCache, renderFirstPage } from "../../src/library/preview";
import type { SheetFile } from "../../src/library/repository";

// The smallest PDF pdf.js accepts: one blank 200 x 100 page.
const blankPdf = Buffer.from(
  `%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 200 100]>> endobj
trailer <</Root 1 0 R>>
%%EOF`,
);

function pdf(bytes = Buffer.from("pdf")): SheetFile {
  return { filename: "score.pdf", fileType: "pdf", bytes };
}

describe("renderFirstPage", () => {
  it("draws the first page as a PNG 480 pixels wide", async () => {
    const png = await renderFirstPage(blankPdf);
    expect(png?.subarray(1, 4).toString()).toBe("PNG");
    // Width and height are the first two numbers in the PNG header.
    expect(png?.readUInt32BE(16)).toBe(480);
    expect(png?.readUInt32BE(20)).toBe(240);
  });
});

describe("createPreviewCache", () => {
  it("returns null for invalid ids without reading anything", async () => {
    const read = jest.fn();
    const previews = createPreviewCache(read);
    await expect(previews.preview(0)).resolves.toBeNull();
    await expect(previews.preview(2.5)).resolves.toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it("does not render MusicXML or missing sheets", async () => {
    const render = jest.fn();
    const previews = createPreviewCache(async (id) =>
      id === 1 ? { filename: "a.musicxml", fileType: "musicxml", bytes: Buffer.from("") } : null,
      render,
    );
    await expect(previews.preview(1)).resolves.toBeNull();
    await expect(previews.preview(2)).resolves.toBeNull();
    expect(render).not.toHaveBeenCalled();
  });

  it("renders once and then serves from memory", async () => {
    const render = jest.fn(async () => Buffer.from("png"));
    const previews = createPreviewCache(async () => pdf(), render);
    expect((await previews.preview(1))?.toString()).toBe("png");
    expect((await previews.preview(1))?.toString()).toBe("png");
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("shares one render between callers asking at the same time", async () => {
    const render = jest.fn(async () => Buffer.from("png"));
    const previews = createPreviewCache(async () => pdf(), render);
    const first = previews.preview(1);
    expect(previews.preview(1)).toBe(first);
    await first;
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("draws again after a sheet is forgotten", async () => {
    const render = jest.fn(async () => Buffer.from("png"));
    const previews = createPreviewCache(async () => pdf(), render);
    await previews.preview(1);
    previews.forget(1);
    await previews.preview(1);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("does not cache a page that could not be drawn", async () => {
    const render = jest.fn(async () => null);
    const previews = createPreviewCache(async () => pdf(), render);
    await previews.preview(1);
    await previews.preview(1);
    expect(render).toHaveBeenCalledTimes(2);
  });
});
