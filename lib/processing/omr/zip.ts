import { inflateRawSync } from "node:zlib";

/**
 * Reads the files in a zip archive. Audiveris saves its projects (.omr) as
 * plain zip files, so stored and deflated entries are all that is needed.
 */

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;
const STORED = 0;
const DEFLATED = 8;

function findEndOfDirectory(zip: Buffer) {
  // The record is 22 bytes plus a comment of at most 64 KiB.
  const earliest = Math.max(0, zip.length - 22 - 0xffff);
  for (let offset = zip.length - 22; offset >= earliest; offset--) {
    if (zip.readUInt32LE(offset) === END_OF_DIRECTORY) return offset;
  }
  throw new Error("Not a zip file.");
}

/** Returns the archive's files whose names `wanted` accepts. */
export function readZip(
  zip: Buffer,
  wanted: (name: string) => boolean = () => true,
) {
  const end = findEndOfDirectory(zip);
  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();

  for (let index = 0; index < count; index++) {
    if (zip.readUInt32LE(offset) !== DIRECTORY_ENTRY) {
      throw new Error("Damaged zip directory.");
    }
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.toString("utf8", offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith("/") || !wanted(name)) continue;
    if (zip.readUInt32LE(localOffset) !== LOCAL_HEADER) {
      throw new Error("Damaged zip entry.");
    }
    const dataStart =
      localOffset +
      30 +
      zip.readUInt16LE(localOffset + 26) +
      zip.readUInt16LE(localOffset + 28);
    const data = zip.subarray(dataStart, dataStart + compressedSize);
    if (method === STORED) files.set(name, Buffer.from(data));
    else if (method === DEFLATED) files.set(name, inflateRawSync(data));
    else throw new Error(`Unsupported zip compression ${method}.`);
  }
  return files;
}
