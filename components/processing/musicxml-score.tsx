"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  GraphicalNote,
  OpenSheetMusicDisplay,
  VexFlowGraphicalNote,
} from "opensheetmusicdisplay";
import { solfegeName } from "@/lib/processing/solfege";

const SVG_NS = "http://www.w3.org/2000/svg";
const LABEL_LAYER_CLASS = "solfege-labels";
// Extra horizontal room so labels beside a note do not run into the next one.
const ANNOTATED_SPACING_FACTOR = 1.8;

type MusicXmlScoreProps = {
  fileUrl: string;
  title: string;
  zoom: number;
  annotationsVisible: boolean;
  generating?: boolean;
};

type LoadState = "loading" | "ready" | "error";

function isTieContinuation(note: GraphicalNote) {
  const tie = note.sourceNote.NoteTie;
  return Boolean(tie && tie.StartNote !== note.sourceNote);
}

function labelFor(note: GraphicalNote) {
  const source = note.sourceNote;
  if (source.isRest() || !source.Pitch || !source.PrintObject) return null;
  if (isTieContinuation(note)) return null;
  return solfegeName(
    source.Pitch.FundamentalNote,
    source.Pitch.AccidentalHalfTones,
  );
}

function noteheadOf(note: VexFlowGraphicalNote) {
  const heads = note.getNoteheadSVGs();
  const head = heads[note.vfnoteIndex] ?? heads[0];
  return head as unknown as SVGGraphicsElement | undefined;
}

function layerFor(svg: SVGSVGElement, layers: Map<SVGSVGElement, SVGGElement>) {
  let layer = layers.get(svg);
  if (!layer) {
    layer = document.createElementNS(SVG_NS, "g");
    layer.setAttribute("class", LABEL_LAYER_CLASS);
    layer.setAttribute("aria-hidden", "true");
    svg.appendChild(layer);
    layers.set(svg, layer);
  }
  return layer;
}

function drawSolfegeLabels(osmd: OpenSheetMusicDisplay) {
  const layers = new Map<SVGSVGElement, SVGGElement>();

  for (const measuresOfStaves of osmd.GraphicSheet.MeasureList) {
    for (const measure of measuresOfStaves) {
      if (!measure) continue;
      for (const staffEntry of measure.staffEntries) {
        for (const voiceEntry of staffEntry.graphicalVoiceEntries) {
          for (const note of voiceEntry.notes) {
            const label = labelFor(note);
            if (!label) continue;

            const head = noteheadOf(note as VexFlowGraphicalNote);
            const svg = head?.ownerSVGElement;
            if (!head || !svg) continue;

            const box = head.getBBox();
            const text = document.createElementNS(SVG_NS, "text");
            text.setAttribute("x", String(box.x + box.width + 2));
            text.setAttribute("y", String(box.y + box.height / 2));
            text.setAttribute("class", "solfege-label");
            text.textContent = label;
            layerFor(svg, layers).appendChild(text);
          }
        }
      }
    }
  }
}

function paint(
  osmd: OpenSheetMusicDisplay,
  plainSpacing: number,
  { zoom, annotationsVisible }: { zoom: number; annotationsVisible: boolean },
) {
  osmd.zoom = zoom;
  osmd.EngravingRules.VoiceSpacingMultiplierVexflow = annotationsVisible
    ? plainSpacing * ANNOTATED_SPACING_FACTOR
    : plainSpacing;
  osmd.render();
  if (annotationsVisible) drawSolfegeLabels(osmd);
}

export function MusicXmlScore({
  fileUrl,
  title,
  zoom,
  annotationsVisible,
  generating = false,
}: MusicXmlScoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const plainSpacingRef = useRef(1);
  const settingsRef = useRef({ zoom, annotationsVisible });
  const [loaded, setLoaded] = useState<{ url: string; failed: boolean }>();
  const loadState: LoadState =
    loaded?.url !== fileUrl ? "loading" : loaded.failed ? "error" : "ready";

  useEffect(() => {
    settingsRef.current = { zoom, annotationsVisible };
  }, [zoom, annotationsVisible]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    async function load(target: HTMLDivElement) {
      try {
        const [{ OpenSheetMusicDisplay }, response] = await Promise.all([
          import("opensheetmusicdisplay"),
          fetch(fileUrl),
        ]);
        if (!response.ok) throw new Error("Could not fetch the score.");
        const file = await response.blob();
        if (cancelled) return;

        target.replaceChildren();
        const osmd = new OpenSheetMusicDisplay(target, {
          autoResize: false,
          backend: "svg",
          drawTitle: true,
        });
        await osmd.load(file, title);
        if (cancelled) return;
        plainSpacingRef.current =
          osmd.EngravingRules.VoiceSpacingMultiplierVexflow;
        paint(osmd, plainSpacingRef.current, settingsRef.current);
        osmdRef.current = osmd;
        setLoaded({ url: fileUrl, failed: false });
      } catch {
        if (cancelled) return;
        target.replaceChildren();
        setLoaded({ url: fileUrl, failed: true });
      }
    }

    void load(container);
    return () => {
      cancelled = true;
      osmdRef.current = null;
    };
  }, [fileUrl, title]);

  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd) return;
    try {
      paint(osmd, plainSpacingRef.current, { zoom, annotationsVisible });
    } catch (error) {
      console.error("Could not redraw the score.", error);
    }
  }, [zoom, annotationsVisible]);

  return (
    <div className="score-file score-musicxml">
      {loadState === "loading" ? (
        <p className="score-musicxml-status">Loading score…</p>
      ) : null}
      {loadState === "error" ? (
        <p className="score-musicxml-status">
          This MusicXML file could not be displayed.
        </p>
      ) : null}
      <div aria-label={title} ref={containerRef} role="img" />
      {generating && loadState === "ready" ? (
        <div className="score-generating" role="status">
          <span className="score-generating-badge">
            <LoaderCircle aria-hidden="true" className="animate-spin" />
            Finding note names…
          </span>
        </div>
      ) : null}
    </div>
  );
}
