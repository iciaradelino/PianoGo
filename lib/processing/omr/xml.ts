/**
 * A small XML reader for the files Audiveris writes. They are generated, so
 * elements and attributes are all that matter: text, comments and CDATA are
 * skipped.
 */

export type XmlElement = {
  name: string;
  attributes: Record<string, string>;
  children: XmlElement[];
};

const TAG = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*"[^"]*")*)\s*(\/?)>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>/g;
const ATTRIBUTE = /([\w.:-]+)\s*=\s*"([^"]*)"/g;
const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decode(value: string) {
  return value.replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => ENTITIES[name]);
}

export function parseXml(text: string): XmlElement {
  const root: XmlElement = { name: "#document", attributes: {}, children: [] };
  const stack = [root];

  for (const match of text.matchAll(TAG)) {
    const [, closing, name, attributeText, selfClosing] = match;
    if (!name) continue;
    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const attributes: Record<string, string> = {};
    for (const [, key, value] of (attributeText ?? "").matchAll(ATTRIBUTE)) {
      attributes[key] = decode(value);
    }
    const element: XmlElement = { name, attributes, children: [] };
    stack[stack.length - 1].children.push(element);
    if (!selfClosing) stack.push(element);
  }

  const [document] = root.children;
  if (!document) throw new Error("Empty XML document.");
  return document;
}

export function child(element: XmlElement | undefined, name: string) {
  return element?.children.find((candidate) => candidate.name === name);
}

export function childrenNamed(element: XmlElement | undefined, name: string) {
  return element?.children.filter((candidate) => candidate.name === name) ?? [];
}

export function numberAttribute(element: XmlElement | undefined, name: string) {
  const value = Number(element?.attributes[name]);
  return Number.isFinite(value) ? value : null;
}
