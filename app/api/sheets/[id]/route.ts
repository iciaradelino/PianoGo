import { deleteSheet, updateSheet } from "@/lib/library/repository";
import { SheetInputError } from "@/lib/library/model";
import { deleteAnnotations } from "@/lib/processing/repository";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type SheetRouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: SheetRouteContext) {
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Could not save this sheet." },
      { status: 400 },
    );
  }

  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  try {
    const sheet = updateSheet(Number(id), {
      title: String(record.title ?? ""),
      composer: String(record.composer ?? ""),
      difficulty: String(record.difficulty ?? ""),
      status: String(record.status ?? ""),
    });
    if (!sheet) {
      return NextResponse.json({ error: "Sheet not found." }, { status: 404 });
    }
    return NextResponse.json(sheet);
  } catch (error) {
    if (error instanceof SheetInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function DELETE(_request: Request, context: SheetRouteContext) {
  const { id } = await context.params;
  // Annotations reference the sheet, so they have to go first.
  deleteAnnotations(Number(id));
  if (!deleteSheet(Number(id))) {
    return NextResponse.json({ error: "Sheet not found." }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
