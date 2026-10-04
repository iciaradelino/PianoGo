"use client";

import { FileMusic, Search } from "lucide-react";
import { Popover } from "radix-ui";
import { useMemo, useState } from "react";
import { SheetPreview } from "@/components/library/sheet-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettings } from "@/components/settings/settings-provider";
import type { Sheet } from "@/lib/library/model";

type SheetPickerProps = {
  sheets: Sheet[];
  onOpenSheet: (sheet: Sheet) => void;
};

/** The "Open sheet" button, with the library in a dropdown under it. */
export function SheetPicker({ sheets, onOpenSheet }: SheetPickerProps) {
  const { t } = useSettings();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return sheets;
    return sheets.filter(
      (sheet) =>
        sheet.title.toLocaleLowerCase().includes(normalized) ||
        sheet.composer.toLocaleLowerCase().includes(normalized),
    );
  }, [sheets, query]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  return (
    <Popover.Root onOpenChange={handleOpenChange} open={open}>
      <Popover.Trigger asChild>
        <Button size="sm" variant="outline">
          <FileMusic aria-hidden="true" />
          {t("piano.openSheet")}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          className="sheet-picker"
          collisionPadding={16}
          sideOffset={6}
        >
          {sheets.length > 0 ? (
            <>
              <div className="sheet-picker-search">
                <Search aria-hidden="true" />
                <Input
                  aria-label={t("library.search")}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("library.searchPlaceholder")}
                  type="search"
                  value={query}
                />
              </div>
              {matches.length > 0 ? (
                <ul className="sheet-picker-list">
                  {matches.map((sheet) => (
                    <li key={sheet.id}>
                      <button
                        onClick={() => {
                          onOpenSheet(sheet);
                          handleOpenChange(false);
                        }}
                        type="button"
                      >
                        <SheetPreview sheet={sheet} />
                        <span className="sheet-picker-text">
                          <span className="sheet-picker-title">{sheet.title}</span>
                          <span className="sheet-picker-composer">{sheet.composer}</span>
                          <span className="sheet-picker-difficulty">
                            {t(`difficulty.${sheet.difficulty}`)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sheet-picker-empty">{t("library.noMatch")}</p>
              )}
            </>
          ) : (
            <p className="sheet-picker-empty">{t("piano.noSheets")}</p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
