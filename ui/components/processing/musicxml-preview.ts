// Renders the opening measures of a MusicXML file to an SVG data URL so the
// library grid can show it like the server-rendered PDF previews.

import { serviceFetch } from "@/lib/api";

const RENDER_WIDTH = 720;
const PREVIEW_MEASURES = 8;

const cache = new Map<string, Promise<string | null>>();
// OSMD renders on the main thread; one score at a time keeps the grid responsive.
let queue: Promise<unknown> = Promise.resolve();

async function renderPreview(fileUrl: string, title: string) {
  const response = await serviceFetch(fileUrl);
  if (!response.ok) return null;
  return renderMusicXmlFile(await response.blob(), title);
}

/**
 * Renders the opening measures of a MusicXML file the browser already has,
 * such as one picked for upload. Runs in the same queue as the grid.
 */
export function musicXmlFilePreview(file: Blob, title: string) {
  const job = queue
    .then(() => renderMusicXmlFile(file, title))
    .catch(() => null);
  queue = job;
  return job;
}

async function renderMusicXmlFile(file: Blob, title: string) {
  const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");

  // OSMD lays out against the container width, so it must be in the document.
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${RENDER_WIDTH}px;visibility:hidden;pointer-events:none;`;
  document.body.appendChild(host);

  try {
    const osmd = new OpenSheetMusicDisplay(host, {
      autoResize: false,
      backend: "svg",
      drawingParameters: "compacttight",
      drawTitle: true,
      drawUpToMeasureNumber: PREVIEW_MEASURES,
      pageBackgroundColor: "#ffffff",
    });
    await osmd.load(file, title);
    osmd.render();

    const svg = host.querySelector("svg");
    if (!svg) return null;
    const markup = new XMLSerializer().serializeToString(svg);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  } finally {
    host.remove();
  }
}

export function musicXmlPreview(fileUrl: string, title: string) {
  let job = cache.get(fileUrl);
  if (!job) {
    job = queue.then(() => renderPreview(fileUrl, title)).catch(() => null);
    queue = job;
    cache.set(fileUrl, job);
  }
  return job;
}
