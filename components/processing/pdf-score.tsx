"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  labelColorValues,
  labelFontSizes,
  type AnnotationStyle,
} from "@/lib/processing/annotation-style";
import { STEP_SEMITONES } from "@/lib/processing/pdf/find-notes";
import type { PdfNoteRecord } from "@/lib/processing/repository";
import { noteName } from "@/lib/processing/solfege";
import { useSettings } from "@/components/settings/settings-provider";

// Label sizes are in score units, where one staff space is 10.
const SCORE_UNITS_PER_SPACE = 10;
// Printed scores have far smaller staves than the MusicXML view, so labels
// sized like there would be hard to read.
const PDF_LABEL_SCALE = 1.5;
const BESIDE_GAP = 0.25;
const BELOW_GAP = 0.8;
const LINE_HEIGHT = 1.2;
// Pages this far outside the view are drawn ahead, or let go to save memory.
const RENDER_MARGIN = "1200px 0px";
// Canvases sharper than this cost a lot of memory for little gain.
const MAX_PIXEL_RATIO = 2;

type PdfPageProxy = {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void>; cancel: () => void };
};

type PdfDocumentProxy = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
  destroy: () => Promise<void>;
};

type PageSize = { width: number; height: number };

type PdfScoreProps = {
  fileUrl: string;
  title: string;
  annotationsVisible: boolean;
  labelStyle: AnnotationStyle;
  notes: PdfNoteRecord[];
  generating?: boolean;
  generatingMessage?: string;
};

async function openPdf(fileUrl: string) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const document = await pdfjs.getDocument({ url: fileUrl }).promise;
  return document as unknown as PdfDocumentProxy;
}

type Label = {
  key: string;
  text: string;
  x: number;
  y: number;
  anchor: "start" | "middle";
  fontSize: number;
};

function labelText(note: PdfNoteRecord, style: AnnotationStyle) {
  return noteName(STEP_SEMITONES[note.step], note.alter, note.octave, style);
}

function fontSizeFor(note: PdfNoteRecord, style: AnnotationStyle) {
  return (
    (labelFontSizes[style.size] / SCORE_UNITS_PER_SPACE) *
    note.staffSpace *
    PDF_LABEL_SCALE
  );
}

function besideLabels(notes: PdfNoteRecord[], style: AnnotationStyle) {
  return notes.flatMap((note, index): Label[] => {
    const text = labelText(note, style);
    if (!text) return [];
    return [
      {
        key: String(index),
        text,
        x: note.x + note.width + BESIDE_GAP * note.staffSpace,
        y: note.y + note.height / 2,
        anchor: "start",
        fontSize: fontSizeFor(note, style),
      },
    ];
  });
}

/** Stacks each chord's names under its staff, highest note on top. */
function belowLabels(notes: PdfNoteRecord[], style: AnnotationStyle) {
  const chords: PdfNoteRecord[][] = [];
  const sorted = [...notes].sort(
    (a, b) => a.staffBottom - b.staffBottom || a.x - b.x,
  );
  for (const note of sorted) {
    const chord = chords.at(-1);
    const first = chord?.[0];
    const together =
      first &&
      first.staffBottom === note.staffBottom &&
      Math.abs(first.x - note.x) <= first.width * 1.1;
    if (chord && together) chord.push(note);
    else chords.push([note]);
  }

  return chords.flatMap((chord, chordIndex) => {
    const ordered = [...chord].sort((a, b) => b.pianoKeyIndex - a.pianoKeyIndex);
    const space = chord[0].staffSpace;
    const fontSize = fontSizeFor(chord[0], style);
    const lowest = Math.max(
      chord[0].staffBottom,
      ...chord.map((note) => note.y + note.height),
    );
    const x = Math.min(...chord.map((note) => note.x + note.width / 2));
    return ordered.flatMap((note, index): Label[] => {
      const text = labelText(note, style);
      if (!text) return [];
      return [
        {
          key: `${chordIndex}-${index}`,
          text,
          x,
          y: lowest + BELOW_GAP * space + fontSize * (1 + index * LINE_HEIGHT),
          anchor: "middle",
          fontSize,
        },
      ];
    });
  });
}

type PdfPageViewProps = {
  document: PdfDocumentProxy;
  pageNumber: number;
  size: PageSize;
  notes: PdfNoteRecord[];
  labelStyle: AnnotationStyle | null;
};

