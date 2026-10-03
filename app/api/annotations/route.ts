import {
  generateAnnotations,
  getAnnotation,
  updateAnnotationStyle,
} from "@/lib/processing/repository";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function readBody(request: Request) {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function GET(request: Request) {
  const sheetId = Number(new URL(request.url).searchParams.get("sheetId"));
  const annotation = getAnnotation(sheetId);
  if (!annotation) {
    return NextResponse.json({ error: "Sheet not found." }, { status: 404 });
  }
  return NextResponse.json(annotation);
}

export async function POST(request: Request) {
  const body = await readBody(request);
  if (!body) {
    return NextResponse.json(
      { error: "Could not generate annotations." },
      { status: 400 },
    );
  }

  const result = await generateAnnotations(Number(body.sheetId));
  if (!result.ok) {
    return result.reason === "no-reader"
      ? NextResponse.json(
          {
            error:
              "This looks like a scanned sheet. Reading scans needs Audiveris, which is not installed on this server.",
          },
          { status: 503 },
        )
      : NextResponse.json({ error: "Sheet not found." }, { status: 404 });
  }
  const processing = result.annotation.status === "processing";
  return NextResponse.json(result.annotation, { status: processing ? 202 : 201 });
}

export async function PATCH(request: Request) {
  const body = await readBody(request);
  if (!body) {
    return NextResponse.json(
      { error: "Could not save the annotation style." },
      { status: 400 },
    );
  }

  const annotation = updateAnnotationStyle(Number(body.sheetId), body.style);
  if (!annotation) {
    return NextResponse.json(
      { error: "Generate annotations for this sheet first." },
      { status: 404 },
    );
  }
  return NextResponse.json(annotation);
}
