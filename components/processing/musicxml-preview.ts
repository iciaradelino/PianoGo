// Renders the opening measures of a MusicXML file to an SVG data URL so the
// library grid can show it like the server-rendered PDF previews.

const RENDER_WIDTH = 720;
const PREVIEW_MEASURES = 8;

const cache = new Map<string, Promise<string | null>>();
// OSMD renders on the main thread; one score at a time keeps the grid responsive.
let queue: Promise<unknown> = Promise.resolve();

async function renderPreview(fileUrl: string, title: string) {
  const [{ OpenSheetMusicDisplay }, response] = await Promise.all([
    import("opensheetmusicdisplay"),
    fetch(fileUrl),
  ]);
  if (!response.ok) return null;
  const file = await response.blob();

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
