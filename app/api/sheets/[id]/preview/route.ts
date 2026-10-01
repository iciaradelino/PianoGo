import { sheetPreview } from "@/lib/library/preview";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type PreviewRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: PreviewRouteContext) {
  const { id } = await context.params;
  const png = await sheetPreview(Number(id));
  if (!png) {
    return NextResponse.json({ error: "Preview not available." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
