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
  readWelcomed,
  savePreference,
  subscribePreferences,
  themeKey,
  welcomedKey,
  type Language,
  type Theme,
} from "@/lib/settings/preferences";

type SettingsContextValue = {
  language: Language;
  theme: Theme;
  welcomed: boolean;
  setLanguage: (language: Language) => void;
  setTheme: (theme: Theme) => void;
  setWelcomed: (welcomed: boolean) => void;
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

  // The server renders the welcome screen; the theme script hides it before
  // paint for returning visitors, and this switches to the saved choice.
  const welcomed = useSyncExternalStore(
    subscribePreferences,
    readWelcomed,
    () => false,
  );

  useEffect(() => {
    document.documentElement.toggleAttribute("data-welcomed", welcomed);
  }, [welcomed]);

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
      welcomed,
      setLanguage: (next: Language) => savePreference(languageKey, next),
      setTheme: (next: Theme) => savePreference(themeKey, next),
      setWelcomed: (next: boolean) =>
        savePreference(welcomedKey, String(next)),
      t,
    }),
    [language, theme, welcomed, t],
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
