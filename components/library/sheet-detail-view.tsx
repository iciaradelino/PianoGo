"use client";

import {
  ArrowLeft,
  Check,
  Download,
  LoaderCircle,
  Minus,
  MousePointerClick,
  Pencil,
  Piano,
  Plus,
  Printer,
  Sparkles,
  Trash2,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { Difficulty, PracticeStatus, Sheet } from "@/lib/library/model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AnnotationStyleControls } from "@/components/processing/annotation-style-controls";
import { MusicXmlScore } from "@/components/processing/musicxml-score";
import {
  defaultAnnotationStyle,
  parseAnnotationStyle,
  type AnnotationStyle,
} from "@/lib/processing/annotation-style";
import type { PdfNoteRecord } from "@/lib/processing/repository";

// pdf.js only runs in the browser.
const PdfScore = dynamic(
  () => import("@/components/processing/pdf-score").then((module) => module.PdfScore),
  { ssr: false },
);

const zoomSteps = [0.75, 1, 1.25, 1.5];
// Keeps the loading state on screen long enough to read, even for short scores.
const minimumGeneratingMs = 900;
// How often to ask whether a scan has been read.
const scanPollMs = 3000;

// "processing" is a scan being read on the server, which takes minutes.
type AnnotationState =
  | "checking"
  | "none"
  | "generating"
  | "processing"
  | "ready"
  | "failed";

type ScanProgress = { sheet: number; sheets: number };

type AnnotationPayload = {
  status?: string;
  style?: unknown;
  progress?: ScanProgress;
  error?: string;
};

function scanMessage(progress: ScanProgress | null) {
  return progress
    ? `Reading the scan… page ${progress.sheet} of ${progress.sheets}`
    : "Reading the scan…";
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchPdfNotes(sheetId: number) {
  const response = await fetch(`/api/annotations/notes?sheetId=${sheetId}`);
  if (!response.ok) throw new Error("Could not load the annotations.");
  const payload = (await response.json()) as { notes?: PdfNoteRecord[] };
  return payload.notes ?? [];
}

type SheetDetailViewProps = {
  sheet: Sheet;
  onBack: () => void;
  onOpenInPiano: () => void;
  onUpdate: (sheet: Sheet) => void;
  onDelete: (id: number) => void;
};

export function SheetDetailView({
  sheet,
  onBack,
  onOpenInPiano,
  onUpdate,
  onDelete,
}: SheetDetailViewProps) {
  const sheetIdRef = useRef(sheet.id);
  const [seenId, setSeenId] = useState(sheet.id);
  const [annotationState, setAnnotationState] =
    useState<AnnotationState>("checking");
  const [annotationsVisible, setAnnotationsVisible] = useState(true);
  const [labelStyle, setLabelStyle] = useState(defaultAnnotationStyle);
  const [pdfNotes, setPdfNotes] = useState<PdfNoteRecord[]>([]);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const savedStyleRef = useRef(defaultAnnotationStyle);
  const styleRequestRef = useRef(0);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(sheet.title);
  const [composer, setComposer] = useState(sheet.composer);
  const [zoom, setZoom] = useState(1);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileUrl = `/api/sheets/${sheet.id}/file`;

  if (sheet.id !== seenId) {
    setSeenId(sheet.id);
    setTitle(sheet.title);
    setComposer(sheet.composer);
    setRenaming(false);
    setZoom(1);
    setConfirmRemove(false);
    setError("");
    setAnnotationState("checking");
    setAnnotationsVisible(true);
    setLabelStyle(defaultAnnotationStyle);
    setPdfNotes([]);
    setScanProgress(null);
  }

  useEffect(() => {
    sheetIdRef.current = sheet.id;
    let cancelled = false;

    async function loadAnnotationStatus() {
      try {
        const response = await fetch(`/api/annotations?sheetId=${sheet.id}`);
        const payload = (await response.json()) as AnnotationPayload;
        if (cancelled) return;
        const style = parseAnnotationStyle(payload.style);
        const status = response.ok ? payload.status : undefined;
        const notes =
          status === "ready" && sheet.fileType === "pdf"
            ? await fetchPdfNotes(sheet.id)
            : [];
        if (cancelled) return;
        savedStyleRef.current = style;
        setLabelStyle(style);
        setPdfNotes(notes);
        setScanProgress(payload.progress ?? null);
        setAnnotationState(
          status === "ready" || status === "processing" || status === "failed"
            ? status
            : "none",
        );
      } catch {
        if (!cancelled) setAnnotationState("none");
      }
    }

    void loadAnnotationStatus();
    return () => {
      cancelled = true;
    };
  }, [sheet.id, sheet.fileType]);

  // Asks every few seconds whether the scan being read is done.
  useEffect(() => {
    if (annotationState !== "processing") return;
    const sheetId = sheet.id;
    let cancelled = false;

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/annotations?sheetId=${sheetId}`);
        const payload = (await response.json()) as AnnotationPayload;
        if (cancelled || !response.ok) return;
        if (payload.status === "processing") {
          setScanProgress(payload.progress ?? null);
        } else if (payload.status === "ready") {
          const notes = await fetchPdfNotes(sheetId);
          if (cancelled) return;
          setPdfNotes(notes);
          setScanProgress(null);
          setAnnotationsVisible(true);
          setAnnotationState("ready");
        } else {
          setScanProgress(null);
          setAnnotationState("failed");
        }
      } catch {
        // A missed poll is retried on the next tick.
      }
    }, scanPollMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [annotationState, sheet.id]);

  async function handleGenerateAnnotations() {
    const sheetId = sheet.id;
    setAnnotationState("generating");
    setError("");
    try {
      const [response] = await Promise.all([
        fetch("/api/annotations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sheetId }),
        }),
        delay(minimumGeneratingMs),
      ]);
      if (sheetIdRef.current !== sheetId) return;
      const payload = (await response
        .json()
        .catch(() => ({}))) as AnnotationPayload;
      if (sheetIdRef.current !== sheetId) return;
      if (!response.ok) {
        setAnnotationState("none");
        setError(payload.error ?? "Could not generate annotations.");
        return;
      }
      if (payload.status === "processing") {
        setScanProgress(payload.progress ?? null);
        setAnnotationState("processing");
        return;
      }
      if (sheet.fileType === "pdf") {
        const notes = await fetchPdfNotes(sheetId);
        if (sheetIdRef.current !== sheetId) return;
        setPdfNotes(notes);
      }
      setAnnotationsVisible(true);
      setAnnotationState("ready");
    } catch {
      if (sheetIdRef.current !== sheetId) return;
      setAnnotationState("none");
      setError("Could not generate annotations.");
    }
  }

  async function handleStyleChange(next: AnnotationStyle) {
    const sheetId = sheet.id;
    const request = ++styleRequestRef.current;
    setLabelStyle(next);
    setAnnotationsVisible(true);
    setError("");
    try {
      const response = await fetch("/api/annotations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId, style: next }),
      });
      if (!response.ok) throw new Error("Could not save the style.");
      const payload = (await response.json()) as { style?: unknown };
      savedStyleRef.current = parseAnnotationStyle(payload.style);
    } catch {
      // Only the latest change decides what is shown; older replies are stale.
      if (sheetIdRef.current !== sheetId) return;
      if (request !== styleRequestRef.current) return;
      setLabelStyle(savedStyleRef.current);
      setError("Could not save the annotation style.");
    }
  }

  async function save(next: {
    title: string;
    composer: string;
    difficulty: Difficulty;
    status: PracticeStatus;
  }) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/sheets/${sheet.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const payload = (await response.json()) as Sheet & { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not save this sheet.");
        return false;
      }
      onUpdate(payload);
      setRenaming(false);
      setTitle(payload.title);
      setComposer(payload.composer);
      return true;
    } catch {
      setError("Could not save this sheet.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function draft(overrides: Partial<{
    title: string;
    composer: string;
    difficulty: Difficulty;
    status: PracticeStatus;
  }> = {}) {
    return {
      title: renaming ? title : sheet.title,
      composer: renaming ? composer : sheet.composer,
      difficulty: sheet.difficulty,
      status: sheet.status,
      ...overrides,
    };
  }

  function handlePrint() {
    window.open(fileUrl, "_blank", "noopener,noreferrer");
  }

  async function handleDelete() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/sheets/${sheet.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setError("Could not remove this sheet.");
        return;
      }
      onDelete(sheet.id);
    } catch {
      setError("Could not remove this sheet.");
    } finally {
      setSaving(false);
    }
  }

  function changeZoom(direction: -1 | 1) {
    setZoom((current) => {
      const index = zoomSteps.indexOf(current);
      return zoomSteps[index + direction] ?? current;
    });
  }

  return (
    <section className="sheet-detail">
      <div className="sheet-detail-body">
        <div className="score-viewer">
          <div className="score-toolbar">
            <span className="score-page-count">
              {sheet.fileType === "pdf" ? "PDF" : "MusicXML"}
            </span>
            <div className="zoom-controls">
              <Button
                aria-label="Zoom out"
                disabled={zoom === zoomSteps[0]}
                onClick={() => changeZoom(-1)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Minus aria-hidden="true" />
              </Button>
              <span>{Math.round(zoom * 100)}%</span>
              <Button
                aria-label="Zoom in"
                disabled={zoom === zoomSteps[zoomSteps.length - 1]}
                onClick={() => changeZoom(1)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Plus aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="score-canvas">
            <div
              className={
                sheet.fileType === "pdf" ? "score-zoom score-zoom-pdf" : "score-zoom"
              }
              style={{ "--score-zoom": zoom } as React.CSSProperties}
            >
              {sheet.fileType === "pdf" ? (
                <PdfScore
                  annotationsVisible={
                    annotationState === "ready" && annotationsVisible
                  }
                  fileUrl={fileUrl}
                  generating={
                    annotationState === "generating" ||
                    annotationState === "processing"
                  }
                  generatingMessage={
                    annotationState === "processing"
                      ? scanMessage(scanProgress)
                      : undefined
                  }
                  labelStyle={labelStyle}
                  notes={pdfNotes}
                  title={sheet.title}
                />
              ) : (
                <MusicXmlScore
                  annotationsVisible={
                    annotationState === "ready" && annotationsVisible
                  }
                  labelStyle={labelStyle}
                  generating={annotationState === "generating"}
                  fileUrl={fileUrl}
                  title={sheet.title}
                  zoom={zoom}
                />
              )}
            </div>
          </div>
        </div>

        <aside className="sheet-inspector">
          <section className="sheet-summary">
            <div className="sheet-title-group">
              <Button
                aria-label="Back to library"
                onClick={onBack}
                size="icon"
                type="button"
                variant="ghost"
              >
                <ArrowLeft aria-hidden="true" />
              </Button>
              {renaming ? (
                <div className="sheet-rename">
                  <Input
                    aria-label="Title"
                    onChange={(event) => setTitle(event.target.value)}
                    value={title}
                  />
                  <Input
                    aria-label="Composer"
                    onChange={(event) => setComposer(event.target.value)}
                    placeholder="Composer"
                    value={composer}
                  />
                </div>
              ) : (
                <div>
                  <h1>{sheet.title}</h1>
                  <p>{sheet.composer}</p>
                </div>
              )}
            </div>

            <div className="sheet-actions">
              {renaming ? (
                <>
                  <Button
                    disabled={saving}
                    onClick={() => void save(draft())}
                    size="sm"
                    type="button"
                  >
                    Save
                  </Button>
                  <Button
                    onClick={() => {
                      setTitle(sheet.title);
                      setComposer(sheet.composer);
                      setRenaming(false);
                      setError("");
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => setRenaming(true)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Pencil aria-hidden="true" />
                  Rename
                </Button>
              )}
              <Button asChild aria-label="Download sheet" size="icon" variant="outline">
                <a download href={fileUrl}>
                  <Download aria-hidden="true" />
                </a>
              </Button>
              <Button
                aria-label="Print sheet"
                onClick={handlePrint}
                size="icon"
                type="button"
                variant="outline"
              >
                <Printer aria-hidden="true" />
              </Button>
              <Button
                aria-label="Remove sheet"
                onClick={() => setConfirmRemove(true)}
                size="icon"
                type="button"
                variant="outline"
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>

            {confirmRemove ? (
              <div className="sheet-confirm">
                <span>Remove this sheet?</span>
                <Button
                  disabled={saving}
                  onClick={() => void handleDelete()}
                  size="sm"
                  type="button"
                  variant="destructive"
                >
                  Remove
                </Button>
                <Button
                  onClick={() => setConfirmRemove(false)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Cancel
                </Button>
              </div>
            ) : null}
            {error ? <p className="sheet-error">{error}</p> : null}
          </section>

          <section>
            <h2>Properties</h2>
            <div className="sheet-field">
              <span>Difficulty</span>
              <Select
                disabled={saving}
                onValueChange={(value) =>
                  void save(draft({ difficulty: value as Difficulty }))
                }
                value={sheet.difficulty}
              >
                <SelectTrigger aria-label="Difficulty">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Beginner">Beginner</SelectItem>
                  <SelectItem value="Intermediate">Intermediate</SelectItem>
                  <SelectItem value="Advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="sheet-field">
              <span>Practice status</span>
              <Select
                disabled={saving}
                onValueChange={(value) =>
                  void save(draft({ status: value as PracticeStatus }))
                }
                value={sheet.status}
              >
                <SelectTrigger aria-label="Practice status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Not started">Not started</SelectItem>
                  <SelectItem value="In progress">In progress</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>

          <section>
            <div className="inspector-section-heading">
              <h2>Annotations</h2>
              <div className="annotation-switch">
                <span>Show</span>
                <Switch
                  aria-label="Show annotations"
                  checked={annotationState === "ready" && annotationsVisible}
                  disabled={annotationState !== "ready"}
                  onCheckedChange={setAnnotationsVisible}
                />
              </div>
            </div>
            <div className="annotation-actions">
              <Button
                aria-busy={
                  annotationState === "generating" ||
                  annotationState === "processing"
                }
                disabled={
                  annotationState !== "none" && annotationState !== "failed"
                }
                onClick={() => void handleGenerateAnnotations()}
                type="button"
                variant="outline"
              >
                {annotationState === "generating" ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                    Generating annotations…
                  </>
                ) : annotationState === "processing" ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                    Reading the scan…
                  </>
                ) : annotationState === "failed" ? (
                  <>
                    <Sparkles aria-hidden="true" />
                    Try again
                  </>
                ) : annotationState === "ready" ? (
                  <>
                    <Check aria-hidden="true" />
                    Annotations generated
                  </>
                ) : (
                  <>
                    <Sparkles aria-hidden="true" />
                    Generate annotations
                  </>
                )}
              </Button>
              <Button type="button" variant="outline">
                <MousePointerClick aria-hidden="true" />
                Add manually
              </Button>
            </div>
            {annotationState === "processing" ? (
              <p className="annotation-note">
                Scanned sheets are read with optical music recognition, which
                takes about half a minute per page. You can leave this page.
              </p>
            ) : null}
            {annotationState === "failed" ? (
              <p className="annotation-note annotation-note-error">
                The music in this scan could not be recognised. Clear, straight
                scans of printed music work best.
              </p>
            ) : null}
          </section>

          {annotationState === "ready" && annotationsVisible ? (
            <section>
              <h2>Annotation style</h2>
              <AnnotationStyleControls
                onChange={(next) => void handleStyleChange(next)}
                style={labelStyle}
              />
            </section>
          ) : null}

          <section>
            <h2>Piano</h2>
            <div className="annotation-actions">
              <Button onClick={onOpenInPiano} type="button" variant="outline">
                <Piano aria-hidden="true" />
                Open in Piano
              </Button>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
