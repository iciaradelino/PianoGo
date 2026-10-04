import {
  child,
  childrenNamed,
  numberAttribute,
  parseXml,
} from "@/lib/processing/omr/xml";
import { readZip } from "@/lib/processing/omr/zip";
import { makeZip } from "../helpers/zip";

describe("parseXml", () => {
  const document = parseXml(`<?xml version="1.0"?>
    <!-- written by Audiveris -->
    <sheet number="1">
      <picture width="2480" height="3508"/>
      <![CDATA[ <ignored/> ]]>
      <page>
        <system id="1" title="A &amp; B &lt;&quot;x&quot;&gt; &apos;y&apos;">text is skipped</system>
        <system id="2"/>
      </page>
    </sheet>
    </extra-closing>`);

  it("builds the element tree with attributes", () => {
    expect(document.name).toBe("sheet");
    expect(document.attributes).toEqual({ number: "1" });
    expect(document.children.map((element) => element.name)).toEqual([
      "picture",
      "page",
    ]);
  });

  it("decodes entities in attribute values", () => {
    const [first] = childrenNamed(child(document, "page"), "system");
    expect(first.attributes.title).toBe(`A & B <"x"> 'y'`);
  });

  it("finds children and reads numeric attributes", () => {
    const picture = child(document, "picture");
    expect(numberAttribute(picture, "width")).toBe(2480);
    expect(numberAttribute(picture, "missing")).toBeNull();
    expect(numberAttribute(undefined, "width")).toBeNull();
    expect(child(document, "nothing")).toBeUndefined();
    expect(childrenNamed(undefined, "system")).toEqual([]);
    expect(childrenNamed(child(document, "page"), "system")).toHaveLength(2);
  });

  it("rejects a document without elements", () => {
    expect(() => parseXml("<!-- nothing here -->")).toThrow("Empty XML document.");
  });
});

describe("readZip", () => {
  it("reads stored and deflated entries", () => {
    const zip = makeZip(
      { "book.xml": "<book/>", "sheet#1/sheet#1.xml": "<sheet/>" },
      { stored: ["book.xml"] },
    );
    const files = readZip(zip);
    expect(files.get("book.xml")?.toString()).toBe("<book/>");
    expect(files.get("sheet#1/sheet#1.xml")?.toString()).toBe("<sheet/>");
  });

  it("only extracts the entries that are wanted, skipping folders", () => {
    const zip = makeZip({ "images/": "", "a.xml": "a", "b.png": "b" });
    expect([...readZip(zip, (name) => name.endsWith(".xml")).keys()]).toEqual([
      "a.xml",
    ]);
  });

  it("rejects files that are not zips", () => {
    expect(() => readZip(Buffer.from("x".repeat(40)))).toThrow("Not a zip file.");
  });

  it("rejects a damaged directory or entry", () => {
    const zip = makeZip({ "a.xml": "a" });
    const directoryOffset = zip.readUInt32LE(zip.length - 6);

    const badDirectory = Buffer.from(zip);
    badDirectory.writeUInt32LE(0, directoryOffset);
    expect(() => readZip(badDirectory)).toThrow("Damaged zip directory.");

    const badEntry = Buffer.from(zip);
    badEntry.writeUInt32LE(0, 0);
    expect(() => readZip(badEntry)).toThrow("Damaged zip entry.");
  });

  it("rejects compression methods it cannot read", () => {
    const zip = makeZip({ "a.xml": "a" }, { stored: ["a.xml"], method: 12 });
    expect(() => readZip(zip)).toThrow("Unsupported zip compression 12.");
  });
});
