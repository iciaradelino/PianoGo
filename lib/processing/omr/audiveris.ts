import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Runs Audiveris (https://audiveris.github.io), an open-source optical music
 * recognition program, on a scanned PDF and returns the project it saves.
 * Audiveris is a separate install; AUDIVERIS_PATH points at its launcher when
 * it is not in the usual place.
 */

const DEFAULT_PATHS: Partial<Record<NodeJS.Platform, string[]>> = {
  win32: ["C:\\Program Files\\Audiveris\\Audiveris.exe"],
  darwin: ["/Applications/Audiveris.app/Contents/MacOS/Audiveris"],
  linux: ["/opt/audiveris/bin/Audiveris", "/usr/bin/audiveris"],
};

// Generous: Audiveris takes 10 to 40 seconds a page on a laptop.
const TIMEOUT_MS = 15 * 60 * 1000;

export function audiverisPath() {
  const candidates = [
    process.env.AUDIVERIS_PATH,
    ...(DEFAULT_PATHS[process.platform] ?? []),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export type OmrProgress = { sheet: number; sheets: number };

let queue: Promise<unknown> = Promise.resolve();

/**
 * Recognises every page of `pdf`. Jobs run one at a time, since each one
 * takes a lot of memory. `onProgress` hears which page is being read.
 */
export function recognise(
  pdf: Buffer,
  pageCount: number,
  onProgress?: (progress: OmrProgress) => void,
): Promise<Buffer> {
  const job = queue.then(() => run(pdf, pageCount, onProgress));
  queue = job.catch(() => undefined);
  return job;
}

async function run(
  pdf: Buffer,
  pageCount: number,
  onProgress?: (progress: OmrProgress) => void,
) {
  const executable = audiverisPath();
  if (!executable) throw new Error("Audiveris is not installed.");

  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pianogo-omr-"));
  try {
    const input = path.join(directory, "score.pdf");
    const output = path.join(directory, "out");
    await fs.promises.writeFile(input, pdf);

    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        executable,
        ["-batch", "-transcribe", "-save", "-output", output, "--", input],
        { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
      );
      const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
      let lastSheet = 0;
      // Log lines name the sheet being worked on, as in "[score#2]".
      const watch = (chunk: Buffer) => {
        for (const match of chunk.toString().matchAll(/\[score#(\d+)\]/g)) {
          const sheet = Number(match[1]);
          if (sheet > lastSheet) {
            lastSheet = sheet;
            onProgress?.({ sheet, sheets: pageCount });
          }
        }
      };
      child.stdout.on("data", watch);
      child.stderr.on("data", watch);
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      // Audiveris exits with an error when any page is unreadable, such as a
      // cover; the saved project still holds every page it could read.
      child.on("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });

    const project = path.join(output, "score.omr");
    if (!fs.existsSync(project)) {
      throw new Error("Audiveris could not read this scan.");
    }
    return await fs.promises.readFile(project);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}
