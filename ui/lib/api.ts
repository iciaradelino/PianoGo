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

// Cold starts (A2 §7.5). On Azure both services scale to zero and their
// databases pause, so the first request after a quiet period may find the
// container starting and the database resuming, which takes up to about a
// minute. Meanwhile Container Apps answers 503 after ~30 s, without CORS
// headers, so the browser sees a network error instead of the status. A
// service's own errors (its JSON 4xx/5xx, including processing's designed 503
// when library is down) always carry CORS headers and are returned as they
// are, never retried.
//
// serviceFetch retries network errors, 502, 504 and non-JSON 503s with
// backoff for up to WAKE_BUDGET_MS, and while it does, the service is listed
// as "waking" so the UI can say so instead of showing a blank or hung page.
// Those failures mean the request never reached the service, so retrying a
// write does not apply it twice. Each attempt has its own timeout; a write that
// timed out may have reached it, so only reads are retried after a timeout.
const ATTEMPT_TIMEOUT_MS = 35_000;
const WAKE_BUDGET_MS = 90_000;
const BACKOFF_MS = [2_000, 4_000, 8_000];

export type ServiceName = "library" | "processing";

const waking = new Map<ServiceName, number>();
const wakeListeners = new Set<() => void>();
let wakingSnapshot: ServiceName[] = [];

function setWaking(service: ServiceName, delta: 1 | -1) {
  const count = (waking.get(service) ?? 0) + delta;
  if (count > 0) waking.set(service, count);
  else waking.delete(service);
  wakingSnapshot = [...waking.keys()].sort();
  wakeListeners.forEach((listener) => listener());
}

/** For useSyncExternalStore: the services a request is waiting on. */
export function subscribeWaking(listener: () => void) {
  wakeListeners.add(listener);
  return () => {
    wakeListeners.delete(listener);
  };
}

export function getWakingServices() {
  return wakingSnapshot;
}

const emptyWaking: ServiceName[] = [];
export function getWakingServicesOnServer() {
  return emptyWaking;
}

function serviceOf(url: string): ServiceName {
  return url.startsWith(baseUrl("processingUrl")) ? "processing" : "library";
}

function isColdStartResponse(response: Response) {
  if (response.status === 502 || response.status === 504) return true;
  if (response.status !== 503) return false;
  const type = response.headers.get("content-type") ?? "";
  return !type.includes("application/json");
}

/**
 * fetch() for a URL on one of the two services, which waits for a service
 * that is starting up (see above). Anything else is returned or thrown as
 * fetch() would.
 */
export async function serviceFetch(url: string, init?: RequestInit) {
  const service = serviceOf(url);
  const deadline = Date.now() + WAKE_BUDGET_MS;
  let isWaking = false;

  try {
    for (let attempt = 0; ; attempt++) {
      const timeout = AbortSignal.timeout(ATTEMPT_TIMEOUT_MS);
      const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
      let retry: unknown;
      try {
        const response = await fetch(url, { ...init, signal });
        if (!isColdStartResponse(response)) return response;
        retry = response;
      } catch (error) {
        // The caller cancelled: stop at once.
        if (init?.signal?.aborted) throw error;
        // A timed-out write may have reached the service: don't send it again.
        const method = (init?.method ?? "GET").toUpperCase();
        if (timeout.aborted && method !== "GET" && method !== "HEAD") throw error;
        retry = error;
      }

      const pause = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      if (Date.now() + pause >= deadline) {
        if (retry instanceof Response) return retry;
        throw retry;
      }
      if (!isWaking) {
        isWaking = true;
        setWaking(service, 1);
      }
      await new Promise((resolve) => setTimeout(resolve, pause));
    }
  } finally {
    if (isWaking) setWaking(service, -1);
  }
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
