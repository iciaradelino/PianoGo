export const languages = ["en", "es"] as const;
export const themes = ["light", "dark", "system"] as const;

export type Language = (typeof languages)[number];
export type Theme = (typeof themes)[number];

export const defaultLanguage: Language = "en";
export const defaultTheme: Theme = "system";

export const languageKey = "pianogo.language";
export const themeKey = "pianogo.theme";
export const welcomedKey = "pianogo.welcomed";

const changeEvent = "pianogo:preferences";

function pick<T extends string>(
  options: readonly T[],
  value: unknown,
  fallback: T,
): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function read(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function readLanguage(): Language {
  return pick(languages, read(languageKey), defaultLanguage);
}

export function readTheme(): Theme {
  return pick(themes, read(themeKey), defaultTheme);
}

/** True once the visitor has finished or skipped the welcome screen. */
export function readWelcomed(): boolean {
  return read(welcomedKey) === "true";
}

export function savePreference(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked; the choice still applies until the page reloads.
  }
  window.dispatchEvent(new Event(changeEvent));
}

/** Notifies on changes from this tab and from other tabs. */
export function subscribePreferences(onChange: () => void) {
  window.addEventListener(changeEvent, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(changeEvent, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Runs before the page paints so a dark theme never flashes light, and so a
 * returning visitor never sees the welcome screen flash.
 * Kept in sync with `themeKey`, `welcomedKey`, and the `.dark` class and
 * `[data-welcomed]` rule in globals.css.
 */
export const themeScript = `(() => {
  try {
    const theme = localStorage.getItem(${JSON.stringify(themeKey)});
    const dark = theme === "dark" || (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.toggleAttribute("data-welcomed", localStorage.getItem(${JSON.stringify(welcomedKey)}) === "true");
  } catch {}
})();`;
