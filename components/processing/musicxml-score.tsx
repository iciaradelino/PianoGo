"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  GraphicalMeasure,
  GraphicalNote,
  OpenSheetMusicDisplay,
  VexFlowGraphicalNote,
  VexFlowMeasure,
} from "opensheetmusicdisplay";
import {
  labelColorValues,
  labelFontSizes,
  type AnnotationStyle,
  type LabelSize,
} from "@/lib/processing/annotation-style";
import { noteName } from "@/lib/processing/solfege";
import { useSettings } from "@/components/settings/settings-provider";

const SVG_NS = "http://www.w3.org/2000/svg";
const LABEL_LAYER_CLASS = "solfege-labels";
// OSMD counts octaves from 0 at MusicXML octave 3; scientific pitch puts middle C in 4.
const OSMD_OCTAVE_OFFSET = 3;
// Extra horizontal room so labels do not run into the next note.
const SPACING_FACTORS: Record<LabelSize, number> = {
  small: 1.5,
  medium: 1.8,
  large: 2.3,
};
const OCTAVE_SPACING_BONUS = 0.3;
// Labels below the staff are centred under the note, so they need less room.
const BELOW_SPACING_SCALE = 0.85;
// Room reserved under each staff for this many stacked labels (a triad).
const BELOW_ROWS = 3;
const LINE_HEIGHT = 1.2;
const BELOW_GAP = 6;
// Space between the two pages of a spread; matches .score-musicxml-spread.
const SPREAD_GAP_PX = 20;

type MusicXmlScoreProps = {
  fileUrl: string;
  title: string;
  zoom: number;
  annotationsVisible: boolean;
  labelStyle: AnnotationStyle;
  generating?: boolean;
  /** Shows the score as pages, two side by side. */
  spread?: boolean;
};

type LoadState = "loading" | "ready" | "error";

type BaseRules = {
  voiceSpacing: number;
  staffGap: number;
  systemGap: number;
};

type Label = {
  text: string;
  pitch: number;
  head: SVGGraphicsElement;
  note: VexFlowGraphicalNote;
};

function isTieContinuation(note: GraphicalNote) {
  const tie = note.sourceNote.NoteTie;
  return Boolean(tie && tie.StartNote !== note.sourceNote);
}

function noteheadOf(note: VexFlowGraphicalNote) {
  const heads = note.getNoteheadSVGs();
  const head = heads[note.vfnoteIndex] ?? heads[0];
  return head as unknown as SVGGraphicsElement | undefined;
}

