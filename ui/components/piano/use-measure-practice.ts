"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { pianoContext, playPianoNote, preparePianoNotes } from "./play-note";
import type { LinkedMeasure, LinkedNote } from "./score-link";

// Steps are played evenly: printed PDFs carry no note lengths.
const STEP_SECONDS = 0.65;
// Room before the first note, so it is not clipped while the page catches up.
const LEAD_IN_SECONDS = 0.1;

type Selection = { measureId: string; noteId: string | null };

function uniqueMidis(notes: LinkedNote[]) {
  return [...new Set(notes.map((note) => note.midi))];
}

/** The point of the audio clock coming out of the speakers right now. */
function heardTime(context: AudioContext) {
  const { contextTime, performanceTime } = context.getOutputTimestamp();
  if (contextTime === undefined || performanceTime === undefined) {
    return context.currentTime;
  }
  return contextTime + (performance.now() - performanceTime) / 1000;
}

/**
 * Which measure of the score is lit on the piano, and plays it step by step.
 * `onReveal` asks for keys to be brought into view: a newly picked measure's,
 * then each step's as it plays.
 */
export function useMeasurePractice(
  measures: LinkedMeasure[],
  onReveal: (notes: LinkedNote[]) => void,
) {
  const [selection, setSelection] = useState<Selection | null>(null);
  // -1 while the first note is still on its way.
  const [playingStep, setPlayingStep] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  const sounds = useRef<AudioBufferSourceNode[]>([]);

  const notesById = useMemo(() => {
    const byId = new Map<string, { measureIndex: number; note: LinkedNote }>();
    measures.forEach((measure, measureIndex) => {
      for (const note of measure.steps.flat()) byId.set(note.id, { measureIndex, note });
    });
    return byId;
  }, [measures]);

  const index = selection
    ? measures.findIndex((measure) => measure.id === selection.measureId)
    : -1;
  const measure = index >= 0 ? measures[index] : null;

  function silence() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    for (const sound of sounds.current) sound.stop();
    sounds.current = [];
  }

  function stop() {
    silence();
    setPlayingStep(null);
  }

  useEffect(() => silence, []);

  function selectNote(id: string) {
    const found = notesById.get(id);
    if (!found) return;
    stop();
    const next = measures[found.measureIndex];
    setSelection({ measureId: next.id, noteId: id });
    playPianoNote(found.note.midi);
    if (next.id !== measure?.id) onReveal(next.steps.flat());
    // A measure wider than the keyboard may still leave the clicked key out.
    onReveal([found.note]);
  }

  function step(offset: -1 | 1) {
    const next = measures[index + offset];
    if (!next) return;
    stop();
    setSelection({ measureId: next.id, noteId: null });
    onReveal(next.steps.flat());
  }

  /**
   * Schedules the whole measure on the audio clock, then lights each step
   * when it is heard. The page drawing late never pushes the sound later.
   */
  function play() {
    const context = pianoContext();
    if (!measure || !context) return;
    stop();
    const { steps } = measure;
    preparePianoNotes(steps.flat().map((note) => note.midi));
    const start = context.currentTime + LEAD_IN_SECONDS;
    sounds.current = steps.flatMap((notes, index) =>
      uniqueMidis(notes).flatMap((midi) => {
        const sound = playPianoNote(midi, start + index * STEP_SECONDS);
        return sound ? [sound] : [];
      }),
    );

    let shown = -1;
    setPlayingStep(-1);
    // Wakes when the next step is due to be heard, by the audio clock.
    const follow = () => {
      const elapsed = heardTime(context) - start;
      const current = Math.floor(elapsed / STEP_SECONDS);
      if (current >= steps.length) {
        timer.current = null;
        sounds.current = [];
        setPlayingStep(null);
        return;
      }
      if (current > shown) {
        shown = current;
        setPlayingStep(current);
        onReveal(steps[current]);
      }
      const untilNext = (Math.max(current + 1, 0) * STEP_SECONDS - elapsed) * 1000;
      timer.current = window.setTimeout(follow, Math.max(untilNext, 0));
    };
    follow();
  }

  function clear() {
    stop();
    setSelection(null);
  }

  const playing = playingStep !== null;
  const focusNotes: LinkedNote[] = !measure
    ? []
    : playing
      ? (measure.steps[playingStep] ?? [])
      : selection?.noteId
        ? [notesById.get(selection.noteId)?.note].filter(
            (note): note is LinkedNote => Boolean(note),
          )
        : [];

  return {
    measure,
    hasPrevious: index > 0,
    hasNext: index >= 0 && index < measures.length - 1,
    playing,
    focusNotes,
    noteById: (id: string) => notesById.get(id)?.note,
    selectNote,
    step,
    togglePlay: () => (playing ? stop() : play()),
    clear,
  };
}
