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
} from "lucide-react";
import { useState } from "react";
import type { Sheet } from "@/lib/library/model";
import { Button } from "@/components/ui/button";
import { SheetScoreViewer } from "./sheet-score-viewer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type SheetDetailViewProps = {
  sheet: Sheet;
  onBack: () => void;
  onOpenInPiano: () => void;
};

export function SheetDetailView({
  sheet,
  onBack,
  onOpenInPiano,
}: SheetDetailViewProps) {
  const [annotationsVisible, setAnnotationsVisible] = useState(true);

  return (
    <section className="sheet-detail">
      <div className="sheet-detail-body">
        <div className="score-viewer">
          <div className="score-toolbar">
            <span className="score-page-count">{sheet.originalFilename}</span>
            <div className="zoom-controls">
              <Button aria-label="Zoom out" size="icon-sm" variant="ghost">
                <Minus aria-hidden="true" />
              </Button>
              <span>100%</span>
              <Button aria-label="Zoom in" size="icon-sm" variant="ghost">
                <Plus aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="score-canvas">
            <SheetScoreViewer sheet={sheet} />
          </div>
        </div>

        <aside className="sheet-inspector">
          <section className="sheet-summary">
            <div className="sheet-title-group">
              <Button
                aria-label="Back to library"
                onClick={onBack}
                size="icon"
                variant="ghost"
              >
                <ArrowLeft aria-hidden="true" />
              </Button>
              <div>
                <h1>{sheet.title}</h1>
                <p>{sheet.composer}</p>
              </div>
            </div>

            <div className="sheet-actions">
              <Button size="sm" variant="outline">
                <Pencil aria-hidden="true" />
                Rename
              </Button>
              <Button asChild aria-label="Download sheet" size="icon" variant="outline">
                <a download href={`/api/sheets/${sheet.id}/file`}>
                  <Download aria-hidden="true" />
                </a>
              </Button>
              <Button aria-label="Print sheet" size="icon" variant="outline">
                <Printer aria-hidden="true" />
              </Button>
            </div>
          </section>

          <section>
            <h2>Properties</h2>
            <div className="sheet-field">
              <span>Difficulty</span>
              <Select defaultValue={sheet.difficulty}>
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
              <Select defaultValue={sheet.status}>
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
              <Button variant="outline">
                <Sparkles aria-hidden="true" />
                Generate annotations
              </Button>
              <Button variant="outline">
                <MousePointerClick aria-hidden="true" />
                Add manually
              </Button>
            </div>
          </section>

          <section>
            <h2>Piano</h2>
            <div className="annotation-actions">
              <Button onClick={onOpenInPiano} variant="outline">
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