function labelFor(note: GraphicalNote, style: AnnotationStyle): Label | null {
  const source = note.sourceNote;
  const pitch = source.Pitch;
  if (source.isRest() || !pitch || !source.PrintObject) return null;
  if (isTieContinuation(note)) return null;

  const octave = pitch.Octave + OSMD_OCTAVE_OFFSET;
  const text = noteName(
    pitch.FundamentalNote,
    pitch.AccidentalHalfTones,
    octave,
    style,
  );
  const head = noteheadOf(note as VexFlowGraphicalNote);
  if (!text || !head?.ownerSVGElement) return null;

  return {
    text,
    pitch: octave * 12 + pitch.FundamentalNote + pitch.AccidentalHalfTones,
    head,
    note: note as VexFlowGraphicalNote,
  };
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

function createText(
  label: string,
  x: number,
  y: number,
  style: AnnotationStyle,
) {
  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("x", String(x));
  text.setAttribute("y", String(y));
  text.setAttribute("class", "solfege-label");
  text.setAttribute("fill", labelColorValues[style.color]);
  text.setAttribute("font-size", String(labelFontSizes[style.size]));
  text.textContent = label;
  return text;
}

function measureLabels(measure: GraphicalMeasure, style: AnnotationStyle) {
  return measure.staffEntries.map((staffEntry) =>
    staffEntry.graphicalVoiceEntries
      .flatMap((voiceEntry) => voiceEntry.notes)
      .map((note) => labelFor(note, style))
      .filter((label): label is Label => label !== null),
  );
}

function drawBeside(labels: Label[], style: AnnotationStyle, layers: Map<SVGSVGElement, SVGGElement>) {
  for (const label of labels) {
    const box = label.head.getBBox();
    const text = createText(
      label.text,
      box.x + box.width + 2,
      box.y + box.height / 2,
      style,
    );
    text.setAttribute("dominant-baseline", "central");
    layerFor(label.head.ownerSVGElement!, layers).appendChild(text);
  }
}

/** Stacks each chord's names under the staff, highest note on top. */
function drawBelow(
  measure: GraphicalMeasure,
  entries: Label[][],
  style: AnnotationStyle,
  layers: Map<SVGSVGElement, SVGGElement>,
) {
  const fontSize = labelFontSizes[style.size];
  const stave = (measure as VexFlowMeasure).getVFStave?.();
  let top = stave ? stave.getYForLine(4) : -Infinity;

  // One row for the whole measure, below its lowest stem, beam or ledger note.
  for (const entry of entries) {
    for (const label of entry) {
      const group = label.note.getSVGGElement() as SVGGraphicsElement | null;
      const box = (group ?? label.head).getBBox();
      top = Math.max(top, box.y + box.height);
    }
  }
  if (!Number.isFinite(top)) return;
  const firstBaseline = top + BELOW_GAP + fontSize;

  for (const entry of entries) {
    if (entry.length === 0) continue;
    const ordered = [...entry].sort((a, b) => b.pitch - a.pitch);
    const boxes = ordered.map((label) => label.head.getBBox());
    const x = Math.min(...boxes.map((box) => box.x + box.width / 2));
    ordered.forEach((label, index) => {
      const text = createText(
        label.text,
        x,
        firstBaseline + index * fontSize * LINE_HEIGHT,
        style,
      );
      text.setAttribute("text-anchor", "middle");
      layerFor(label.head.ownerSVGElement!, layers).appendChild(text);
    });
  }
}

function drawLabels(osmd: OpenSheetMusicDisplay, style: AnnotationStyle) {
  const layers = new Map<SVGSVGElement, SVGGElement>();

  for (const measuresOfStaves of osmd.GraphicSheet.MeasureList) {
    for (const measure of measuresOfStaves) {
      if (!measure) continue;
      const entries = measureLabels(measure, style);
      if (style.position === "below") {
        drawBelow(measure, entries, style, layers);
      } else {
        drawBeside(entries.flat(), style, layers);
      }
    }
  }
}

function applyLayoutRules(
  osmd: OpenSheetMusicDisplay,
  base: BaseRules,
  style: AnnotationStyle | null,
) {
  const rules = osmd.EngravingRules;
  if (!style) {
    rules.VoiceSpacingMultiplierVexflow = base.voiceSpacing;
    rules.MinSkyBottomDistBetweenStaves = base.staffGap;
    rules.MinSkyBottomDistBetweenSystems = base.systemGap;
    return;
  }

  let factor =
    SPACING_FACTORS[style.size] + (style.showOctave ? OCTAVE_SPACING_BONUS : 0);
  let extraGap = 0;
  if (style.position === "below") {
    factor *= BELOW_SPACING_SCALE;
    // Score units are a tenth of the SVG units the labels are drawn in.
    extraGap =
      (BELOW_GAP + BELOW_ROWS * labelFontSizes[style.size] * LINE_HEIGHT) / 10;
  }
  rules.VoiceSpacingMultiplierVexflow = base.voiceSpacing * factor;
  rules.MinSkyBottomDistBetweenStaves = base.staffGap + extraGap;
  rules.MinSkyBottomDistBetweenSystems = base.systemGap + extraGap;
}

type PaintSettings = {
  zoom: number;
  labelStyle: AnnotationStyle | null;
  spread: boolean;
};

/**
 * Draws the score. In a spread it is cut into A4 pages, drawn at half the
 * width so that two fit side by side; otherwise it is one endless page.
 */
function paint(
  osmd: OpenSheetMusicDisplay,
  container: HTMLDivElement,
  base: BaseRules,
  settings: PaintSettings,
) {
  osmd.zoom = settings.zoom;
  osmd.setPageFormat(settings.spread ? "A4_P" : "Endless");
  applyLayoutRules(osmd, base, settings.labelStyle);
  if (settings.spread) {
    // OSMD sizes each page to its container, so it is narrowed while drawing.
    const width = container.parentElement?.clientWidth ?? container.clientWidth;
    container.style.width = `${Math.floor((width - SPREAD_GAP_PX) / 2)}px`;
  }
  try {
    osmd.render();
  } finally {
    container.style.width = "";
  }
  if (settings.labelStyle) drawLabels(osmd, settings.labelStyle);
}

export function MusicXmlScore({
  fileUrl,
  title,
  zoom,
  annotationsVisible,
  labelStyle,
  generating = false,
  spread = false,
}: MusicXmlScoreProps) {
  const { t } = useSettings();
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const baseRulesRef = useRef<BaseRules>({
    voiceSpacing: 1,
    staffGap: 0,
    systemGap: 0,
  });
  const visibleStyle = annotationsVisible ? labelStyle : null;
  const settingsRef = useRef<PaintSettings>({
    zoom,
    labelStyle: visibleStyle,
    spread,
  });
  const [loaded, setLoaded] = useState<{ url: string; failed: boolean }>();
  const loadState: LoadState =
    loaded?.url !== fileUrl ? "loading" : loaded.failed ? "error" : "ready";

  useEffect(() => {
    settingsRef.current = { zoom, labelStyle: visibleStyle, spread };
  }, [zoom, visibleStyle, spread]);

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
        const rules = osmd.EngravingRules;
        baseRulesRef.current = {
          voiceSpacing: rules.VoiceSpacingMultiplierVexflow,
          staffGap: rules.MinSkyBottomDistBetweenStaves,
          systemGap: rules.MinSkyBottomDistBetweenSystems,
        };
        paint(osmd, target, baseRulesRef.current, settingsRef.current);
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
    const container = containerRef.current;
    if (!osmd || !container) return;
    try {
      paint(osmd, container, baseRulesRef.current, {
        zoom,
        labelStyle: visibleStyle,
        spread,
      });
    } catch (error) {
      console.error("Could not redraw the score.", error);
    }
  }, [zoom, visibleStyle, spread]);

  return (
    <div
      className={
        spread ? "score-file score-musicxml score-musicxml-spread" : "score-file score-musicxml"
      }
    >
      {loadState === "loading" ? (
        <p className="score-musicxml-status">{t("score.loading")}</p>
      ) : null}
      {loadState === "error" ? (
        <p className="score-musicxml-status">
          {t("score.musicXmlFailed")}
        </p>
      ) : null}
      <div aria-label={title} ref={containerRef} role="img" />
      {generating && loadState === "ready" ? (
        <div className="score-generating" role="status">
          <span className="score-generating-badge">
            <LoaderCircle aria-hidden="true" className="animate-spin" />
            {t("score.findingNotes")}
          </span>
        </div>
      ) : null}
    </div>
  );
}
