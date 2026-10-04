"use client";

import { ChevronLeft, ChevronRight, Play, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/components/settings/settings-provider";
import type { Sheet } from "@/lib/library/model";
import { Keyboard, type KeyMark } from "./keyboard";
import { LinkedScore } from "./linked-score";
import {
  FIRST_MIDI,
  MIDDLE_WHITE_INDEX,
  PIANO_KEYS,
  clampWindow,
  inWindow,
} from "./piano-keys";
import { playPianoNote } from "./play-note";
import type { Hand, LinkedMeasure, LinkedNote, ScoreLink } from "./score-link";
import { SheetPicker } from "./sheet-picker";
import { useMeasurePractice } from "./use-measure-practice";

// With a sheet open, each hand gets a keyboard of two octaves.
const HAND_WHITE_KEYS = 14;
// Measures longer than this light their keys without numbering them.
const MAX_NUMBERED_STEPS = 12;

function useVisibleWhiteKeys(compact: boolean) {
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 48rem)");
    const update = () => setIsNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return compact || isNarrow ? HAND_WHITE_KEYS : 21;
}

/** Each key the hand plays in the measure, with its steps counted from 1. */
function keyMarks(measure: LinkedMeasure | null, hand: Hand) {
  const marks = new Map<number, KeyMark>();
  const numbered = (measure?.steps.length ?? 0) <= MAX_NUMBERED_STEPS;
  measure?.steps.forEach((step, index) => {
    for (const note of step) {
      if (note.hand !== hand) continue;
      const mark = marks.get(note.midi) ?? { hand, steps: [] };
      if (numbered && !mark.steps.includes(index + 1)) mark.steps.push(index + 1);
      marks.set(note.midi, mark);
    }
  });
  return marks;
}

/** Slides a window of white keys so these keys are in view, if they are not. */
function windowShowing(notes: LinkedNote[], start: number, visibleCount: number) {
  const keys = notes.map((note) => PIANO_KEYS[note.midi - FIRST_MIDI]).filter(Boolean);
  if (keys.length === 0) return start;
  const current = clampWindow(start, visibleCount);
  if (keys.every((key) => inWindow(key, current, visibleCount))) return start;
  const low = Math.min(...keys.map((key) => key.whiteIndex));
  const high = Math.max(
    ...keys.map((key) => (key.isBlack ? key.whiteIndex + 1 : key.whiteIndex)),
  );
  return clampWindow(Math.round((low + high + 1 - visibleCount) / 2), visibleCount);
}

type PianoViewProps = {
  sheet?: Sheet | null;
  sheets: Sheet[];
  onOpenSheet: (sheet: Sheet) => void;
};

