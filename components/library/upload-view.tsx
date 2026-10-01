"use client";

import { FileMusic, Upload, X } from "lucide-react";
import { useRef, useState, type DragEvent, type FormEvent } from "react";
import {
  acceptedExtensions,
  fileKind,
  type Difficulty,
  type FileType,
} from "@/lib/library/model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type UploadViewProps = {
  onUploaded: () => void;
  onOpenLibrary: () => void;
};

function fileLabel(kind: FileType) {
  return kind === "pdf" ? "PDF" : "MusicXML";
}

function titleFromFileName(name: string) {
  const base = name.replace(/\.[^.]+$/, "");
  return base.replace(/[_-]+/g, " ").trim();
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadView({ onUploaded, onOpenLibrary }: UploadViewProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<FileType | null>(null);
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState("");
  const [composer, setComposer] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("Beginner");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  function acceptFile(next: File) {
    const nextKind = fileKind(next.name);
    if (!nextKind) {
      setError("Use a PDF or MusicXML file.");
      return;
    }

    setFile(next);
    setKind(nextKind);
    setError("");
    setNotice("");
    setTitle((current) => (current.trim() ? current : titleFromFileName(next.name)));
  }

  function clearFile() {
    setFile(null);
    setKind(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleDragEnter(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragging(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const next = event.dataTransfer.files[0];
    if (next) acceptFile(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!file || !kind) {
      setError("Choose a PDF or MusicXML file.");
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Add a title.");
      return;
    }

    const body = new FormData();
    body.set("file", file);
    body.set("title", trimmedTitle);
    body.set("composer", composer.trim());
    body.set("difficulty", difficulty);

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/sheets", { method: "POST", body });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not add this sheet.");
        return;
      }

      onUploaded();
      clearFile();
      setTitle("");
      setComposer("");
      setDifficulty("Beginner");
      setNotice(`${trimmedTitle} added to your library.`);
    } catch {
      setError("Could not add this sheet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="upload-view">
      <form className="upload-form" onSubmit={handleSubmit}>
        {file && kind ? (
          <div className="upload-file">
            <FileMusic aria-hidden="true" size={18} strokeWidth={1.6} />
            <div>
              <p>{file.name}</p>
              <span>
                {fileLabel(kind)} · {formatFileSize(file.size)}
              </span>
            </div>
            <Button
              aria-label="Remove file"
              disabled={saving}
              onClick={clearFile}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <label
            className="upload-dropzone"
            data-dragging={dragging}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <Upload aria-hidden="true" size={22} strokeWidth={1.6} />
            <p>Drop a sheet here, or browse</p>
            <span>PDF or MusicXML</span>
            <input
              accept={acceptedExtensions.join(",")}
              aria-label="Choose a sheet file"
              className="upload-file-input"
              onChange={(event) => {
                const next = event.target.files?.[0];
                if (next) acceptFile(next);
              }}
              ref={inputRef}
              type="file"
            />
          </label>
        )}

        <label className="sheet-field">
          <span>Title</span>
          <Input
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
        </label>

        <label className="sheet-field">
          <span>Composer</span>
          <Input
            onChange={(event) => setComposer(event.target.value)}
            placeholder="Optional"
            value={composer}
          />
        </label>

        <label className="sheet-field">
          <span>Difficulty</span>
          <Select
            onValueChange={(value) => setDifficulty(value as Difficulty)}
            value={difficulty}
          >
            <SelectTrigger aria-label="Difficulty">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Beginner">Beginner</SelectItem>
              <SelectItem value="Intermediate">Intermediate</SelectItem>
              <SelectItem value="Advanced">Advanced</SelectItem>
            </SelectContent>
          </Select>
        </label>

        {error ? <p className="upload-error">{error}</p> : null}
        {notice ? (
          <p className="upload-notice">
            {notice}{" "}
            <button onClick={onOpenLibrary} type="button">
              View in library
            </button>
          </p>
        ) : null}

        <Button disabled={saving} type="submit">
          {saving ? "Adding…" : "Add to library"}
        </Button>
      </form>
    </section>
  );
}
