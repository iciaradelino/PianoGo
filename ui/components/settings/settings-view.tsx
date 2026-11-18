"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { languageNames } from "@/lib/settings/messages";
import {
  languages,
  type Language,
  type Theme,
} from "@/lib/settings/preferences";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettings } from "./settings-provider";

const themeOptions = [
  { value: "light", label: "settings.light", icon: Sun },
  { value: "dark", label: "settings.dark", icon: Moon },
  { value: "system", label: "settings.system", icon: Monitor },
] as const;

export function SettingsView() {
  const { language, theme, setLanguage, setTheme, t } = useSettings();

  return (
    <section className="settings-view">
      <div className="settings-section">
        <h2>{t("settings.appearance")}</h2>
        <div className="sheet-field">
          <span>{t("settings.theme")}</span>
          <div
            aria-label={t("settings.theme")}
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
      </div>

      <div className="settings-section">
        <h2>{t("settings.language")}</h2>
        <div className="sheet-field">
          <span>{t("settings.language")}</span>
          <Select
            onValueChange={(value) => setLanguage(value as Language)}
            value={language}
          >
            <SelectTrigger aria-label={t("settings.language")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languages.map((option) => (
                <SelectItem key={option} lang={option} value={option}>
                  {languageNames[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="settings-hint">{t("settings.languageHint")}</p>
        </div>
      </div>
    </section>
  );
}
