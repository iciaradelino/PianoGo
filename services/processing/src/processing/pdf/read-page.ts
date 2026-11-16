import type { FontGlyph } from "./music-glyphs";

/**
 * Walks a pdf.js operator list and collects what a score is drawn with: the
 * glyphs of every font and the straight lines (staff lines, barlines, stems).
 * Everything is returned in page points with the origin at the top left,
 * which is how the page is shown on screen.
 */

type Matrix = [number, number, number, number, number, number];

export type PlacedGlyph = FontGlyph & {
  /** The glyph origin: left edge, on the baseline. */
  x: number;
  y: number;
  /** Advance width of the glyph. */
  width: number;
  /** Size of one em of the font on the page. */
  size: number;
};

export type Segment = {
  /** Horizontal: x0..x1 at y. Vertical: y0..y1 at x. */
  start: number;
  end: number;
  at: number;
  thickness: number;
};

export type PageContent = {
  width: number;
  height: number;
  glyphs: PlacedGlyph[];
  horizontal: Segment[];
  vertical: Segment[];
};

export type PdfOps = Record<string, number>;

export type PdfFont = {
  fontMatrix?: number[];
  differences?: string[];
  defaultEncoding?: string[];
  vertical?: boolean;
};

export type PdfGlyph = {
  originalCharCode?: number;
  unicode?: string;
  width?: number;
  isSpace?: boolean;
};

export type OperatorList = { fnArray: number[]; argsArray: unknown[][] };

