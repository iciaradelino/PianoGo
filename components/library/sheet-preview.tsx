"use client";

import { FileMusic } from "lucide-react";
import { useEffect, useState } from "react";
import { musicXmlPreview } from "@/components/processing/musicxml-preview";
import type { Sheet } from "@/lib/library/model";

function useMusicXmlPreview(sheet: Sheet) {
  const fileUrl = `/api/sheets/${sheet.id}/file`;
  const enabled = sheet.fileType !== "pdf";
  const [rendered, setRendered] = useState<{ url: string; src: string | null }>();

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void musicXmlPreview(fileUrl, sheet.title).then((src) => {
      if (!cancelled) setRendered({ url: fileUrl, src });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, fileUrl, sheet.title]);

  return enabled && rendered?.url === fileUrl ? rendered.src : null;
}

export function SheetPreview({ sheet }: { sheet: Sheet }) {
  const [failed, setFailed] = useState(false);
  const musicXmlSrc = useMusicXmlPreview(sheet);
  const src =
    sheet.fileType === "pdf" ? `/api/sheets/${sheet.id}/preview` : musicXmlSrc;

  return (
    <div className="sheet-preview" aria-hidden="true">
      {src && !failed ? (
        <img
          alt=""
          className="sheet-preview-image"
          onError={() => setFailed(true)}
          src={src}
        />
      ) : (
        <FileMusic size={28} strokeWidth={1.4} />
      )}
    </div>
  );
}
