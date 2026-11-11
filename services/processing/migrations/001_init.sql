-- The processing schema from Assignment 1, ported from SQLite to SQL Server.
-- sheet_id was a foreign key to sheets; that table now lives in the library
-- service's database, so it is a plain id here (ADR-6).

CREATE TABLE annotations (
  id INT IDENTITY(1, 1) NOT NULL CONSTRAINT pk_annotations PRIMARY KEY,
  sheet_id INT NOT NULL CONSTRAINT uq_annotations_sheet_id UNIQUE,
  status NVARCHAR(20) NOT NULL CONSTRAINT ck_annotations_status CHECK (
    status IN (N'processing', N'ready', N'failed')
  ),
  -- SQLite could not check this JSON, SQL Server can.
  style NVARCHAR(MAX) NOT NULL
    CONSTRAINT df_annotations_style DEFAULT N'{}'
    CONSTRAINT ck_annotations_style CHECK (ISJSON(style) = 1),
  created_at DATETIME2 NOT NULL CONSTRAINT df_annotations_created_at DEFAULT SYSUTCDATETIME()
);

-- Notes read from a PDF, with where their notehead sits on the page so that
-- labels can be drawn over the original file. FLOAT, not REAL: SQL Server's
-- REAL is 4 bytes, while SQLite's REAL was an 8-byte double.
CREATE TABLE pdf_notes (
  id INT IDENTITY(1, 1) NOT NULL CONSTRAINT pk_pdf_notes PRIMARY KEY,
  annotation_id INT NOT NULL
    CONSTRAINT fk_pdf_notes_annotation REFERENCES annotations (id),
  page INT NOT NULL,
  x FLOAT NOT NULL,
  y FLOAT NOT NULL,
  width FLOAT NOT NULL,
  height FLOAT NOT NULL,
  staff_space FLOAT NOT NULL,
  staff_bottom FLOAT NOT NULL,
  step NCHAR(1) NOT NULL CONSTRAINT ck_pdf_notes_step CHECK (
    step IN (N'C', N'D', N'E', N'F', N'G', N'A', N'B')
  ),
  alteration INT NOT NULL,
  octave INT NOT NULL,
  measure INT NOT NULL,
  piano_key_index INT NOT NULL
);

CREATE INDEX ix_pdf_notes_annotation ON pdf_notes (annotation_id, page);

-- One row that GET /health writes and reads back.
CREATE TABLE health_check (
  id INT NOT NULL CONSTRAINT pk_health_check PRIMARY KEY CONSTRAINT ck_health_check_id CHECK (id = 1),
  checked_at DATETIME2 NOT NULL
);

INSERT INTO health_check (id, checked_at) VALUES (1, SYSUTCDATETIME());
