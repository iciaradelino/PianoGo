import {
  readPage,
  type OperatorList,
  type PdfFont,
  type PdfGlyph,
} from "@/lib/processing/pdf/read-page";

// pdf.js numbers its operators; any distinct numbers do for the reader.
const OPS = Object.fromEntries(
  [
    "save",
    "restore",
    "transform",
    "paintFormXObjectBegin",
    "paintFormXObjectEnd",
    "setLineWidth",
    "constructPath",
    "stroke",
    "closeStroke",
    "fill",
    "eoFill",
    "fillStroke",
    "eoFillStroke",
    "closeFillStroke",
    "closeEOFillStroke",
    "endPath",
    "beginText",
    "setFont",
    "setTextMatrix",
    "moveText",
    "setLeadingMoveText",
    "setLeading",
    "nextLine",
    "setCharSpacing",
    "setWordSpacing",
    "setHScale",
    "setTextRise",
    "showText",
    "moveTo",
    "lineTo",
    "curveTo",
    "curveTo2",
    "curveTo3",
    "rectangle",
    "closePath",
  ].map((name, index) => [name, index + 1]),
);

// An 800 point tall page: PDF y grows upwards, page y downwards.
const viewport = { width: 600, height: 800, transform: [1, 0, 0, -1, 0, 800] };

type Op = [keyof typeof OPS, unknown[]?];

function list(...ops: Op[]): OperatorList {
  return {
    fnArray: ops.map(([name]) => OPS[name]),
    argsArray: ops.map(([, args]) => args ?? []),
  };
}

function path(...steps: [keyof typeof OPS, ...number[]][]): Op {
  return [
    "constructPath",
    [steps.map(([op]) => OPS[op]), steps.flatMap(([, ...args]) => args)],
  ];
}

const fonts: Record<string, { name: string; font: PdfFont }> = {
  music: { name: "ABCDEF+Leland", font: { fontMatrix: [0.001] } },
  lily: { name: "Emmentaler", font: { differences: Object.assign([], { 65: "noteheads.s2" }) } },
  vertical: { name: "Vertical", font: { vertical: true } },
};
const getFont = (id: string) => fonts[id] ?? null;

function read(...ops: Op[]) {
  return readPage(list(...ops), OPS, viewport, getFont);
}

const head: PdfGlyph = { originalCharCode: 65, unicode: "", width: 300 };

describe("readPage lines", () => {
  it("reads stroked horizontal and vertical lines in page coordinates", () => {
    const content = read(
      ["setLineWidth", [0.5]],
      path(["moveTo", 10, 700], ["lineTo", 500, 700], ["moveTo", 200, 700], ["lineTo", 200, 676]),
      ["stroke"],
    );
    expect(content.width).toBe(600);
    expect(content.horizontal).toEqual([{ start: 10, end: 500, at: 100, thickness: 0.5 }]);
    expect(content.vertical).toEqual([{ start: 100, end: 124, at: 200, thickness: 0.5 }]);
  });

  it("skips thick, diagonal and curved strokes", () => {
    const content = read(
      ["setLineWidth", [5]],
      path(["moveTo", 0, 0], ["lineTo", 100, 0]),
      ["stroke"],
      ["setLineWidth", [1]],
      path(["moveTo", 0, 0], ["lineTo", 100, 100]),
      ["closeStroke"],
      path(["moveTo", 0, 0], ["curveTo", 10, 10, 20, 10, 30, 0], ["curveTo2", 40, 10, 50, 50]),
      ["stroke"],
    );
    expect(content.horizontal).toEqual([]);
    expect(content.vertical).toEqual([]);
  });

  it("reads thin filled rectangles as lines", () => {
    const content = read(
      path(["rectangle", 10, 600, 490, 1], ["rectangle", 200, 500, 1, 24]),
      ["fill"],
    );
    expect(content.horizontal).toEqual([{ start: 10, end: 500, at: 199.5, thickness: 1 }]);
    expect(content.vertical).toEqual([{ start: 276, end: 300, at: 200.5, thickness: 1 }]);
  });

  it("applies transforms, and restores state afterwards", () => {
    const content = read(
      ["save"],
      ["transform", [2, 0, 0, 2, 0, 0]],
      path(["moveTo", 0, 100], ["lineTo", 10, 100]),
      ["stroke"],
      ["restore"],
      ["paintFormXObjectBegin", [[1, 0, 0, 1, 50, 0]]],
      path(["moveTo", 0, 100], ["lineTo", 10, 100]),
      ["eoFillStroke"],
      ["paintFormXObjectEnd"],
      path(["moveTo", 0, 100], ["lineTo", 10, 100]),
      ["stroke"],
    );
    expect(content.horizontal).toEqual([
      { start: 0, end: 20, at: 600, thickness: 2 },
      { start: 50, end: 60, at: 700, thickness: 1 },
      { start: 0, end: 10, at: 700, thickness: 1 },
    ]);
  });

  it("closes paths and drops ones that are never painted", () => {
    const content = read(
      path(["moveTo", 0, 0], ["lineTo", 0, 20], ["closePath"]),
      ["closeStroke"],
      path(["lineTo", 0, 0], ["lineTo", 30, 0]),
      ["endPath"],
      ["stroke"],
    );
    expect(content.vertical).toEqual([
      { start: 780, end: 800, at: 0, thickness: 1 },
      { start: 780, end: 800, at: 0, thickness: 1 },
    ]);
    expect(content.horizontal).toEqual([]);
  });
});

