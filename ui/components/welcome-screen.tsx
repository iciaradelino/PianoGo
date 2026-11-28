"use client";

import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  FileMusic,
  Library,
  Monitor,
  Moon,
  Piano,
  Sun,
  Tags,
  Upload,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { languageNames } from "@/lib/settings/messages";
import { languages, type Theme } from "@/lib/settings/preferences";
import { Button } from "./ui/button";
import { useSettings } from "./settings/settings-provider";

export type WelcomeDestination = "upload" | "library" | "piano";

type WelcomeScreenProps = {
  onFinish: (destination: WelcomeDestination) => void;
};

const steps = ["intro", "appearance", "start"] as const;

const features = [
  { icon: FileMusic, label: "welcome.featureUpload" },
  { icon: Tags, label: "welcome.featureLabels" },
  { icon: Piano, label: "welcome.featurePiano" },
] as const;

const themeOptions = [
  { value: "light", label: "settings.light", icon: Sun },
  { value: "dark", label: "settings.dark", icon: Moon },
  { value: "system", label: "settings.system", icon: Monitor },
] as const;

const destinations = [
  {
    value: "upload",
    icon: Upload,
    title: "welcome.startUpload",
    description: "welcome.startUploadHint",
  },
  {
    value: "library",
    icon: Library,
    title: "welcome.startLibrary",
    description: "welcome.startLibraryHint",
  },
  {
    value: "piano",
    icon: Piano,
    title: "welcome.startPiano",
    description: "welcome.startPianoHint",
  },
] as const;

/**
 * Shown on a first visit (and again from Settings). Sets the language and
 * theme, then drops the visitor on the tab they want to start from.
 */
export function WelcomeScreen({ onFinish }: WelcomeScreenProps) {
  const { language, theme, setLanguage, setTheme, t } = useSettings();
  const [step, setStep] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const current = steps[step];

  // Move focus to each step's heading so keyboard and screen reader users
  // start at the top of the new content.
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  return (
    <div
      aria-labelledby="welcome-heading"
      aria-modal="true"
      className="welcome-screen"
      role="dialog"
    >
      <div className="welcome-panel">
        <header className="welcome-header">
          <div className="brand">
            <Image
              alt=""
              className="brand-logo brand-logo-light"
              height={32}
              priority
              src="/pianogo-logo.svg?v=2"
              unoptimized
              width={32}
            />
            <Image
              alt=""
              className="brand-logo brand-logo-dark"
              height={32}
              priority
              src="/pianogo-logo-white.svg"
              unoptimized
              width={32}
            />
            <span className="brand-name">PianoGo</span>
          </div>
          <Button
            className="welcome-skip"
            onClick={() => onFinish("library")}
            size="sm"
            variant="ghost"
          >
            {t("welcome.skip")}
          </Button>
        </header>

        <div className="welcome-progress">
          <span className="navigation-label">
            {t("welcome.step", { step: step + 1, steps: steps.length })}
          </span>
          <div aria-hidden="true" className="welcome-progress-track">
            {steps.map((name, index) => (
              <span data-done={index <= step} key={name} />
            ))}
          </div>
        </div>

        <div className="welcome-body" key={current}>
          {current === "intro" ? (
            <>
              <h1 id="welcome-heading" ref={headingRef} tabIndex={-1}>
                {t("welcome.title")}
              </h1>
              <p className="welcome-lead">{t("welcome.lead")}</p>
              <ul className="welcome-features">
                {features.map(({ icon: Icon, label }) => (
                  <li key={label}>
                    <span className="welcome-feature-icon">
                      <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
                    </span>
                    {t(label)}
                  </li>
                ))}
              </ul>
              <div className="sheet-field">
                <span id="welcome-language">{t("settings.language")}</span>
                <div
                  aria-labelledby="welcome-language"
                  className="segmented-control"
                  role="radiogroup"
                >
                  {languages.map((option) => (
                    <button
                      aria-checked={language === option}
                      key={option}
                      lang={option}
                      onClick={() => setLanguage(option)}
                      role="radio"
                      type="button"
                    >
                      {languageNames[option]}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {current === "appearance" ? (
            <>
              <h1 id="welcome-heading" ref={headingRef} tabIndex={-1}>
                {t("welcome.appearanceTitle")}
              </h1>
              <p className="welcome-lead">{t("welcome.appearanceLead")}</p>
              <div className="sheet-field">
                <span id="welcome-theme">{t("settings.theme")}</span>
                <div
                  aria-labelledby="welcome-theme"
                  className="segmented-control"
                  role="radiogroup"
                >
                  {themeOptions.map(({ value, label, icon: Icon }) => (
                    <button
                      aria-checked={theme === value}
                      key={value}
                      onClick={() => setTheme(value as Theme)}
                      role="radio"
                      type="button"
                    >
                      <Icon aria-hidden="true" size={14} />
                      {t(label)}
                    </button>
                  ))}
                </div>
                <p className="settings-hint">{t("settings.themeHint")}</p>
              </div>
              <p className="settings-hint">{t("welcome.changeLater")}</p>
            </>
          ) : null}

          {current === "start" ? (
            <>
              <h1 id="welcome-heading" ref={headingRef} tabIndex={-1}>
                {t("welcome.startTitle")}
              </h1>
              <p className="welcome-lead">{t("welcome.startLead")}</p>
              <div className="welcome-destinations">
                {destinations.map(
                  ({ value, icon: Icon, title, description }) => (
                    <button
                      key={value}
                      onClick={() => onFinish(value)}
                      type="button"
                    >
                      <span className="welcome-feature-icon">
                        <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
                      </span>
                      <span className="welcome-destination-text">
                        <strong>{t(title)}</strong>
                        <span>{t(description)}</span>
                      </span>
                      <ChevronRight aria-hidden="true" size={16} />
                    </button>
                  ),
                )}
              </div>
            </>
          ) : null}
        </div>

        <footer className="welcome-footer">
          {step > 0 ? (
            <Button onClick={() => setStep(step - 1)} variant="outline">
              <ArrowLeft aria-hidden="true" data-icon="inline-start" />
              {t("welcome.back")}
            </Button>
          ) : (
            <span />
          )}
          {step < steps.length - 1 ? (
            <Button onClick={() => setStep(step + 1)}>
              {t("welcome.continue")}
              <ArrowRight aria-hidden="true" data-icon="inline-end" />
            </Button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
