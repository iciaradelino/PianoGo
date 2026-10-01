import { NextResponse } from "next/server";
import { openSheetFile } from "@/lib/library/repository";
import { readSheetPreview, savePdfPreview } from "@/lib/library/preview";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const sheetId = Number(id);
  if (!Number.isInteger(sheetId) || sheetId <= 0) {
    return NextResponse.json({ error: "Sheet not found." }, { status: 404 });
  }

  const png = previewFor(sheetId);
  if (!png) {
    return NextResponse.json({ error: "Preview not found." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=86400",
    },
  });
}

function previewFor(sheetId: number) {
  const existing = readSheetPreview(sheetId);
  if (existing) return existing;

  const file = openSheetFile(sheetId);
  if (!file || file.fileType !== "pdf") return null;

  try {
    return savePdfPreview(sheetId, file.bytes);
  } catch {
    return null;
  }
}