export function PianoView({ sheet, sheets, onOpenSheet }: PianoViewProps) {
  const { t } = useSettings();
  const visibleCount = useVisibleWhiteKeys(Boolean(sheet));
  const [selectedMidi, setSelectedMidi] = useState(60);
  // The right hand's window is also the only one when no sheet is open.
  const [rightStart, setRightStart] = useState(() =>
    clampWindow(sheet ? MIDDLE_WHITE_INDEX : MIDDLE_WHITE_INDEX - 10, 21),
  );
  const [leftStart, setLeftStart] = useState(MIDDLE_WHITE_INDEX - HAND_WHITE_KEYS);
  // Null until the score says which measures it links, so hints do not flash.
  const [measures, setMeasures] = useState<LinkedMeasure[] | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [seenSheetId, setSeenSheetId] = useState(sheet?.id);
  const practice = useMeasurePractice(measures ?? [], revealKeys);
  const previewNote = previewId ? practice.noteById(previewId) : undefined;
  const selectedKey = PIANO_KEYS[selectedMidi - FIRST_MIDI];

  if (sheet?.id !== seenSheetId) {
    setSeenSheetId(sheet?.id);
    setMeasures(null);
    setPreviewId(null);
    setRightStart(MIDDLE_WHITE_INDEX);
    setLeftStart(MIDDLE_WHITE_INDEX - HAND_WHITE_KEYS);
    practice.clear();
  }

  const link: ScoreLink = {
    selection: {
      measureId: practice.measure?.id ?? null,
      focusIds: practice.focusNotes.map((note) => note.id),
      previewId,
    },
    onMeasures: setMeasures,
    onNoteClick: practice.selectNote,
    onNoteHover: setPreviewId,
  };

  useEffect(() => {
    if (!practice.measure) return;
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "ArrowLeft") practice.step(-1);
      else if (event.key === "ArrowRight") practice.step(1);
      else if (event.key === "Escape") practice.clear();
      // A focused button presses itself on space.
      else if (event.key === " " && !target?.closest("button")) practice.togglePlay();
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [practice]);

  /** Brings each hand's keys into view on that hand's keyboard. */
  function revealKeys(notes: LinkedNote[]) {
    const right = notes.filter((note) => note.hand === "right");
    const left = notes.filter((note) => note.hand === "left");
    // Playback calls this from a timer, so it works from the latest windows.
    if (right.length > 0) {
      setRightStart((start) => windowShowing(right, start, HAND_WHITE_KEYS));
    }
    if (left.length > 0) {
      setLeftStart((start) => windowShowing(left, start, HAND_WHITE_KEYS));
    }
  }

  function pressKey(midi: number) {
    setSelectedMidi(midi);
    playPianoNote(midi);
  }

  function keyboardFor(hand: Hand) {
    const focusMidis = new Set(
      practice.focusNotes.filter((note) => note.hand === hand).map((note) => note.midi),
    );
    return (
      <Keyboard
        focusMidis={focusMidis}
        hand={sheet ? hand : undefined}
        marks={keyMarks(practice.measure, hand)}
        onPress={pressKey}
        onStartChange={hand === "left" ? setLeftStart : setRightStart}
        previewMidi={previewNote?.hand === hand ? previewNote.midi : undefined}
        // A lit measure takes over from the key picked by hand.
        selectedMidi={practice.measure ? null : selectedMidi}
        start={hand === "left" ? leftStart : rightStart}
        visibleCount={visibleCount}
      />
    );
  }

  const windows = sheet ? [rightStart, leftStart] : [rightStart];
  const allMarks = new Map([
    ...keyMarks(practice.measure, "left"),
    ...keyMarks(practice.measure, "right"),
  ]);

  return (
    <section
      className={sheet ? "piano-view piano-view-with-sheet" : "piano-view"}
    >
      {sheet ? (
        <aside className="piano-sheet" aria-label={t("piano.sheetMusic", { title: sheet.title })}>
          <div className="piano-sheet-canvas">
            <LinkedScore link={link} sheet={sheet} />
          </div>
        </aside>
      ) : null}
      <div className="piano-stage">
        {sheet ? null : (
          <div className="selected-note">
            <SheetPicker onOpenSheet={onOpenSheet} sheets={sheets} />
            <div className="selected-note-readout">
              <span>{t("piano.selectedNote")}</span>
              <strong aria-live="polite">{selectedKey.label}</strong>
            </div>
          </div>
        )}

        {sheet ? (
          <div className="measure-bar">
            {practice.measure ? (
              <>
                <div className="measure-nav">
                  <Button
                    aria-label={t("piano.previousMeasure")}
                    disabled={!practice.hasPrevious}
                    onClick={() => practice.step(-1)}
                    size="icon-sm"
                    variant="outline"
                  >
                    <ChevronLeft aria-hidden="true" />
                  </Button>
                  <strong aria-live="polite">
                    {t("piano.measure", { number: practice.measure.number })}
                  </strong>
                  <Button
                    aria-label={t("piano.nextMeasure")}
                    disabled={!practice.hasNext}
                    onClick={() => practice.step(1)}
                    size="icon-sm"
                    variant="outline"
                  >
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </div>
                <Button
                  aria-pressed={practice.playing}
                  onClick={practice.togglePlay}
                  size="sm"
                >
                  {practice.playing ? (
                    <Square aria-hidden="true" />
                  ) : (
                    <Play aria-hidden="true" />
                  )}
                  {practice.playing ? t("piano.stop") : t("piano.playMeasure")}
                </Button>
                <Button
                  aria-label={t("piano.clearMeasure")}
                  className="measure-clear"
                  onClick={practice.clear}
                  size="icon-sm"
                  variant="ghost"
                >
                  <X aria-hidden="true" />
                </Button>
              </>
            ) : measures === null ? null : (
              <p>
                {measures.length > 0
                  ? t("piano.clickNoteHint")
                  : t("piano.noLinkedNotes")}
              </p>
            )}
          </div>
        ) : null}

        <div className="keyboard-frame">
          {keyboardFor("right")}
          {sheet ? keyboardFor("left") : null}
        </div>

        <div className="keyboard-overview">
          <div className="overview-heading">
            <span>{t("piano.fullKeyboard")}</span>
            <span>
              {PIANO_KEYS[0].label}–{PIANO_KEYS[PIANO_KEYS.length - 1].label}
            </span>
          </div>
          <div aria-hidden="true" className="overview-track">
            {PIANO_KEYS.map((key) => (
              <span
                className={key.isBlack ? "overview-black" : "overview-white"}
                data-hand={allMarks.get(key.midi)?.hand}
                data-selected={!practice.measure && key.midi === selectedMidi}
                data-visible={windows.some((start) =>
                  inWindow(key, clampWindow(start, visibleCount), visibleCount),
                )}
                key={key.midi}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
