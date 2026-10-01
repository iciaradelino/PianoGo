"use client";

import { FileMusic, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  Difficulty,
  PracticeStatus,
  Sheet,
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
            aria-label="Search sheets"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title or composer"
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
          <SelectTrigger aria-label="Filter by difficulty">
            <SelectValue placeholder="Difficulty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All difficulties</SelectItem>
            <SelectItem value="Beginner">Beginner</SelectItem>
            <SelectItem value="Intermediate">Intermediate</SelectItem>
            <SelectItem value="Advanced">Advanced</SelectItem>
          </SelectContent>
        </Select>

        <Select
          onValueChange={(value) => setStatus(value as "all" | PracticeStatus)}
          value={status}
        >
          <SelectTrigger aria-label="Filter by practice status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="Not started">Not started</SelectItem>
            <SelectItem value="In progress">In progress</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="library-count">
        {sheets.length} {sheets.length === 1 ? "sheet" : "sheets"}
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
              aria-label={`Open ${sheet.title}`}
              className="sheet-card-button"
              key={sheet.id}
              onClick={() => onSelectSheet(sheet)}
              type="button"
            >
              <Card className="sheet-card" size="sm">
                <div className="sheet-preview" aria-hidden="true">
                  <FileMusic size={28} strokeWidth={1.4} />
                  <span />
                </div>
                <CardHeader>
                  <CardTitle>{sheet.title}</CardTitle>
                  <CardDescription>{sheet.composer}</CardDescription>
                </CardHeader>
                <CardFooter className="sheet-card-footer">
                  <Badge variant="outline">{sheet.difficulty}</Badge>
                  <Badge variant="secondary">{sheet.status}</Badge>
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
              ? "No sheets yet."
              : "No sheets match these filters."}
          </p>
        </div>
      )}
    </section>
  );
}