describe("readPage text", () => {
  const begin: Op[] = [
    ["beginText"],
    ["setFont", ["music", 20]],
    ["setTextMatrix", [[1, 0, 0, 1, 100, 700]]],
  ];

  it("places each glyph and advances by its width and kerning", () => {
    const content = read(...begin, [
      "showText",
      [[head, -500, null, { unicode: "", width: 200 }]],
    ]);
    expect(content.glyphs).toEqual([
      { font: "Leland", glyphName: null, codepoint: 0xe0a4, x: 100, y: 100, width: 6, size: 20 },
      { font: "Leland", glyphName: null, codepoint: 0xe050, x: 116, y: 100, width: 4, size: 20 },
    ]);
  });

  it("follows text moves, new lines, rise and spacing", () => {
    const content = read(
      ...begin,
      ["setLeading", [30]],
      ["moveText", [10, 0]],
      ["setTextRise", [5]],
      ["showText", [[head]]],
      ["nextLine"],
      ["setTextRise", [0]],
      ["setCharSpacing", [2]],
      ["setWordSpacing", [10]],
      ["showText", [[{ ...head, isSpace: true }, head]]],
      ["setLeadingMoveText", [0, -10]],
      ["setHScale", [50]],
      ["showText", [[head]]],
    );
    expect(content.glyphs.map((glyph) => [glyph.x, glyph.y, glyph.width])).toEqual([
      [110, 95, 6],
      [110, 130, 6],
      [128, 130, 6],
      [110, 140, 3],
    ]);
  });

  it("reads glyph names from the font encoding", () => {
    const content = read(
      ["beginText"],
      ["setFont", ["lily", -20]],
      ["setTextMatrix", [1, 0, 0, 1, 100, 700]],
      ["showText", [[{ originalCharCode: 65, unicode: "AB", width: 300 }]]],
    );
    expect(content.glyphs).toEqual([
      expect.objectContaining({ font: "Emmentaler", glyphName: "noteheads.s2", codepoint: null }),
    ]);
  });

  it("ignores text without a usable font", () => {
    const content = read(
      ["beginText"],
      ["showText", [[head]]],
      ["setFont", ["missing", 20]],
      ["showText", [[head]]],
      ["setFont", ["vertical", 20]],
      ["showText", [[head]]],
      ["setFont", ["music", 0]],
      ["showText", [[head]]],
    );
    expect(content.glyphs).toEqual([]);
  });
});
