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
  labelSizes,
  type AnnotationStyle,
  type LabelColor,
  type LabelPosition,
  type LabelSize,
  type LetterCase,
  type NamingSystem,
} from "@/lib/processing/annotation-style";
import { noteName } from "@/lib/processing/solfege";
import type { MessageKey } from "@/lib/settings/messages";
import { useSettings } from "@/components/settings/settings-provider";

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

const sizeKeys: Record<LabelSize, [MessageKey, MessageKey]> = {
  small: ["style.smallShort", "style.small"],
  medium: ["style.mediumShort", "style.medium"],
  large: ["style.largeShort", "style.large"],
};

const colorNames: Record<LabelColor, MessageKey> = {
  blue: "style.blue",
  red: "style.red",
  green: "style.green",
  purple: "style.purple",
  orange: "style.orange",
  black: "style.black",
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
  const { t } = useSettings();
  const octaveId = useId();
  const sizeOptions = labelSizes.map((value) => ({
    value,
    label: t(sizeKeys[value][0]),
    ariaLabel: t(sizeKeys[value][1]),
  }));

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
        {
          value: "lower",
          label: caseSample("lower"),
          ariaLabel: t("style.lowercase"),
        },
        {
          value: "upper",
          label: caseSample("upper"),
          ariaLabel: t("style.uppercase"),
        },
      ]
    : [
        {
          value: "lower",
          label: caseSample("lower"),
          ariaLabel: t("style.lowercase"),
        },
        {
          value: "capitalized",
          label: caseSample("capitalized"),
          ariaLabel: t("style.capitalized"),
        },
        {
          value: "upper",
          label: caseSample("upper"),
          ariaLabel: t("style.uppercase"),
        },
      ];
  const caseValue =
    singleLetters && style.letterCase === "capitalized"
      ? "upper"
      : style.letterCase;

  return (
    <div className="annotation-style">
      <div className="sheet-field">
        <span>{t("style.noteNames")}</span>
        <Select
          disabled={disabled}
          onValueChange={(value) => update({ naming: value as NamingSystem })}
          value={style.naming}
        >
          <SelectTrigger aria-label={t("style.noteNames")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="solfege">Do, re, mi</SelectItem>
            <SelectItem value="letters">C, D, E</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="sheet-field">
        <span>{t("style.position")}</span>
        <Select
          disabled={disabled}
          onValueChange={(value) =>
            update({ position: value as LabelPosition })
          }
          value={style.position}
        >
          <SelectTrigger aria-label={t("style.labelPosition")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="beside">{t("style.beside")}</SelectItem>
            <SelectItem value="below">{t("style.below")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="annotation-style-row">
        <div className="sheet-field">
          <span>{t("style.size")}</span>
          <SegmentedControl
            disabled={disabled}
            label={t("style.labelSize")}
            onChange={(size) => update({ size })}
            options={sizeOptions}
            value={style.size}
          />
        </div>
        <div className="sheet-field">
          <span>{t("style.letterCase")}</span>
          <SegmentedControl
            disabled={disabled}
            label={t("style.letterCase")}
            onChange={(letterCase) => update({ letterCase })}
            options={caseOptions}
            value={caseValue}
          />
        </div>
      </div>

      <div className="sheet-field">
        <span>{t("style.color")}</span>
        <div aria-label={t("style.labelColor")} className="color-swatches" role="radiogroup">
          {labelColors.map((color) => (
            <button
              aria-checked={style.color === color}
              aria-label={t(colorNames[color])}
              disabled={disabled}
              key={color}
              onClick={() => update({ color })}
              role="radio"
              style={{ "--swatch": labelColorValues[color] } as React.CSSProperties}
              title={t(colorNames[color])}
              type="button"
            >
              {style.color === color ? <Check aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="annotation-style-toggle">
        <label htmlFor={octaveId}>{t("style.octaveNumbers")}</label>
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
