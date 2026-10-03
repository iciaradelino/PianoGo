"use client";

import type { Sheet } from "@/lib/library/model";
import { useSettings } from "@/components/settings/settings-provider";

type SheetScoreViewerProps = {
  sheet: Sheet;
};

export function SheetScoreViewer({ sheet }: SheetScoreViewerProps) {
  const { t } = useSettings();
  const fileUrl = `/api/sheets/${sheet.id}/file`;

  if (sheet.fileType === "pdf") {
    return (
      <iframe
        className="sheet-document-frame"
        src={fileUrl}
        title={t("score.label", { title: sheet.title })}
      />
    );
  }

  return (
    <div className="sheet-document-frame">
      <div className="sheet-document-fallback">
        <p>{sheet.title}</p>
        <a download href={fileUrl}>
          {t("score.downloadMusicXml")}
        </a>
      </div>
    </div>
  );
}