function PdfPageView({
  document,
  pageNumber,
  size,
  notes,
  labelStyle,
}: PdfPageViewProps) {
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nearView, setNearView] = useState(false);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const intersection = new IntersectionObserver(
      ([entry]) => setNearView(entry.isIntersecting),
      { rootMargin: RENDER_MARGIN },
    );
    const resize = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry.contentRect.width)),
    );
    intersection.observe(page);
    resize.observe(page);
    return () => {
      intersection.disconnect();
      resize.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!nearView || width === 0) {
      // Frees the bitmap of pages far from view.
      canvas.width = 0;
      canvas.height = 0;
      return;
    }

    let cancelled = false;
    let task: { promise: Promise<void>; cancel: () => void } | null = null;

    async function draw(target: HTMLCanvasElement) {
      const page = await document.getPage(pageNumber);
      if (cancelled) return;
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      const viewport = page.getViewport({ scale: (width / size.width) * ratio });
      // Draw off screen first so the old page stays visible until the new one is ready.
      const buffer = window.document.createElement("canvas");
      buffer.width = Math.floor(viewport.width);
      buffer.height = Math.floor(viewport.height);
      const context = buffer.getContext("2d");
      if (!context) return;
      task = page.render({ canvasContext: context, viewport });
      await task.promise;
      if (cancelled) return;
      target.width = buffer.width;
      target.height = buffer.height;
      target.getContext("2d")?.drawImage(buffer, 0, 0);
    }

    draw(canvas).catch((error: unknown) => {
      if ((error as { name?: string })?.name === "RenderingCancelledException") {
        return;
      }
      console.error("Could not draw the PDF page.", error);
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [document, pageNumber, nearView, width, size.width]);

  const labels = useMemo(() => {
    if (!labelStyle) return [];
    return labelStyle.position === "below"
      ? belowLabels(notes, labelStyle)
      : besideLabels(notes, labelStyle);
  }, [notes, labelStyle]);

  return (
    <div
      className="pdf-page"
      ref={pageRef}
      style={{ aspectRatio: `${size.width} / ${size.height}` }}
    >
      <canvas className="pdf-page-canvas" ref={canvasRef} />
      {labelStyle && labels.length > 0 ? (
        <svg
          aria-hidden="true"
          className="pdf-page-labels"
          viewBox={`0 0 ${size.width} ${size.height}`}
        >
          {labels.map((label) => (
            <text
              className="solfege-label"
              dominantBaseline={label.anchor === "start" ? "central" : undefined}
              fill={labelColorValues[labelStyle.color]}
              fontSize={label.fontSize}
              key={label.key}
              // The shared class sets a stroke in pixels; pages are in points.
              style={{ strokeWidth: label.fontSize * 0.25 }}
              textAnchor={label.anchor}
              x={label.x}
              y={label.y}
            >
              {label.text}
            </text>
          ))}
        </svg>
      ) : null}
    </div>
  );
}

type LoadState =
  | { url: string; document: PdfDocumentProxy; pages: PageSize[] }
  | { url: string; failed: true };

export function PdfScore({
  fileUrl,
  title,
  annotationsVisible,
  labelStyle,
  notes,
  generating = false,
  generatingMessage,
}: PdfScoreProps) {
  const { t } = useSettings();
  const [loaded, setLoaded] = useState<LoadState>();
  const current = loaded?.url === fileUrl ? loaded : undefined;

  useEffect(() => {
    let cancelled = false;
    let opened: PdfDocumentProxy | null = null;

    async function load() {
      try {
        const document = await openPdf(fileUrl);
        opened = document;
        const pages: PageSize[] = [];
        for (let number = 1; number <= document.numPages; number++) {
          const page = await document.getPage(number);
          const { width, height } = page.getViewport({ scale: 1 });
          pages.push({ width, height });
        }
        if (!cancelled) setLoaded({ url: fileUrl, document, pages });
      } catch {
        if (!cancelled) setLoaded({ url: fileUrl, failed: true });
      }
    }

    void load();
    return () => {
      cancelled = true;
      void opened?.destroy();
    };
  }, [fileUrl]);

  const notesByPage = useMemo(() => {
    const byPage = new Map<number, PdfNoteRecord[]>();
    for (const note of notes) {
      const list = byPage.get(note.page) ?? [];
      list.push(note);
      byPage.set(note.page, list);
    }
    return byPage;
  }, [notes]);

  const visibleStyle = annotationsVisible ? labelStyle : null;

  return (
    <div aria-label={title} className="score-file score-pdf" role="img">
      {!current ? <p className="score-musicxml-status">{t("score.loading")}</p> : null}
      {current && "failed" in current ? (
        <p className="score-musicxml-status">
          {t("score.pdfFailed")}
        </p>
      ) : null}
      {current && "document" in current
        ? current.pages.map((size, index) => (
            <PdfPageView
              document={current.document}
              key={index}
              labelStyle={visibleStyle}
              notes={notesByPage.get(index + 1) ?? []}
              pageNumber={index + 1}
              size={size}
            />
          ))
        : null}
      {generating && current && "document" in current ? (
        <div className="score-generating" role="status">
          <span className="score-generating-badge">
            <LoaderCircle aria-hidden="true" className="animate-spin" />
            {generatingMessage ?? t("score.findingNotes")}
          </span>
        </div>
      ) : null}
    </div>
  );
}
