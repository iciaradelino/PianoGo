# Databases

Each service owns one Azure SQL database (in compose, one SQL Server with two databases) and creates its tables only through its own migrations (ADR-7). These diagrams match `services/library/migrations/` (001 and 002) and `services/processing/migrations/` (001). Each service user can only open its own database, so there are no foreign keys between them: `annotations.sheet_id` refers to a library sheet by value.

## library: `iadelino-ieu2024-library-db`

```mermaid
erDiagram
  sheets {
    INT id PK "IDENTITY"
    NVARCHAR(200) title "NOT NULL"
    NVARCHAR(200) composer "NOT NULL"
    NVARCHAR(20) difficulty "CHECK: Beginner | Intermediate | Advanced"
    NVARCHAR(255) original_filename "NOT NULL"
    NVARCHAR(10) file_type "CHECK: pdf | musicxml"
    VARBINARY(MAX) file_bytes "the uploaded file, NOT NULL"
    NVARCHAR(20) practice_status "CHECK: Not started | In progress | Completed, default Not started"
    DATETIME2 created_at "default SYSUTCDATETIME()"
    DATETIME2 updated_at "002: backfilled from created_at, set on every edit"
  }

  health_check {
    INT id PK "CHECK id = 1, one row"
    DATETIME2 checked_at "written and read by GET /health"
  }

  schema_migrations {
    NVARCHAR(10) version PK "001, 002"
    NVARCHAR(200) name
    CHAR(64) checksum "SHA-256 of the file"
    DATETIME2 applied_at
  }
```

## processing: `iadelino-ieu2024-processing-db`

```mermaid
erDiagram
  annotations ||--o{ pdf_notes : contains

  annotations {
    INT id PK "IDENTITY"
    INT sheet_id UK "a library sheet id, no foreign key (ADR-6)"
    NVARCHAR(20) status "CHECK: processing | ready | failed"
    NVARCHAR(MAX) style "CHECK ISJSON, default {}"
    DATETIME2 created_at "default SYSUTCDATETIME()"
  }

  pdf_notes {
    INT id PK "IDENTITY"
    INT annotation_id FK "REFERENCES annotations(id)"
    INT page "index ix_pdf_notes_annotation (annotation_id, page)"
    FLOAT x
    FLOAT y
    FLOAT width
    FLOAT height
    FLOAT staff_space
    FLOAT staff_bottom
    NCHAR(1) step "CHECK: C | D | E | F | G | A | B"
    INT alteration "semitones: -1 flat, 0, +1 sharp"
    INT octave
    INT measure
    INT piano_key_index "0 = A0 ... 87 = C8"
  }

  health_check {
    INT id PK "CHECK id = 1, one row"
    DATETIME2 checked_at "written and read by GET /health"
  }

  schema_migrations {
    NVARCHAR(10) version PK "001"
    NVARCHAR(200) name
    CHAR(64) checksum "SHA-256 of the file"
    DATETIME2 applied_at
  }
```

## Before: the Assignment 1 SQLite database

One file, `$DATA_DIR/pianogo.db`, with all three tables and a real foreign key across the domains. Uploaded files were on disk, referenced by `file_path`.

```mermaid
erDiagram
  sheets ||--o| annotations : "annotated as (sheet_id UNIQUE)"
  annotations ||--o{ pdf_notes : "contains"

  sheets {
    INTEGER id PK
    TEXT title "NOT NULL"
    TEXT composer "NOT NULL"
    TEXT difficulty "Beginner | Intermediate | Advanced"
    TEXT original_filename "NOT NULL"
    TEXT file_path "relative to DATA_DIR/uploads"
    TEXT file_type "pdf | musicxml"
    TEXT practice_status "Not started | In progress | Completed"
    TEXT created_at "ISO timestamp"
  }

  annotations {
    INTEGER id PK
    INTEGER sheet_id FK "UNIQUE, REFERENCES sheets(id)"
    TEXT status "processing | ready | failed"
    TEXT style "JSON, default '{}'"
    TEXT created_at "ISO timestamp"
  }

  pdf_notes {
    INTEGER id PK
    INTEGER annotation_id FK "REFERENCES annotations(id)"
    INTEGER page
    REAL x
    REAL y
    REAL width
    REAL height
    REAL staff_space
    REAL staff_bottom
    TEXT step "C | D | E | F | G | A | B"
    INTEGER alteration "semitones: -1 flat, 0, +1 sharp"
    INTEGER octave
    INTEGER measure
    INTEGER piano_key_index "0 = A0 ... 87 = C8"
  }
```