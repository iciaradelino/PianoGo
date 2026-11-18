"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  translate,
  type MessageKey,
} from "@/lib/settings/messages";
import {
  defaultLanguage,
  defaultTheme,
  languageKey,
  readLanguage,
  readTheme,
  savePreference,
  subscribePreferences,
  themeKey,
  type Language,
  type Theme,
} from "@/lib/settings/preferences";

type SettingsContextValue = {
  language: Language;
  theme: Theme;
  setLanguage: (language: Language) => void;
  setTheme: (theme: Theme) => void;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  // The server renders the defaults; the browser switches to the saved choice.
  const language = useSyncExternalStore(
    subscribePreferences,
    readLanguage,
    () => defaultLanguage,
  );
  const theme = useSyncExternalStore(
    subscribePreferences,
    readTheme,
    () => defaultTheme,
  );

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  const t = useCallback(
    (key: MessageKey, values?: Record<string, string | number>) =>
      translate(language, key, values),
    [language],
  );

  const value = useMemo(
    () => ({
      language,
      theme,
      setLanguage: (next: Language) => savePreference(languageKey, next),
      setTheme: (next: Theme) => savePreference(themeKey, next),
      t,
    }),
    [language, theme, t],
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings needs a SettingsProvider.");
  return context;
}
