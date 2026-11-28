"use client";

import {
  FileMusic,
  Info,
  LoaderCircle,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import {
  acceptedExtensions,
  difficulties,
  fileKind,
  type Difficulty,
  type FileType,
  type Sheet,
} from "@/lib/library/model";
import { libraryUrl, serviceFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettings } from "@/components/settings/settings-provider";
import { musicXmlFilePreview } from "@/components/processing/musicxml-preview";
import { loadPdfjs } from "@/components/processing/pdf-score";

const PREVIEW_WIDTH = 1100;

/** Draws the first page of a PDF the browser already has. */
async function pdfFilePreview(file: File) {
  const pdfjs = await loadPdfjs();
  const document = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  }).promise;
  try {
    const page = await document.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: PREVIEW_WIDTH / base.width });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) return null;
    await page.render({ canvasContext: context, viewport }).promise;
    return canvas.toDataURL("image/png");
  } finally {
    void document.destroy();
  }
}

type Preview = { file: File; src: string | null };

/** A first look at the chosen file, so people can check it before adding it. */
function useFilePreview(file: File | null, kind: FileType | null) {
  const [preview, setPreview] = useState<Preview>();

  useEffect(() => {
    if (!file || !kind) return;
    let cancelled = false;
    const job =
      kind === "pdf"
        ? pdfFilePreview(file)
        : musicXmlFilePreview(file, titleFromFileName(file.name));
    job
      .catch(() => null)
      .then((src) => {
        if (!cancelled) setPreview({ file, src });
      });
    return () => {
      cancelled = true;
    };
  }, [file, kind]);

  if (!file) return { loading: false, src: null };
  if (preview?.file !== file) return { loading: true, src: null };
  return { loading: false, src: preview.src };
}

