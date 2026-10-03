import { getAnnotationStatus, markAnnotated } from "@/lib/processing/repository";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const sheetId = Number(new URL(request.url).searchParams.get("sheetId"));
  const status = getAnnotationStatus(sheetId);
  if (!status) {
    return NextResponse.json({ error: "Sheet not found." }, { status: 404 });
  }
  return NextResponse.json({ sheetId, status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Could not generate annotations." },
      { status: 400 },
    );
  }

  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const sheetId = Number(record.sheetId);
  const status = markAnnotated(sheetId);
  if (!status) {
    return NextResponse.json(
      { error: "Annotations are available for MusicXML sheets only." },
      { status: 404 },
    );
  }
  return NextResponse.json({ sheetId, status }, { status: 201 });
}
