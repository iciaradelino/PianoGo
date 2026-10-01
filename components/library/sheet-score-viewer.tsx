"use client";

import type { Sheet } from "@/lib/library/model";

type SheetScoreViewerProps = {
  sheet: Sheet;
};

export function SheetScoreViewer({ sheet }: SheetScoreViewerProps) {
  const fileUrl = `/api/sheets/${sheet.id}/file`;

  if (sheet.fileType === "pdf") {
    return (
      <iframe
        className="sheet-document-frame"
        src={fileUrl}
        title={`${sheet.title} score`}
      />
    );
  }

  return (
    <div className="sheet-document-frame">
      <div className="sheet-document-fallback">
        <p>{sheet.originalFilename}</p>
        <a download href={fileUrl}>
          Download this MusicXML file
        </a>
      </div>
    </div>
  );
}
