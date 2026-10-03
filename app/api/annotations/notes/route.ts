import { getPdfNotes } from "@/lib/processing/repository";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const sheetId = Number(new URL(request.url).searchParams.get("sheetId"));
  return NextResponse.json({ notes: getPdfNotes(sheetId) });
}
