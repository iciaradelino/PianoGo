"use client";

import { FileMusic, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  difficulties,
  practiceStatuses,
  type Difficulty,
  type PracticeStatus,
  type Sheet,
} from "@/lib/library/model";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { musicXmlPreview } from "@/components/processing/musicxml-preview";
import { useSettings } from "@/components/settings/settings-provider";

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

function SheetPreview({ sheet }: { sheet: Sheet }) {
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

type LibraryViewProps = {
  sheets: Sheet[];
  loadError?: string;
  onSelectSheet: (sheet: Sheet) => void;
};

export function LibraryView({
  sheets: allSheets,
  loadError = "",
  onSelectSheet,
}: LibraryViewProps) {
  const { t } = useSettings();
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState<"all" | Difficulty>("all");
  const [status, setStatus] = useState<"all" | PracticeStatus>("all");

  const sheets = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    return allSheets.filter((sheet) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        sheet.title.toLocaleLowerCase().includes(normalizedQuery) ||
        sheet.composer.toLocaleLowerCase().includes(normalizedQuery);
      const matchesDifficulty =
        difficulty === "all" || sheet.difficulty === difficulty;
      const matchesStatus = status === "all" || sheet.status === status;

      return matchesQuery && matchesDifficulty && matchesStatus;
    });
  }, [allSheets, difficulty, query, status]);

  return (
    <section className="library-view">
      <div className="library-toolbar">
        <div className="library-search">
          <Search aria-hidden="true" size={16} />
          <Input
            aria-label={t("library.search")}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("library.searchPlaceholder")}
            type="search"
            value={query}
          />
        </div>

        <Select
          onValueChange={(value) =>
            setDifficulty(value as "all" | Difficulty)
          }
          value={difficulty}
        >
          <SelectTrigger aria-label={t("library.filterDifficulty")}>
            <SelectValue placeholder={t("library.difficulty")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("library.allDifficulties")}</SelectItem>
            {difficulties.map((option) => (
              <SelectItem key={option} value={option}>
                {t(`difficulty.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          onValueChange={(value) => setStatus(value as "all" | PracticeStatus)}
          value={status}
        >
          <SelectTrigger aria-label={t("library.filterStatus")}>
            <SelectValue placeholder={t("library.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("library.allStatuses")}</SelectItem>
            {practiceStatuses.map((option) => (
              <SelectItem key={option} value={option}>
                {t(`status.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="library-count">
        {t(sheets.length === 1 ? "library.countOne" : "library.countOther", {
          count: sheets.length,
        })}
      </p>

      {loadError ? (
        <div className="library-empty">
          <FileMusic aria-hidden="true" size={24} strokeWidth={1.4} />
          <p>{loadError}</p>
        </div>
      ) : sheets.length > 0 ? (
        <div className="sheet-grid">
          {sheets.map((sheet) => (
            <button
              aria-label={t("library.open", { title: sheet.title })}
              className="sheet-card-button"
              key={sheet.id}
              onClick={() => onSelectSheet(sheet)}
              type="button"
            >
              <Card className="sheet-card" size="sm">
                <SheetPreview sheet={sheet} />
                <CardHeader>
                  <CardTitle>{sheet.title}</CardTitle>
                  <CardDescription>{sheet.composer}</CardDescription>
                </CardHeader>
                <CardFooter className="sheet-card-footer">
                  <Badge variant="outline">
                    {t(`difficulty.${sheet.difficulty}`)}
                  </Badge>
                  <Badge variant="secondary">
                    {t(`status.${sheet.status}`)}
                  </Badge>
                </CardFooter>
              </Card>
            </button>
          ))}
        </div>
      ) : (
        <div className="library-empty">
          <FileMusic aria-hidden="true" size={24} strokeWidth={1.4} />
          <p>
            {allSheets.length === 0
              ? t("library.empty")
              : t("library.noMatch")}
          </p>
        </div>
      )}
    </section>
  );
}
