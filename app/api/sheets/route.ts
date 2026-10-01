import { createSheet, listSheets } from "@/lib/library/repository";
import { SheetInputError } from "@/lib/library/model";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(listSheets());
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Choose a PDF or MusicXML file." },
      { status: 400 },
    );
  }

  try {
    const sheet = createSheet({
      title: String(form.get("title") ?? ""),
      composer: String(form.get("composer") ?? ""),
      difficulty: String(form.get("difficulty") ?? ""),
      originalFilename: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    return NextResponse.json(sheet, { status: 201 });
  } catch (error) {
    if (error instanceof SheetInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
