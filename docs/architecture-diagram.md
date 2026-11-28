# Architecture

## Before: the Assignment 1 monolith

One Node.js process served the UI and the API. The two domains were folders in `lib/`, shared one SQLite file, and met at one function call, `readSheetFile(id)` (ADR-2).

```mermaid
flowchart TB
  subgraph Browser["Browser (React client components)"]
    UI["AppShell · LibraryView · UploadView<br/>SheetDetailView · PianoView · SettingsView"]
    Render["OpenSheetMusicDisplay (MusicXML)<br/>pdf.js viewer + label overlay<br/>Web Audio (playNote)"]
    LS[("localStorage<br/>language, theme")]
    UI --- Render
    UI --- LS
  end

  subgraph Proc["Single Node.js process: next start -H 0.0.0.0 (PORT)"]
    subgraph Routes["app/api route handlers (thin HTTP layer)"]
      RS["/api/sheets<br/>/api/sheets/[id]<br/>/api/sheets/[id]/file<br/>/api/sheets/[id]/preview"]
      RA["/api/annotations<br/>/api/annotations/notes"]
    end

    subgraph Lib["lib/library (Domain 1: Sheet library)"]
      LM["model.ts<br/>input validation"]
      LR["repository.ts<br/>createSheet · listSheets · updateSheet<br/>deleteSheet · readSheetFile"]
      LP["preview.ts<br/>page-1 PNG (pdf.js + @napi-rs/canvas)"]
    end

    subgraph Pro["lib/processing (Domain 2: Music processing)"]
      PR["repository.ts<br/>generateAnnotations · getAnnotation<br/>getPdfNotes · updateAnnotationStyle<br/>deleteAnnotations"]
      PS["annotation-style.ts · solfege.ts"]
      PDF["pdf/: extract · read-page<br/>find-notes · music-glyphs"]
      OMR["omr/: audiveris (queue) · read-omr<br/>xml · zip"]
    end

    DB["lib/db.ts<br/>getDb(): schema + migrations"]
  end

  SQL[("SQLite<br/>$DATA_DIR/pianogo.db")]
  FS[("$DATA_DIR/uploads/<br/>$DATA_DIR/previews/")]
  AUD["Audiveris (optional local program,<br/>spawned on demand for scanned PDFs)"]

  UI -- "fetch JSON / files" --> RS
  UI -- "fetch JSON" --> RA
  RS --> LR
  RS --> LP
  RS -. "DELETE also calls<br/>deleteAnnotations" .-> PR
  RA --> PR
  LR --> LM
  PR --> PS
  PR --> PDF
  PR --> OMR
  PR -- "readSheetFile(id)<br/>(the only cross-domain call)" --> LR
  LR --> DB
  PR --> DB
  DB --> SQL
  LR --> FS
  LP --> FS
  OMR -- "child_process.spawn" --> AUD
```

## After: two services and a static UI (Assignment 2)

The seam is where ADR-2 put it (ADR-6). Each service has its own container and its own database, and the only server-side call across the seam is processing fetching a sheet's file from library. The browser calls both services directly. Names are the Azure ones; locally the same containers run in `docker-compose.yml` (UI on `:8080`, library on `:8001`, processing on `:8002`, one SQL Server with both databases).

```mermaid
flowchart TB
  subgraph Browser["Browser: static Next.js export (ui/)"]
    UI["AppShell · LibraryView · UploadView<br/>SheetDetailView · PianoView · SettingsView"]
    Render["OpenSheetMusicDisplay (MusicXML)<br/>pdf.js viewer + label overlay<br/>Web Audio"]
    API["lib/api.ts: serviceFetch<br/>(waits for cold starts, ADR-8)"]
    CFG["config.js<br/>libraryUrl · processingUrl"]
    UI --- Render
    UI --> API
    API --- CFG
  end

  STATIC[("Static website<br/>iadelinoieu2024ui ($web)")]

  subgraph LIB["library: Container App iadelino-ieu2024-library"]
    LR["routes.ts<br/>GET/POST /sheets · PATCH/DELETE /sheets/{id}<br/>GET /sheets/{id}/file · GET /sheets/{id}/preview<br/>GET /health"]
    LRepo["repository.ts · model.ts"]
    LPrev["preview.ts<br/>PNG cache in memory"]
    LMig["migrate.ts<br/>runs migrations at startup"]
    LR --> LRepo
    LR --> LPrev
  end

  subgraph PRO["processing: Container App iadelino-ieu2024-processing"]
    PR["routes.ts<br/>GET/POST/PATCH/DELETE /annotations<br/>GET /annotations/notes · GET /health"]
    PRepo["repository.ts<br/>generateAnnotations · getAnnotation · …"]
    PDF["pdf/: read notes from vector PDFs"]
    LC["library-client.ts<br/>fetch with a 10 s timeout"]
    PMig["migrate.ts<br/>runs migrations at startup"]
    PR --> PRepo
    PRepo --> PDF
    PRepo --> LC
  end

  LDB[("Azure SQL serverless<br/>iadelino-ieu2024-library-db<br/>sheets (with file bytes)")]
  PDB[("Azure SQL serverless<br/>iadelino-ieu2024-processing-db<br/>annotations · pdf_notes")]

  STATIC -- "HTML, JS, config.js" --> Browser
  API -- "HTTPS, CORS: sheets, files, previews" --> LR
  API -- "HTTPS, CORS: annotations, notes, style" --> PR
  LC == "THE SEAM: GET /sheets/{id}/file<br/>404 → 404 · timeout / 5xx / refused → 503" ==> LR
  LRepo --> LDB
  LMig --> LDB
  PRepo --> PDB
  PMig --> PDB
```

What changed from the monolith:

| Monolith | Split system |
| --- | --- |
| `readSheetFile(id)`, a function call | `GET /sheets/{id}/file` over HTTP, with a timeout and a designed 503 |
| one SQLite file, `annotations.sheet_id` a foreign key to `sheets` | one database per service, `sheet_id` a plain id (ADR-7) |
| `DELETE /api/sheets/[id]` deleted annotations and the sheet | the UI deletes the sheet in library, then the annotation in processing (best effort) |
| uploads and previews on the local disk | file bytes in `sheets.file_bytes`, previews in memory only |
| schema created on first boot | numbered migrations, applied at startup (ADR-7) |
| scanned PDFs read with Audiveris | not on Azure: scans answer 503 (ADR-10) |
