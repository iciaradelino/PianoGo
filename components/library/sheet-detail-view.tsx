"use client";

import {
  ArrowLeft,
  Download,
  Minus,
  MousePointerClick,
  Pencil,
  Plus,
  Printer,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import type { MockSheet } from "@/lib/library/mock-sheets";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type SheetDetailViewProps = {
  sheet: MockSheet;
  onBack: () => void;
};

export function SheetDetailView({ sheet, onBack }: SheetDetailViewProps) {
  const [annotationsVisible, setAnnotationsVisible] = useState(true);

  return (
    <section className="sheet-detail">
      <div className="sheet-detail-body">
        <div className="score-viewer">
          <div className="score-toolbar">
            <span className="score-page-count">Page 1 of 23</span>
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
            <Image
              alt={`First page of ${sheet.title}`}
              className="score-page"
              height={1263}
              src="/sheets/moonlight-sonata-page-1.png"
              width={893}
            />
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
              <Button aria-label="Download sheet" size="icon" variant="outline">
                <Download aria-hidden="true" />
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
        </aside>
      </div>
    </section>
  );
}
