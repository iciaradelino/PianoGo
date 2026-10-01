import { NextResponse } from "next/server";
import { savePdfPreview } from "@/lib/library/preview";
import { createSheet } from "@/lib/library/repository";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Choose a PDF or MusicXML file." },
      { status: 400 },
    );
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const sheet = createSheet({
      title: String(formData.get("title") ?? ""),
      composer: String(formData.get("composer") ?? ""),
      difficulty: String(formData.get("difficulty") ?? ""),
      fileName: file.name,
      bytes,
    });
    if (sheet.fileType === "pdf") {
      try {
        savePdfPreview(sheet.id, bytes);
      } catch {
        // the library still saves the sheet and can render the card later
      }
    }
    return NextResponse.json(sheet);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The sheet could not be saved.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
