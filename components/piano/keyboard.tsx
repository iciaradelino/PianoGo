"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/components/settings/settings-provider";
import {
  BLACK_KEYS,
  WHITE_KEYS,
  WHITE_KEYS_PER_OCTAVE,
  clampWindow,
  inWindow,
} from "./piano-keys";
import type { Hand } from "./score-link";

/** A key of the lit measure; `steps` is empty when the measure is too long to number. */
export type KeyMark = { hand: Hand; steps: number[] };

type KeyboardProps = {
  start: number;
  visibleCount: number;
  onStartChange: (start: number) => void;
  onPress: (midi: number) => void;
  marks: Map<number, KeyMark>;
  focusMidis: Set<number>;
  previewMidi?: number;
  selectedMidi: number | null;
  /** Names the hand this keyboard is for, when each hand has its own. */
  hand?: Hand;
};

function KeySteps({ mark }: { mark: KeyMark }) {
  return (
    <span className="piano-key-steps">
      {mark.steps.length > 0 ? (
        mark.steps.map((step) => (
          <span className="piano-key-step" key={step}>
            {step}
          </span>
        ))
      ) : (
        <span className="piano-key-step piano-key-step-dot" />
      )}
    </span>
  );
}

export function Keyboard({
  start,
  visibleCount,
  onStartChange,
  onPress,
  marks,
  focusMidis,
  previewMidi,
  selectedMidi,
  hand,
}: KeyboardProps) {
  const { t } = useSettings();
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ id: -1, x: 0, origin: 0, moved: false });
  const visibleStart = clampWindow(start, visibleCount);
  const maxStart = WHITE_KEYS.length - visibleCount;
  const visibleWhiteKeys = WHITE_KEYS.slice(visibleStart, visibleStart + visibleCount);
  const visibleBlackKeys = BLACK_KEYS.filter((key) =>
    inWindow(key, visibleStart, visibleCount),
  );

  function moveOctave(direction: -1 | 1) {
    onStartChange(
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
    onStartChange(clampWindow(drag.current.origin + shift, visibleCount));
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

  function pressKey(midi: number) {
    if (drag.current.moved) {
      drag.current.moved = false;
      return;
    }
    onPress(midi);
  }

  const handLabel = hand === "left" ? t("piano.leftHand") : t("piano.rightHand");

  return (
    <div className="keyboard-hand" data-hand={hand}>
      {hand ? <span className="keyboard-hand-label">{handLabel}</span> : null}
      <div className="keyboard-row">
        <Button
          aria-label={t("piano.octaveDown")}
          disabled={visibleStart === 0}
          onClick={() => moveOctave(-1)}
          size="icon"
          variant="outline"
        >
          <ChevronLeft aria-hidden="true" />
        </Button>

        <div className="keyboard-scroll">
          <div
            aria-label={hand ? handLabel : t("piano.keyboard")}
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
                const mark = marks.get(key.midi);

                return (
                  <button
                    aria-label={t("piano.selectKey", { note: key.label })}
                    aria-pressed={isSelected}
                    className="piano-key piano-key-white"
                    data-current={focusMidis.has(key.midi)}
                    data-hand={mark?.hand}
                    data-preview={key.midi === previewMidi}
                    data-selected={isSelected}
                    key={key.midi}
                    onClick={() => pressKey(key.midi)}
                    type="button"
                  >
                    {mark ? <KeySteps mark={mark} /> : null}
                    <span className="piano-key-label">{key.name}</span>
                  </button>
                );
              })}
            </div>

            {visibleBlackKeys.map((key) => {
              const isSelected = key.midi === selectedMidi;
              const mark = marks.get(key.midi);
              const left = ((key.whiteIndex - visibleStart + 1) / visibleCount) * 100;

              return (
                <button
                  aria-label={t("piano.selectKey", { note: key.label })}
                  aria-pressed={isSelected}
                  className="piano-key piano-key-black"
                  data-current={focusMidis.has(key.midi)}
                  data-hand={mark?.hand}
                  data-preview={key.midi === previewMidi}
                  data-selected={isSelected}
                  key={key.midi}
                  onClick={() => pressKey(key.midi)}
                  style={{ left: `${left}%` }}
                  type="button"
                >
                  {mark ? <KeySteps mark={mark} /> : null}
                  <span className="piano-key-label">
                    {isSelected || mark ? key.name : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <Button
          aria-label={t("piano.octaveUp")}
          disabled={visibleStart >= maxStart}
          onClick={() => moveOctave(1)}
          size="icon"
          variant="outline"
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
