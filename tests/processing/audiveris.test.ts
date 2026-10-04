import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { audiverisPath, recognise } from "@/lib/processing/omr/audiveris";

// Audiveris is a separate program; a fake process stands in for it.
jest.mock("node:child_process", () => ({ spawn: jest.fn() }));
const spawnMock = jest.mocked(spawn);

const launcher = path.join(process.env.DATA_DIR!, "Audiveris");

type Behaviour = { log?: string; saves?: boolean; fails?: boolean };

/** Makes spawn start a fake Audiveris that logs, saves a project and exits. */
function fakeAudiveris({ log = "", saves = true, fails = false }: Behaviour) {
  spawnMock.mockImplementationOnce(((_command: string, args: string[]) => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: jest.fn(),
    });
    const output = args[args.indexOf("-output") + 1];
    setImmediate(() => {
      if (fails) {
        child.emit("error", new Error("spawn EACCES"));
        return;
      }
      child.stdout.emit("data", Buffer.from(log));
      child.stderr.emit("data", Buffer.from("WARN [score#1] again"));
      if (saves) {
        fs.mkdirSync(output, { recursive: true });
        fs.writeFileSync(path.join(output, "score.omr"), `project of ${args.at(-1)}`);
      }
      child.emit("close", saves ? 0 : 1);
    });
    return child;
  }) as unknown as typeof spawn);
}

beforeAll(() => {
  fs.writeFileSync(launcher, "");
  process.env.AUDIVERIS_PATH = launcher;
});

afterEach(() => {
  jest.restoreAllMocks();
  spawnMock.mockReset();
});

describe("audiverisPath", () => {
  it("prefers AUDIVERIS_PATH", () => {
    expect(audiverisPath()).toBe(launcher);
  });

  it("returns null when no launcher exists", () => {
    jest.spyOn(fs, "existsSync").mockReturnValue(false);
    expect(audiverisPath()).toBeNull();
  });
});

describe("recognise", () => {
  it("runs Audiveris in batch mode and returns the saved project", async () => {
    fakeAudiveris({ log: "INFO [score#1] page one\nINFO [score#2] page two" });
    const progress: unknown[] = [];

    const project = await recognise(Buffer.from("%PDF"), 2, (step) => progress.push(step));

    expect(project.toString()).toMatch(/^project of .*score\.pdf$/);
    expect(progress).toEqual([
      { sheet: 1, sheets: 2 },
      { sheet: 2, sheets: 2 },
    ]);
    const [command, args] = spawnMock.mock.calls[0];
    expect(command).toBe(launcher);
    expect(args.slice(0, 4)).toEqual(["-batch", "-transcribe", "-save", "-output"]);
  });

  it("removes its temporary folder afterwards", async () => {
    fakeAudiveris({});
    await recognise(Buffer.from("%PDF"), 1);
    const input = spawnMock.mock.calls[0][1].at(-1)!;
    expect(fs.existsSync(path.dirname(input))).toBe(false);
  });

  it("fails when Audiveris saves no project", async () => {
    fakeAudiveris({ saves: false });
    await expect(recognise(Buffer.from("%PDF"), 1)).rejects.toThrow(
      "Audiveris could not read this scan.",
    );
  });

  it("fails when Audiveris cannot start", async () => {
    fakeAudiveris({ fails: true });
    await expect(recognise(Buffer.from("%PDF"), 1)).rejects.toThrow("spawn EACCES");
  });

  it("fails when Audiveris is not installed", async () => {
    jest.spyOn(fs, "existsSync").mockReturnValue(false);
    await expect(recognise(Buffer.from("%PDF"), 1)).rejects.toThrow(
      "Audiveris is not installed.",
    );
  });

  it("runs one job at a time, even after a failure", async () => {
    fakeAudiveris({ fails: true });
    fakeAudiveris({});
    const first = recognise(Buffer.from("%PDF"), 1);
    const second = recognise(Buffer.from("%PDF"), 1);

    expect(spawnMock).toHaveBeenCalledTimes(0);
    await expect(first).rejects.toThrow();
    await expect(second).resolves.toBeInstanceOf(Buffer);
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });
});