// Thicker than this, a "line" is a beam, slur or filled shape.
const MAX_LINE_THICKNESS = 3;
const STRAIGHT_TOLERANCE = 0.25;
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function scaleOf(m: Matrix) {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

function stripSubsetPrefix(name: string) {
  return name.replace(/^[A-Z]{6}\+/, "");
}

type State = {
  ctm: Matrix;
  lineWidth: number;
  font: PdfFont | null;
  fontName: string;
  fontSize: number;
  fontDirection: number;
  charSpacing: number;
  wordSpacing: number;
  hScale: number;
  rise: number;
  leading: number;
  textMatrix: Matrix;
  x: number;
  y: number;
  lineX: number;
  lineY: number;
};

function initialState(): State {
  return {
    ctm: IDENTITY,
    lineWidth: 1,
    font: null,
    fontName: "",
    fontSize: 0,
    fontDirection: 1,
    charSpacing: 0,
    wordSpacing: 0,
    hScale: 1,
    rise: 0,
    leading: 0,
    textMatrix: IDENTITY,
    x: 0,
    y: 0,
    lineX: 0,
    lineY: 0,
  };
}

type Subpath = [number, number][];

/**
 * @param viewport maps PDF user space to top-left page points
 *   (pdf.js `page.getViewport({ scale: 1 }).transform`).
 * @param getFont looks up a font loaded by pdf.js from its operator-list id.
 */
export function readPage(
  operators: OperatorList,
  OPS: PdfOps,
  viewport: { width: number; height: number; transform: number[] },
  getFont: (id: string) => { name: string; font: PdfFont } | null,
): PageContent {
  const page = viewport.transform as Matrix;
  const glyphs: PlacedGlyph[] = [];
  const horizontal: Segment[] = [];
  const vertical: Segment[] = [];
  const stack: State[] = [];
  let state = initialState();
  let subpaths: Subpath[] = [];
  // pdf.js may split one path over several constructPath operations.
  let current: Subpath | null = null;

  function addLine(
    [x0, y0]: [number, number],
    [x1, y1]: [number, number],
    thickness: number,
  ) {
    if (thickness > MAX_LINE_THICKNESS) return;
    if (Math.abs(y1 - y0) <= STRAIGHT_TOLERANCE && x0 !== x1) {
      horizontal.push({
        start: Math.min(x0, x1),
        end: Math.max(x0, x1),
        at: (y0 + y1) / 2,
        thickness,
      });
    } else if (Math.abs(x1 - x0) <= STRAIGHT_TOLERANCE && y0 !== y1) {
      vertical.push({
        start: Math.min(y0, y1),
        end: Math.max(y0, y1),
        at: (x0 + x1) / 2,
        thickness,
      });
    }
  }

  function paintPath(stroked: boolean, filled: boolean) {
    const device = multiply(page, state.ctm);
    const strokeWidth = state.lineWidth * scaleOf(device);
    for (const subpath of subpaths) {
      const points = subpath.map(([x, y]) => apply(device, x, y));
      if (points.length === 0) continue;
      if (stroked) {
        for (let index = 1; index < points.length; index++) {
          addLine(points[index - 1], points[index], strokeWidth);
        }
      }
      // A thin filled rectangle is how many programs draw lines.
      if (filled && points.length >= 3) {
        const xs = points.map(([x]) => x);
        const ys = points.map(([, y]) => y);
        const left = Math.min(...xs);
        const right = Math.max(...xs);
        const top = Math.min(...ys);
        const bottom = Math.max(...ys);
        if (bottom - top <= right - left) {
          const middle = (top + bottom) / 2;
          addLine([left, middle], [right, middle], bottom - top);
        } else {
          const middle = (left + right) / 2;
          addLine([middle, top], [middle, bottom], right - left);
        }
      }
    }
    subpaths = [];
    current = null;
  }

  function constructPath(ops: number[], args: number[]) {
    let cursor = 0;
    for (const op of ops) {
      if (op === OPS.moveTo) {
        current = [[args[cursor], args[cursor + 1]]];
        subpaths.push(current);
        cursor += 2;
      } else if (op === OPS.lineTo) {
        const point: [number, number] = [args[cursor], args[cursor + 1]];
        if (current) current.push(point);
        else subpaths.push((current = [point]));
        cursor += 2;
      } else if (op === OPS.curveTo) {
        // Curves are never staff lines; end the straight run here.
        current = [[args[cursor + 4], args[cursor + 5]]];
        subpaths.push(current);
        cursor += 6;
      } else if (op === OPS.curveTo2 || op === OPS.curveTo3) {
        current = [[args[cursor + 2], args[cursor + 3]]];
        subpaths.push(current);
        cursor += 4;
      } else if (op === OPS.rectangle) {
        const [x, y, w, h] = args.slice(cursor, cursor + 4);
        subpaths.push([
          [x, y],
          [x + w, y],
          [x + w, y + h],
          [x, y + h],
          [x, y],
        ]);
        current = null;
        cursor += 4;
      } else if (op === OPS.closePath && current && current.length > 0) {
        current.push(current[0]);
      }
    }
  }

  function showText(items: (PdfGlyph | number | null)[]) {
    const { font, fontSize } = state;
    if (!font || fontSize === 0 || font.vertical) return;
    const unitsPerEm = font.fontMatrix?.[0] ?? 0.001;
    const hScale = state.hScale * state.fontDirection;
    const device = multiply(multiply(page, state.ctm), state.textMatrix);
    const size = fontSize * scaleOf(device);
    let advance = 0;

    for (const item of items) {
      if (item === null) continue;
      if (typeof item === "number") {
        advance -= (item * fontSize) / 1000;
        continue;
      }
      const width = (item.width ?? 0) * unitsPerEm * fontSize;
      const [x, y] = apply(
        device,
        state.x + advance * hScale,
        state.y + state.rise,
      );
      const code = item.originalCharCode;
      const glyphName =
        code === undefined
          ? null
          : (font.differences?.[code] ?? font.defaultEncoding?.[code] ?? null);
      const codepoint =
        item.unicode && [...item.unicode].length === 1
          ? item.unicode.codePointAt(0)!
          : null;
      glyphs.push({
        font: state.fontName,
        glyphName: glyphName || null,
        codepoint,
        x,
        y,
        width: Math.abs(width * hScale) * (size / fontSize),
        size,
      });
      const spacing =
        (item.isSpace ? state.wordSpacing : 0) + state.charSpacing;
      advance += width + spacing * state.fontDirection;
    }
    state.x += advance * hScale;
  }

  operators.fnArray.forEach((fn, index) => {
    const args = operators.argsArray[index] ?? [];
    switch (fn) {
      case OPS.save:
        stack.push({ ...state });
        break;
      case OPS.restore:
        state = stack.pop() ?? state;
        break;
      case OPS.transform:
        state.ctm = multiply(state.ctm, args as Matrix);
        break;
      case OPS.paintFormXObjectBegin: {
        stack.push({ ...state });
        const matrix = args[0] as Matrix | null;
        if (Array.isArray(matrix) && matrix.length === 6) {
          state.ctm = multiply(state.ctm, matrix);
        }
        break;
      }
      case OPS.paintFormXObjectEnd:
        state = stack.pop() ?? state;
        break;
      case OPS.setLineWidth:
        state.lineWidth = args[0] as number;
        break;
      case OPS.constructPath:
        constructPath(args[0] as number[], args[1] as number[]);
        break;
      case OPS.stroke:
      case OPS.closeStroke:
        paintPath(true, false);
        break;
      case OPS.fill:
      case OPS.eoFill:
        paintPath(false, true);
        break;
      case OPS.fillStroke:
      case OPS.eoFillStroke:
      case OPS.closeFillStroke:
      case OPS.closeEOFillStroke:
        paintPath(true, true);
        break;
      case OPS.endPath:
        subpaths = [];
        current = null;
        break;
      case OPS.beginText:
        state.textMatrix = IDENTITY;
        state.x = state.y = state.lineX = state.lineY = 0;
        break;
      case OPS.setFont: {
        const loaded = getFont(args[0] as string);
        let size = args[1] as number;
        state.fontDirection = size < 0 ? -1 : 1;
        if (size < 0) size = -size;
        state.font = loaded?.font ?? null;
        state.fontName = loaded ? stripSubsetPrefix(loaded.name) : "";
        state.fontSize = size;
        break;
      }
      case OPS.setTextMatrix:
        state.textMatrix = (
          Array.isArray(args[0]) ? args[0] : args
        ) as Matrix;
        state.x = state.y = state.lineX = state.lineY = 0;
        break;
      case OPS.moveText:
        state.x = state.lineX += args[0] as number;
        state.y = state.lineY += args[1] as number;
        break;
      case OPS.setLeadingMoveText:
        state.leading = args[1] as number;
        state.x = state.lineX += args[0] as number;
        state.y = state.lineY += args[1] as number;
        break;
      case OPS.setLeading:
        state.leading = -(args[0] as number);
        break;
      case OPS.nextLine:
        state.x = state.lineX;
        state.y = state.lineY += state.leading;
        break;
      case OPS.setCharSpacing:
        state.charSpacing = args[0] as number;
        break;
      case OPS.setWordSpacing:
        state.wordSpacing = args[0] as number;
        break;
      case OPS.setHScale:
        state.hScale = (args[0] as number) / 100;
        break;
      case OPS.setTextRise:
        state.rise = args[0] as number;
        break;
      case OPS.showText:
        showText(args[0] as (PdfGlyph | number | null)[]);
        break;
    }
  });

  return {
    width: viewport.width,
    height: viewport.height,
    glyphs,
    horizontal,
    vertical,
  };
}
