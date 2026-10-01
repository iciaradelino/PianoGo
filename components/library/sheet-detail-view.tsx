"use client";

import {
  ArrowLeft,
  Download,
  Minus,
  MousePointerClick,
  Pencil,
  Piano,
  Plus,
  Printer,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
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

const zoomSteps = [0.75, 1, 1.25, 1.5];

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
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [seenId, setSeenId] = useState(sheet.id);
  const [annotationsVisible, setAnnotationsVisible] = useState(true);
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
    const frameWindow = frameRef.current?.contentWindow;
    if (frameWindow) {
      frameWindow.focus();
      frameWindow.print();
      return;
    }
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
              className="score-zoom"
              style={{ "--score-zoom": zoom } as React.CSSProperties}
            >
              {sheet.fileType === "pdf" ? (
                <iframe
                  className="score-file"
                  ref={frameRef}
                  src={fileUrl}
                  title={sheet.title}
                />
              ) : (
                <div className="score-file score-file-note">
                  <p>{sheet.title} is saved.</p>
                  <p>Score preview is available for PDF files.</p>
                </div>
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
                  checked={annotationsVisible}
                  onCheckedChange={setAnnotationsVisible}
                />
              </div>
            </div>
            <div className="annotation-actions">
              <Button type="button" variant="outline">
                <Sparkles aria-hidden="true" />
                Generate annotations
              </Button>
              <Button type="button" variant="outline">
                <MousePointerClick aria-hidden="true" />
                Add manually
              </Button>
            </div>
          </section>

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
