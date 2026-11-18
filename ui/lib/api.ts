// The browser talks to the two services directly (ADR-6). Their base URLs come
// from config.js, which docker compose serves as committed and the deploy
// pipeline overwrites with the Azure URLs, so the build is the same everywhere.
type ServiceConfig = { libraryUrl: string; processingUrl: string };

declare global {
  interface Window {
    PIANOGO_CONFIG?: Partial<ServiceConfig>;
  }
}

function baseUrl(name: keyof ServiceConfig) {
  const url = window.PIANOGO_CONFIG?.[name];
  if (!url) throw new Error(`config.js does not set ${name}.`);
  return url.replace(/\/+$/, "");
}

/** A URL on the library service: sheets, their files and previews. */
export function libraryUrl(path: string) {
  return `${baseUrl("libraryUrl")}${path}`;
}

/** A URL on the processing service: annotations and their notes. */
export function processingUrl(path: string) {
  return `${baseUrl("processingUrl")}${path}`;
}

export function sheetFileUrl(sheetId: number) {
  return libraryUrl(`/sheets/${sheetId}/file`);
}

/** The note letters processing stores, and their semitones above C. */
export type Step = "C" | "D" | "E" | "F" | "G" | "A" | "B";
export const STEP_SEMITONES: Record<Step, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** One note found on a PDF page, as GET /annotations/notes returns it. */
export type PdfNoteRecord = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  staffSpace: number;
  staffBottom: number;
  step: Step;
  alter: number;
  octave: number;
  measure: number;
  pianoKeyIndex: number;
};
