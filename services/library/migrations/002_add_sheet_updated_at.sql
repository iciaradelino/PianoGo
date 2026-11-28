-- Records when a sheet's details or practice status last changed (ADR-7).
--
-- sheets already holds data, so this runs in three steps instead of adding a
-- NOT NULL column in one go, which would give every existing sheet the time
-- of the migration:
--   1. add the column as nullable, which leaves every existing row untouched;
--   2. backfill it: a sheet that was never edited last changed when it was
--      created, so existing rows get their created_at;
--   3. make it NOT NULL, with a default for the rows inserted from now on.
-- GO starts a new batch: SQL Server compiles a whole batch before running it,
-- so the UPDATE cannot sit in the batch that adds the column it writes. The
-- runner applies all three batches in one transaction, so a failure part way
-- leaves the table as it was.

ALTER TABLE sheets ADD updated_at DATETIME2 NULL;
GO

UPDATE sheets SET updated_at = created_at WHERE updated_at IS NULL;
GO

ALTER TABLE sheets ALTER COLUMN updated_at DATETIME2 NOT NULL;
ALTER TABLE sheets
  ADD CONSTRAINT df_sheets_updated_at DEFAULT SYSUTCDATETIME() FOR updated_at;
