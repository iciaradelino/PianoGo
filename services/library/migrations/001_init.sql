-- The library's schema from Assignment 1, ported from SQLite to SQL Server.
-- Uploaded files now live in file_bytes instead of data/uploads/, because a
-- Container App loses its disk when it scales to zero (ADR-6).

CREATE TABLE sheets (
  id INT IDENTITY(1, 1) NOT NULL CONSTRAINT pk_sheets PRIMARY KEY,
  title NVARCHAR(200) NOT NULL,
  composer NVARCHAR(200) NOT NULL,
  difficulty NVARCHAR(20) NOT NULL CONSTRAINT ck_sheets_difficulty CHECK (
    difficulty IN (N'Beginner', N'Intermediate', N'Advanced')
  ),
  original_filename NVARCHAR(255) NOT NULL,
  file_type NVARCHAR(10) NOT NULL CONSTRAINT ck_sheets_file_type CHECK (
    file_type IN (N'pdf', N'musicxml')
  ),
  file_bytes VARBINARY(MAX) NOT NULL,
  practice_status NVARCHAR(20) NOT NULL
    CONSTRAINT df_sheets_practice_status DEFAULT N'Not started'
    CONSTRAINT ck_sheets_practice_status CHECK (
      practice_status IN (N'Not started', N'In progress', N'Completed')
    ),
  created_at DATETIME2 NOT NULL CONSTRAINT df_sheets_created_at DEFAULT SYSUTCDATETIME()
);

-- One row that GET /health writes and reads back.
CREATE TABLE health_check (
  id INT NOT NULL CONSTRAINT pk_health_check PRIMARY KEY CONSTRAINT ck_health_check_id CHECK (id = 1),
  checked_at DATETIME2 NOT NULL
);

INSERT INTO health_check (id, checked_at) VALUES (1, SYSUTCDATETIME());
