"use client";

import {
  ArrowLeft,
  Check,
  Download,
  LoaderCircle,
  Minus,
  MousePointerClick,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Piano,
  Plus,
  Printer,
  Sparkles,
  Trash2,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import {
  difficulties,
  practiceStatuses,
  type Difficulty,
  type PracticeStatus,
  type Sheet,
} from "@/lib/library/model";
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
import { useSettings } from "@/components/settings/settings-provider";
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

function scanMessage(
  t: ReturnType<typeof useSettings>["t"],
  progress: ScanProgress | null,
) {
  return progress
    ? t("sheet.readingScanPage", {
        page: progress.sheet,
        pages: progress.sheets,
      })
    : t("sheet.readingScan");
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
  const { t } = useSettings();
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
  // With the panel closed, the score gets the room to show two pages.
  const [panelOpen, setPanelOpen] = useState(true);
  const spread = !panelOpen;
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
        setError(payload.error ?? t("sheet.generateFailed"));
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
      setError(t("sheet.generateFailed"));
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
      setError(t("sheet.styleFailed"));
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
        setError(payload.error ?? t("sheet.saveFailed"));
        return false;
      }
      onUpdate(payload);
      setRenaming(false);
      setTitle(payload.title);
      setComposer(payload.composer);
      return true;
    } catch {
      setError(t("sheet.saveFailed"));
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
        setError(t("sheet.removeFailed"));
        return;
      }
      onDelete(sheet.id);
    } catch {
      setError(t("sheet.removeFailed"));
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
      <div
        className={
          panelOpen ? "sheet-detail-body" : "sheet-detail-body sheet-detail-body-wide"
        }
      >
        <div className="score-viewer">
          <div className="score-toolbar">
            <span className="score-page-count">
              {sheet.fileType === "pdf" ? "PDF" : "MusicXML"}
            </span>
            <div className="zoom-controls">
              <Button
                aria-label={t("sheet.zoomOut")}
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
                aria-label={t("sheet.zoomIn")}
                disabled={zoom === zoomSteps[zoomSteps.length - 1]}
                onClick={() => changeZoom(1)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Plus aria-hidden="true" />
              </Button>
              <span aria-hidden="true" className="toolbar-divider" />
              <Button
                aria-label={panelOpen ? t("sheet.hidePanel") : t("sheet.showPanel")}
                aria-pressed={!panelOpen}
                onClick={() => setPanelOpen((open) => !open)}
                size="icon-sm"
                title={panelOpen ? t("sheet.hidePanel") : t("sheet.showPanel")}
                type="button"
                variant="ghost"
              >
                {panelOpen ? (
                  <PanelRightClose aria-hidden="true" />
                ) : (
                  <PanelRightOpen aria-hidden="true" />
                )}
              </Button>
            </div>
          </div>

          <div className="score-canvas">
            <div
              className={[
                "score-zoom",
                sheet.fileType === "pdf" ? "score-zoom-pdf" : "",
                spread ? "score-zoom-spread" : "",
              ]
                .filter(Boolean)
                .join(" ")}
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
                      ? scanMessage(t, scanProgress)
                      : undefined
                  }
                  labelStyle={labelStyle}
                  notes={pdfNotes}
                  spread={spread}
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
                  spread={spread}
                  title={sheet.title}
                  zoom={zoom}
                />
              )}
            </div>
          </div>
        </div>

        {panelOpen ? (
        <aside className="sheet-inspector">
          <section className="sheet-summary">
            <div className="sheet-title-group">
              <Button
                aria-label={t("sheet.back")}
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
                    aria-label={t("sheet.title")}
                    onChange={(event) => setTitle(event.target.value)}
                    value={title}
                  />
                  <Input
                    aria-label={t("sheet.composer")}
                    onChange={(event) => setComposer(event.target.value)}
                    placeholder={t("sheet.composer")}
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
                    {t("sheet.save")}
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
                    {t("sheet.cancel")}
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
                  {t("sheet.rename")}
                </Button>
              )}
              <Button asChild aria-label={t("sheet.download")} size="icon" variant="outline">
                <a download href={fileUrl}>
                  <Download aria-hidden="true" />
                </a>
              </Button>
              <Button
                aria-label={t("sheet.print")}
                onClick={handlePrint}
                size="icon"
                type="button"
                variant="outline"
              >
                <Printer aria-hidden="true" />
              </Button>
              <Button
                aria-label={t("sheet.remove")}
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
                <span>{t("sheet.confirmRemove")}</span>
                <Button
                  disabled={saving}
                  onClick={() => void handleDelete()}
                  size="sm"
                  type="button"
                  variant="destructive"
                >
                  {t("sheet.removeAction")}
                </Button>
                <Button
                  onClick={() => setConfirmRemove(false)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {t("sheet.cancel")}
                </Button>
              </div>
            ) : null}
            {error ? <p className="sheet-error">{error}</p> : null}
          </section>

          <section>
            <h2>{t("sheet.properties")}</h2>
            <div className="sheet-field">
              <span>{t("sheet.difficulty")}</span>
              <Select
                disabled={saving}
                onValueChange={(value) =>
                  void save(draft({ difficulty: value as Difficulty }))
                }
                value={sheet.difficulty}
              >
                <SelectTrigger aria-label={t("sheet.difficulty")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {difficulties.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(`difficulty.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="sheet-field">
              <span>{t("sheet.practiceStatus")}</span>
              <Select
                disabled={saving}
                onValueChange={(value) =>
                  void save(draft({ status: value as PracticeStatus }))
                }
                value={sheet.status}
              >
                <SelectTrigger aria-label={t("sheet.practiceStatus")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {practiceStatuses.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(`status.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <section>
            <div className="inspector-section-heading">
              <h2>{t("sheet.annotations")}</h2>
              <div className="annotation-switch">
                <span>{t("sheet.show")}</span>
                <Switch
                  aria-label={t("sheet.showAnnotations")}
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
                    {t("sheet.generating")}
                  </>
                ) : annotationState === "processing" ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                    {t("sheet.readingScan")}
                  </>
                ) : annotationState === "failed" ? (
                  <>
                    <Sparkles aria-hidden="true" />
                    {t("sheet.tryAgain")}
                  </>
                ) : annotationState === "ready" ? (
                  <>
                    <Check aria-hidden="true" />
                    {t("sheet.generated")}
                  </>
                ) : (
                  <>
                    <Sparkles aria-hidden="true" />
                    {t("sheet.generate")}
                  </>
                )}
              </Button>
              <Button type="button" variant="outline">
                <MousePointerClick aria-hidden="true" />
                {t("sheet.addManually")}
              </Button>
            </div>
            {annotationState === "processing" ? (
              <p className="annotation-note">
                {t("sheet.scanNote")}
              </p>
            ) : null}
            {annotationState === "failed" ? (
              <p className="annotation-note annotation-note-error">
                {t("sheet.scanFailed")}
              </p>
            ) : null}
          </section>

          {annotationState === "ready" && annotationsVisible ? (
            <section>
              <h2>{t("sheet.annotationStyle")}</h2>
              <AnnotationStyleControls
                onChange={(next) => void handleStyleChange(next)}
                style={labelStyle}
              />
            </section>
          ) : null}

          <section>
            <h2>{t("sheet.piano")}</h2>
            <div className="annotation-actions">
              <Button onClick={onOpenInPiano} type="button" variant="outline">
                <Piano aria-hidden="true" />
                {t("sheet.openInPiano")}
              </Button>
            </div>
          </section>
        </aside>
        ) : null}
      </div>
    </section>
  );
}
