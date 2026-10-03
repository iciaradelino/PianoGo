"use client";

import { FileMusic, Upload, X } from "lucide-react";
import { useRef, useState, type DragEvent, type FormEvent } from "react";
import {
  acceptedExtensions,
  difficulties,
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
import { useSettings } from "@/components/settings/settings-provider";

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
  const { t } = useSettings();
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
      setError(t("upload.wrongType"));
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
      setError(t("upload.chooseFile"));
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(t("upload.addTitle"));
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
        setError(payload.error ?? t("upload.failed"));
        return;
      }

      onUploaded();
      clearFile();
      setTitle("");
      setComposer("");
      setDifficulty("Beginner");
      setNotice(t("upload.added", { title: trimmedTitle }));
    } catch {
      setError(t("upload.failed"));
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
              aria-label={t("upload.removeFile")}
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
            <p>{t("upload.drop")}</p>
            <span>{t("upload.formats")}</span>
            <input
              accept={acceptedExtensions.join(",")}
              aria-label={t("upload.chooseFileLabel")}
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
          <span>{t("upload.title")}</span>
          <Input
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
        </label>

        <label className="sheet-field">
          <span>{t("upload.composer")}</span>
          <Input
            onChange={(event) => setComposer(event.target.value)}
            placeholder={t("upload.optional")}
            value={composer}
          />
        </label>

        <label className="sheet-field">
          <span>{t("upload.difficulty")}</span>
          <Select
            onValueChange={(value) => setDifficulty(value as Difficulty)}
            value={difficulty}
          >
            <SelectTrigger aria-label={t("upload.difficulty")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {difficulties.map((option) => (
                <SelectItem key={option} value={option}>
                  {t(`difficulty.${option}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        {error ? <p className="upload-error">{error}</p> : null}
        {notice ? (
          <p className="upload-notice">
            {notice}{" "}
            <button onClick={onOpenLibrary} type="button">
              {t("upload.viewInLibrary")}
            </button>
          </p>
        ) : null}

        <Button disabled={saving} type="submit">
          {saving ? t("upload.adding") : t("upload.add")}
        </Button>
      </form>
    </section>
  );
}
