import { readOmrProject } from "@/lib/processing/omr/read-omr";
import { makeZip } from "../helpers/zip";

/** A staff whose five lines are `space` apart, bottom line at `bottom`. */
function staff(id: string, bottom: number, space = 20) {
  const lines = [4, 3, 2, 1, 0]
    .map((line) => bottom - line * space)
    .map((y) => `<line><point x="0" y="${y}"/><point x="1000" y="${y}"/></line>`)
    .join("");
  return `<staff id="${id}"><lines>${lines}</lines></staff>`;
}

function bounds(x: number, y = 100) {
  return `<bounds x="${x}" y="${y}" w="20" h="16"/>`;
}

// Picture is twice the size of the PDF page, so positions are halved.
const sheet1 = `<?xml version="1.0"?>
<sheet number="1">
  <picture width="1200" height="1600"/>
  <scale><interline main="20"/></scale>
  <page>
    <system>
      <part>${staff("1", 180)}${staff("2", 400)}</part>
      <stack left="100" right="500"/>
      <stack left="500" right="900"/>
      <sig>
        <inters>
          <clef id="10" staff="1" shape="G_CLEF" pitch="2">${bounds(50)}</clef>
          <key id="11" staff="1" fifths="1">${bounds(90)}</key>
          <head id="12" staff="1" pitch="0">${bounds(150, 132)}</head>
          <head id="13" staff="1" pitch="-4">${bounds(200)}</head>
          <alter id="14" staff="1" shape="FLAT">${bounds(230)}</alter>
          <head id="15" staff="1" pitch="0">${bounds(250)}</head>
          <head id="16" staff="1" pitch="0">${bounds(300)}</head>
          <head id="17" staff="1" pitch="0">${bounds(600)}</head>
          <clef id="20" staff="2" shape="F_CLEF" pitch="-2">${bounds(50)}</clef>
          <head id="21" staff="2" pitch="-2">${bounds(150)}</head>
          <head id="22" staff="2" pitch="4">${bounds(600)}</head>
          <head id="30" staff="9" pitch="0">${bounds(150)}</head>
          <head id="31" staff="1" pitch="0"/>
          <head id="32" staff="1">${bounds(150)}</head>
          <clef id="33" staff="1" shape="PERCUSSION_CLEF" pitch="0">${bounds(400)}</clef>
          <alter id="34" staff="1" shape="CAUTIONARY">${bounds(410)}</alter>
        </inters>
        <relations>
          <relation source="14" target="15"><alter-head/></relation>
          <relation source="12" target="13"><beam-stem/></relation>
          <relation source="99" target="16"><alter-head/></relation>
        </relations>
      </sig>
    </system>
  </page>
</sheet>`;

// A cover page Audiveris could not read.
const sheet2 = `<sheet number="2"><picture width="1200" height="1600"/></sheet>`;

const sheet3 = `<sheet number="3">
  <picture width="600" height="800"/>
  <scale><interline main="10"/></scale>
  <page>
    <system>
      <part>${staff("1", 180)}</part>
      <stack left="0" right="1000"/>
      <sig><inters>
        <head id="1" staff="1" pitch="-4">${bounds(100)}</head>
        <clef id="2" staff="1" shape="G_CLEF_8VB" pitch="2">${bounds(200)}</clef>
        <head id="3" staff="1" pitch="-4">${bounds(300)}</head>
        <key id="4" staff="1" fifths="-2">${bounds(350)}</key>
        <head id="5" staff="1" pitch="0">${bounds(400)}</head>
      </inters></sig>
    </system>
  </page>
</sheet>`;

// Audiveris sheet 1 was read from PDF page 2; sheet 3 is not listed.
const book = `<book>
  <sheet number="1"><input><path>score.pdf</path><number>2</number></input></sheet>
  <sheet number="2"><input><number>3</number></input></sheet>
</book>`;

const pageSize = { width: 600, height: 800 };

function names(notes: { step: string; alter: number; octave: number; measure: number; page: number }[]) {
  return notes.map(
    (note) =>
      `p${note.page} ${note.step}${note.alter > 0 ? "#" : note.alter < 0 ? "b" : ""}${note.octave}@${note.measure}`,
  );
}

describe("readOmrProject", () => {
  const project = makeZip({
    "book.xml": book,
    "sheet#1/sheet#1.xml": sheet1,
    "sheet#2/sheet#2.xml": sheet2,
    "sheet#3/sheet#3.xml": sheet3,
    "sheet#1/BINARY.png": "not read",
  });
  const notes = readOmrProject(project, [pageSize, pageSize, pageSize, pageSize]);

  it("names every notehead through clefs, keys and accidentals", () => {
    expect(names(notes)).toEqual([
      // Sheet 1, treble staff, key of G.
      "p2 B4@1",
      "p2 F#5@1",
      "p2 Bb4@1",
      "p2 Bb4@1",
      "p2 B4@2",
      // Sheet 1, bass staff.
      "p2 F3@1",
      "p2 G2@2",
      // Sheet 3 carries on from sheet 1's clef, key and bar count.
      "p3 F#5@3",
      "p3 F#4@3",
      "p3 Bb3@3",
    ]);
  });

  it("scales positions from the scanned image to the PDF page", () => {
    expect(notes[0]).toEqual({
      page: 2,
      x: 75,
      y: 66,
      width: 10,
      height: 8,
      staffSpace: 10,
      staffBottom: 90,
      step: "B",
      alter: 0,
      octave: 4,
      measure: 1,
    });
  });

  it("returns no notes when the pages are unknown", () => {
    expect(readOmrProject(project, [])).toEqual([]);
  });

  it("falls back to sheet numbers when there is no book.xml", () => {
    const withoutBook = makeZip({ "sheet#3/sheet#3.xml": sheet3 });
    expect(names(readOmrProject(withoutBook, [pageSize, pageSize, pageSize]))).toEqual([
      "p3 F5@1",
      "p3 F4@1",
      "p3 Bb3@1",
    ]);
  });
});
