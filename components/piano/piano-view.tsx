"use client";

import { ChevronLeft, ChevronRight, FileMusic } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SheetScoreViewer } from "@/components/library/sheet-score-viewer";
import { Button } from "@/components/ui/button";
import type { Sheet } from "@/lib/library/model";
import { playPianoNote } from "./play-note";

const NAMES = [
  "do",
  "do♯",
  "re",
  "re♯",
  "mi",
  "fa",
  "fa♯",
  "sol",
  "sol♯",
  "la",
  "la♯",
  "si",
] as const;
const BLACK_PITCHES = new Set([1, 3, 6, 8, 10]);
const FIRST_MIDI = 21;
const LAST_MIDI = 108;
const WHITE_KEYS_PER_OCTAVE = 7;

type PianoKey = {
  midi: number;
  name: (typeof NAMES)[number];
  label: string;
  octave: number;
  isBlack: boolean;
  whiteIndex: number;
};

function createPianoKeys(): PianoKey[] {
  let whiteIndex = 0;

  return Array.from({ length: LAST_MIDI - FIRST_MIDI + 1 }, (_, index) => {
    const midi = FIRST_MIDI + index;
    const pitchIndex = midi % 12;
    const name = NAMES[pitchIndex];
    const octave = Math.floor(midi / 12) - 1;
    const isBlack = BLACK_PITCHES.has(pitchIndex);
    const key = {
      midi,
      name,
      label: `${name}${octave}`,
      octave,
      isBlack,
      whiteIndex: isBlack ? whiteIndex - 1 : whiteIndex,
    };

    if (!isBlack) whiteIndex += 1;
    return key;
  });
}

const PIANO_KEYS = createPianoKeys();
const WHITE_KEYS = PIANO_KEYS.filter((key) => !key.isBlack);
const BLACK_KEYS = PIANO_KEYS.filter((key) => key.isBlack);
const MIDDLE_WHITE_INDEX = WHITE_KEYS.findIndex((key) => key.midi === 60);

function clampWindow(start: number, visibleCount: number) {
  return Math.min(
    Math.max(start, 0),
    WHITE_KEYS.length - visibleCount,
  );
}

function useVisibleWhiteKeys(compact: boolean) {
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 48rem)");
    const update = () => setIsNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return compact || isNarrow ? 14 : 21;
}

type PianoViewProps = {
  sheet?: Sheet | null;
  sheets: Sheet[];
  onOpenSheet: (sheet: Sheet) => void;
};