type UploadViewProps = {
  /** Called with the new sheet, so the app can open it in the library. */
  onUploaded: (sheet: Sheet) => void;
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

export function UploadView({ onUploaded }: UploadViewProps) {
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
  const [saving, setSaving] = useState(false);
  const preview = useFilePreview(file, kind);

  function acceptFile(next: File) {
    const nextKind = fileKind(next.name);
    if (!nextKind) {
      setError(t("upload.wrongType"));
      return;
    }

    setFile(next);
    setKind(nextKind);
    setError("");
    // Keep a title the person typed, but follow the file while the title is
    // still the one filled in from the previous file's name.
    const previousTitle = file ? titleFromFileName(file.name) : "";
    setTitle((current) =>
      current.trim() && current !== previousTitle
        ? current
        : titleFromFileName(next.name),
    );
  }

  function openFilePicker() {
    inputRef.current?.click();
  }

  function clearFile() {
    setFile(null);
    setKind(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragging(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
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

    try {
      const response = await serviceFetch(libraryUrl("/sheets"), { method: "POST", body });
      const payload = (await response.json()) as Sheet | { error?: string };
      if (!response.ok || !("id" in payload)) {
        setError(("error" in payload && payload.error) || t("upload.failed"));
        return;
      }

      // Opening the sheet leaves this tab, which unmounts the form and so
      // resets it for the next upload.
      onUploaded(payload);
    } catch {
      setError(t("upload.failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="upload-view">
      <div
        className="upload-stage"
        data-dragging={dragging}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="score-toolbar upload-toolbar">
          {file && kind ? (
            <>
              <div className="upload-file">
                <FileMusic aria-hidden="true" size={16} strokeWidth={1.7} />
                <p>{file.name}</p>
                <span>
                  {fileLabel(kind)} · {formatFileSize(file.size)}
                </span>
              </div>
              <div className="upload-file-actions">
                <Button
                  disabled={saving}
                  onClick={openFilePicker}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <RefreshCw aria-hidden="true" data-icon="inline-start" />
                  {t("upload.replace")}
                </Button>
                <Button
                  aria-label={t("upload.removeFile")}
                  disabled={saving}
                  onClick={clearFile}
                  size="icon-sm"
                  title={t("upload.removeFile")}
                  type="button"
                  variant="ghost"
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
            </>
          ) : (
            <span className="upload-toolbar-title">{t("upload.preview")}</span>
          )}
        </div>

        <div className="upload-canvas">
          {file && kind ? (
            preview.src ? (
              // A data URL drawn in the browser, so next/image has nothing to optimise.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={t("upload.previewOf", { name: file.name })}
                className="upload-preview-page"
                src={preview.src}
              />
            ) : (
              <div className="upload-message">
                {preview.loading ? (
                  <>
                    <LoaderCircle
                      aria-hidden="true"
                      className="waking-spinner"
                      size={22}
                    />
                    <span>{t("upload.previewLoading")}</span>
                  </>
                ) : (
                  <>
                    <span className="upload-message-icon">
                      <FileMusic aria-hidden="true" size={22} strokeWidth={1.6} />
                    </span>
                    <span>{t("upload.previewUnavailable")}</span>
                  </>
                )}
              </div>
            )
          ) : (
            <div className="upload-dropzone">
              <span className="upload-message-icon">
                <Upload aria-hidden="true" size={22} strokeWidth={1.6} />
              </span>
              <p>{t("upload.dragHere")}</p>
              <span>{t("upload.or")}</span>
              <Button onClick={openFilePicker} type="button" variant="outline">
                {t("upload.browse")}
              </Button>
              <div aria-label={t("upload.formats")} className="upload-formats">
                <span>PDF</span>
                <span>MusicXML</span>
                <span>MXL</span>
              </div>
            </div>
          )}
        </div>

        {dragging ? (
          <div aria-hidden="true" className="upload-drop-overlay">
            <Upload size={22} strokeWidth={1.6} />
            <p>{file ? t("upload.dropToReplace") : t("upload.dropNow")}</p>
          </div>
        ) : null}

        <input
          accept={acceptedExtensions.join(",")}
          aria-label={t("upload.chooseFileLabel")}
          className="upload-file-input"
          onChange={(event) => {
            const next = event.target.files?.[0];
            if (next) acceptFile(next);
          }}
          ref={inputRef}
          tabIndex={-1}
          type="file"
        />
      </div>

      <form className="sheet-inspector upload-form" onSubmit={handleSubmit}>
        <section>
          <h2>{t("upload.details")}</h2>

          <label className="sheet-field">
            <span>{t("upload.title")}</span>
            <Input
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("upload.titlePlaceholder")}
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

          <div className="sheet-field">
            <span id="upload-difficulty">{t("upload.difficulty")}</span>
            <div
              aria-labelledby="upload-difficulty"
              className="segmented-control"
              role="radiogroup"
            >
              {difficulties.map((option) => (
                <button
                  aria-checked={difficulty === option}
                  key={option}
                  onClick={() => setDifficulty(option)}
                  role="radio"
                  type="button"
                >
                  {t(`difficulty.${option}`)}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="upload-tips">
          <h2>{t("upload.tips")}</h2>
          <ul>
            <li>
              <Info aria-hidden="true" size={14} />
              {t("upload.tipMusicXml")}
            </li>
            <li>
              <Info aria-hidden="true" size={14} />
              {t("upload.tipPdf")}
            </li>
            <li>
              <Info aria-hidden="true" size={14} />
              {t("upload.tipScan")}
            </li>
          </ul>
        </section>

        <div className="upload-submit">
          {error ? (
            <p className="upload-error" role="alert">
              {error}
            </p>
          ) : null}
          <Button disabled={saving || !file} size="lg" type="submit">
            {saving ? (
              <LoaderCircle
                aria-hidden="true"
                className="waking-spinner"
                data-icon="inline-start"
              />
            ) : null}
            {saving ? t("upload.adding") : t("upload.add")}
          </Button>
        </div>
      </form>
    </section>
  );
}
