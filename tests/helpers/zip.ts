import { deflateRawSync } from "node:zlib";

/**
 * Builds a zip archive in memory, as Audiveris saves its .omr projects.
 * Entries are deflated unless `stored` lists them.
 */
export function makeZip(
  files: Record<string, string | Buffer>,
  options: { stored?: string[]; method?: number } = {},
) {
  const locals: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content);
    const stored = options.stored?.includes(name) ?? false;
    const data = stored ? raw : deflateRawSync(raw);
    const method = options.method ?? (stored ? 0 : 8);
    const nameBytes = Buffer.from(name);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    directory.push(entry, nameBytes);

    offset += local.length + nameBytes.length + data.length;
  }

  const directoryBytes = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directoryBytes.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, directoryBytes, end]);
}