export function PianoView({ sheet, sheets, onOpenSheet }: PianoViewProps) {
  const visibleCount = useVisibleWhiteKeys(Boolean(sheet));
  const [selectedMidi, setSelectedMidi] = useState(60);
  const [windowStart, setWindowStart] = useState(() =>
    clampWindow(MIDDLE_WHITE_INDEX - 10, 21),
  );
  const [dragging, setDragging] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const drag = useRef({ id: -1, x: 0, origin: 0, moved: false });
  const selectedKey = PIANO_KEYS[selectedMidi - FIRST_MIDI];
  const visibleStart = clampWindow(windowStart, visibleCount);
  const maxStart = WHITE_KEYS.length - visibleCount;
  const visibleWhiteKeys = WHITE_KEYS.slice(
    visibleStart,
    visibleStart + visibleCount,
  );
  const visibleBlackKeys = BLACK_KEYS.filter(
    (key) =>
      key.whiteIndex >= visibleStart &&
      key.whiteIndex < visibleStart + visibleCount - 1,
  );

  function moveOctave(direction: -1 | 1) {
    setWindowStart(
      clampWindow(visibleStart + direction * WHITE_KEYS_PER_OCTAVE, visibleCount),
    );
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      origin: visibleStart,
      moved: false,
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerId !== drag.current.id) return;
    const delta = event.clientX - drag.current.x;
    if (Math.abs(delta) <= 6) return;

    drag.current.moved = true;
    if (!dragging) setDragging(true);
    const keyWidth = event.currentTarget.clientWidth / visibleCount;
    const shift = Math.round(-delta / keyWidth);
    setWindowStart(clampWindow(drag.current.origin + shift, visibleCount));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // a synthetic pointer cannot be captured, and the drag still tracks the move
    }
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerId !== drag.current.id) return;
    drag.current.id = -1;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function selectKey(midi: number) {
    if (drag.current.moved) {
      drag.current.moved = false;
      return;
    }
    setSelectedMidi(midi);
    playPianoNote(midi);
  }

  return (
    <section
      className={sheet ? "piano-view piano-view-with-sheet" : "piano-view"}
    >
      {sheet ? (
        <aside className="piano-sheet" aria-label={`${sheet.title} sheet music`}>
          <div className="piano-sheet-canvas">
            <SheetScoreViewer sheet={sheet} />
          </div>
        </aside>
      ) : null}
      <div className="piano-stage">
        <div className="selected-note">
          <Button
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((open) => !open)}
            size="sm"
            variant="outline"
          >
            <FileMusic aria-hidden="true" />
            Open sheet
          </Button>
          <div className="selected-note-readout">
            <span>Selected note</span>
            <strong aria-live="polite">{selectedKey.label}</strong>
          </div>
        </div>
        {pickerOpen ? (
          <div className="sheet-picker">
            {sheets.length > 0 ? (
              sheets.map((item) => (
                <button
                  aria-pressed={sheet?.id === item.id}
                  key={item.id}
                  onClick={() => {
                    onOpenSheet(item);
                    setPickerOpen(false);
                  }}
                  type="button"
                >
                  <span>{item.title}</span>
                  <span>{item.composer}</span>
                </button>
              ))
            ) : (
              <p>No sheets in the library yet.</p>
            )}
          </div>
        ) : null}

        <div className="keyboard-frame">
          <div className="keyboard-row">
            <Button
              aria-label="Octave down"
              disabled={visibleStart === 0}
              onClick={() => moveOctave(-1)}
              size="icon"
              variant="outline"
            >
              <ChevronLeft aria-hidden="true" />
            </Button>

            <div className="keyboard-scroll">
              <div
                aria-label="Piano keyboard"
                className="piano-keyboard"
                data-dragging={dragging}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                role="group"
                style={{
                  ["--visible-white-keys" as string]: visibleCount,
                }}
              >
                <div className="white-keys">
                  {visibleWhiteKeys.map((key) => {
                    const isSelected = key.midi === selectedMidi;

                    return (
                      <button
                        aria-label={`Select ${key.label}`}
                        aria-pressed={isSelected}
                        className="piano-key piano-key-white"
                        data-selected={isSelected}
                        key={key.midi}
                        onClick={() => selectKey(key.midi)}
                        type="button"
                      >
                        <span className="piano-key-label">{key.name}</span>
                      </button>
                    );
                  })}
                </div>

                {visibleBlackKeys.map((key) => {
                  const isSelected = key.midi === selectedMidi;
                  const left =
                    ((key.whiteIndex - visibleStart + 1) / visibleCount) * 100;

                  return (
                    <button
                      aria-label={`Select ${key.label}`}
                      aria-pressed={isSelected}
                      className="piano-key piano-key-black"
                      data-selected={isSelected}
                      key={key.midi}
                      onClick={() => selectKey(key.midi)}
                      style={{ left: `${left}%` }}
                      type="button"
                    >
                      <span className="piano-key-label">
                        {isSelected ? key.name : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <Button
              aria-label="Octave up"
              disabled={visibleStart >= maxStart}
              onClick={() => moveOctave(1)}
              size="icon"
              variant="outline"
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="keyboard-overview">
          <div className="overview-heading">
            <span>Full keyboard</span>
            <span>
              {PIANO_KEYS[0].label}–{PIANO_KEYS[PIANO_KEYS.length - 1].label}
            </span>
          </div>
          <div aria-hidden="true" className="overview-track">
            {PIANO_KEYS.map((key) => {
              const inView = key.isBlack
                ? key.whiteIndex >= visibleStart &&
                  key.whiteIndex < visibleStart + visibleCount - 1
                : key.whiteIndex >= visibleStart &&
                  key.whiteIndex < visibleStart + visibleCount;

              return (
                <span
                  className={key.isBlack ? "overview-black" : "overview-white"}
                  data-selected={key.midi === selectedMidi}
                  data-visible={inView}
                  key={key.midi}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
