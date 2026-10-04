"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { MusicXmlScore } from "@/components/processing/musicxml-score";
import { useSettings } from "@/components/settings/settings-provider";
import type { Sheet } from "@/lib/library/model";
import {
  defaultAnnotationStyle,
  parseAnnotationStyle,
  type AnnotationStyle,
} from "@/lib/processing/annotation-style";
import type { PdfNoteRecord } from "@/lib/processing/repository";
import type { ScoreLink } from "./score-link";

// pdf.js only runs in the browser.
const PdfScore = dynamic(
  () => import("@/components/processing/pdf-score").then((module) => module.PdfScore),
  { ssr: false },
);

// The score shares the screen with the keyboard, so it is drawn a little smaller.
const PANEL_ZOOM = 0.8;

type Annotations = {
  sheetId: number;
  ready: boolean;
  style: AnnotationStyle;
  notes: PdfNoteRecord[];
};

async function loadAnnotations(sheet: Sheet): Promise<Annotations> {
  const response = await fetch(`/api/annotations?sheetId=${sheet.id}`);
  const payload = (await response.json()) as { status?: string; style?: unknown };
  const ready = response.ok && payload.status === "ready";
  let notes: PdfNoteRecord[] = [];
  if (ready && sheet.fileType === "pdf") {
    const notesResponse = await fetch(`/api/annotations/notes?sheetId=${sheet.id}`);
    if (notesResponse.ok) {
      notes = ((await notesResponse.json()) as { notes?: PdfNoteRecord[] }).notes ?? [];
    }
  }
  return { sheetId: sheet.id, ready, style: parseAnnotationStyle(payload.style), notes };
}

type LinkedScoreProps = {
  sheet: Sheet;
  link: ScoreLink;
};

/** The sheet with its saved note names, linked to the piano. */
export function LinkedScore({ sheet, link }: LinkedScoreProps) {
  const { t } = useSettings();
  const [annotations, setAnnotations] = useState<Annotations>();
  const current = annotations?.sheetId === sheet.id ? annotations : undefined;
  const fileUrl = `/api/sheets/${sheet.id}/file`;
  const title = t("score.label", { title: sheet.title });

  useEffect(() => {
    let cancelled = false;
    loadAnnotations(sheet)
      .catch(
        (): Annotations => ({
          sheetId: sheet.id,
          ready: false,
          style: defaultAnnotationStyle,
          notes: [],
        }),
      )
      .then((loaded) => {
        if (!cancelled) setAnnotations(loaded);
      });
    return () => {
      cancelled = true;
    };
  }, [sheet]);

  if (!current) {
    return <p className="score-musicxml-status">{t("score.loading")}</p>;
  }

  return sheet.fileType === "pdf" ? (
    <PdfScore
      annotationsVisible={current.ready}
      fileUrl={fileUrl}
      labelStyle={current.style}
      link={link}
      notes={current.notes}
      title={title}
    />
  ) : (
    <MusicXmlScore
      annotationsVisible={current.ready}
      fileUrl={fileUrl}
      labelStyle={current.style}
      link={link}
      title={title}
      zoom={PANEL_ZOOM}
    />
  );
}
