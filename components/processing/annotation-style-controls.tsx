"use client";

import { Check } from "lucide-react";
import { useId } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  labelColors,
  labelColorValues,
  type AnnotationStyle,
  type LabelColor,
  type LabelPosition,
  type LabelSize,
  type LetterCase,
  type NamingSystem,
} from "@/lib/processing/annotation-style";
import { noteName } from "@/lib/processing/solfege";

type AnnotationStyleControlsProps = {
  style: AnnotationStyle;
  disabled?: boolean;
  onChange: (style: AnnotationStyle) => void;
};

type Option<T extends string> = {
  value: T;
  label: string;
  ariaLabel: string;
};

const sizeOptions: Option<LabelSize>[] = [
  { value: "small", label: "S", ariaLabel: "Small" },
  { value: "medium", label: "M", ariaLabel: "Medium" },
  { value: "large", label: "L", ariaLabel: "Large" },
];

const colorNames: Record<LabelColor, string> = {
  blue: "Blue",
  red: "Red",
  green: "Green",
  purple: "Purple",
  orange: "Orange",
  black: "Black",
};

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  disabled,
  onChange,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div aria-label={label} className="segmented-control" role="radiogroup">
      {options.map((option) => (
        <button
          aria-checked={option.value === value}
          aria-label={option.ariaLabel}
          disabled={disabled}
          key={option.value}
          onClick={() => onChange(option.value)}
          role="radio"
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function AnnotationStyleControls({
  style,
  disabled,
  onChange,
}: AnnotationStyleControlsProps) {
  const octaveId = useId();

  function update(changes: Partial<AnnotationStyle>) {
    onChange({ ...style, ...changes });
  }

  // Shows each letter-case choice in the current naming system, e.g. "sol / Sol / SOL".
  const caseSample = (letterCase: LetterCase) =>
    noteName(7, 0, undefined, { ...style, letterCase, showOctave: false }) ??
    "";

  // Single letters look the same capitalized or uppercase, so offer two choices.
  const singleLetters = style.naming === "letters";
  const caseOptions: Option<LetterCase>[] = singleLetters
    ? [
        { value: "lower", label: caseSample("lower"), ariaLabel: "Lowercase" },
        { value: "upper", label: caseSample("upper"), ariaLabel: "Uppercase" },
      ]
    : [
        { value: "lower", label: caseSample("lower"), ariaLabel: "Lowercase" },
        {
          value: "capitalized",
          label: caseSample("capitalized"),
          ariaLabel: "Capitalized",
        },
        { value: "upper", label: caseSample("upper"), ariaLabel: "Uppercase" },
      ];
  const caseValue =
    singleLetters && style.letterCase === "capitalized"
      ? "upper"
      : style.letterCase;

  return (
    <div className="annotation-style">
      <div className="sheet-field">
        <span>Note names</span>
        <Select
          disabled={disabled}
          onValueChange={(value) => update({ naming: value as NamingSystem })}
          value={style.naming}
        >
          <SelectTrigger aria-label="Note names">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="solfege">Do, re, mi</SelectItem>
            <SelectItem value="letters">C, D, E</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="sheet-field">
        <span>Position</span>
        <Select
          disabled={disabled}
          onValueChange={(value) =>
            update({ position: value as LabelPosition })
          }
          value={style.position}
        >
          <SelectTrigger aria-label="Label position">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="beside">Beside each note</SelectItem>
            <SelectItem value="below">Below the staff</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="annotation-style-row">
        <div className="sheet-field">
          <span>Size</span>
          <SegmentedControl
            disabled={disabled}
            label="Label size"
            onChange={(size) => update({ size })}
            options={sizeOptions}
            value={style.size}
          />
        </div>
        <div className="sheet-field">
          <span>Letter case</span>
          <SegmentedControl
            disabled={disabled}
            label="Letter case"
            onChange={(letterCase) => update({ letterCase })}
            options={caseOptions}
            value={caseValue}
          />
        </div>
      </div>

      <div className="sheet-field">
        <span>Color</span>
        <div aria-label="Label color" className="color-swatches" role="radiogroup">
          {labelColors.map((color) => (
            <button
              aria-checked={style.color === color}
              aria-label={colorNames[color]}
              disabled={disabled}
              key={color}
              onClick={() => update({ color })}
              role="radio"
              style={{ "--swatch": labelColorValues[color] } as React.CSSProperties}
              title={colorNames[color]}
              type="button"
            >
              {style.color === color ? <Check aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="annotation-style-toggle">
        <label htmlFor={octaveId}>Octave numbers</label>
        <Switch
          checked={style.showOctave}
          disabled={disabled}
          id={octaveId}
          onCheckedChange={(showOctave) => update({ showOctave })}
        />
      </div>
    </div>
  );
}
