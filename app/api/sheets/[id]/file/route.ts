import { NextResponse } from "next/server";
import { openSheetFile } from "@/lib/library/repository";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const sheetId = Number(id);
  if (!Number.isInteger(sheetId) || sheetId <= 0) {
    return NextResponse.json({ error: "Sheet not found." }, { status: 404 });
  }

  const file = openSheetFile(sheetId);
  if (!file) {
    return NextResponse.json({ error: "Sheet not found." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": contentType(file.filename, file.fileType),
      "Content-Disposition": `inline; filename="${safeFilename(file.filename)}"`,
    },
  });
}

function contentType(filename: string, fileType: "pdf" | "musicxml") {
  const lower = filename.toLowerCase();
  if (fileType === "pdf" || lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".mxl")) return "application/vnd.recordare.musicxml";
  return "application/vnd.recordare.musicxml+xml";
}

function safeFilename(filename: string) {
  return filename.replace(/["\r\n]/g, "") || "sheet";
}
