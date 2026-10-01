import { readSheetFile } from "@/lib/library/repository";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type FileRouteContext = {
  params: Promise<{ id: string }>;
};

function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "");
  return `inline; filename="${ascii || "sheet"}"`;
}

export async function GET(_request: Request, context: FileRouteContext) {
  const { id } = await context.params;
  const sheetId = Number(id);
  const file = readSheetFile(sheetId);
  if (!file) {
    return NextResponse.json({ error: "Sheet not found." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type":
        file.fileType === "pdf" ? "application/pdf" : "application/xml",
      "Content-Disposition": contentDisposition(file.filename),
    },
  });
}
