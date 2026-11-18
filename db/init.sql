-- Local setup of the shared SQL Server container, run by the db-init service
-- in docker-compose.yml with sqlcmd. Safe to run on every `docker compose up`:
-- each step checks whether its object already exists.
--
-- $(LIBRARY_DB_PASSWORD) and $(PROCESSING_DB_PASSWORD) are sqlcmd variables,
-- filled in from the environment variables of the same name.
--
-- Each service gets its own database and its own login. A login is only a
-- user in its own database, so library_user cannot open pianogo_processing
-- and processing_user cannot open pianogo_library (ADR-6).
--
-- The tables themselves are created by each service's migrations, not here.

IF DB_ID(N'pianogo_library') IS NULL CREATE DATABASE pianogo_library;
GO
IF DB_ID(N'pianogo_processing') IS NULL CREATE DATABASE pianogo_processing;
GO

-- ALTER LOGIN keeps the password in step with the environment if it changes.
IF SUSER_ID(N'library_user') IS NULL
  CREATE LOGIN library_user WITH PASSWORD = N'$(LIBRARY_DB_PASSWORD)', DEFAULT_DATABASE = pianogo_library;
ELSE
  ALTER LOGIN library_user WITH PASSWORD = N'$(LIBRARY_DB_PASSWORD)';
GO
IF SUSER_ID(N'processing_user') IS NULL
  CREATE LOGIN processing_user WITH PASSWORD = N'$(PROCESSING_DB_PASSWORD)', DEFAULT_DATABASE = pianogo_processing;
ELSE
  ALTER LOGIN processing_user WITH PASSWORD = N'$(PROCESSING_DB_PASSWORD)';
GO

-- Read, write and change the schema (migrations run at startup), in its own
-- database only. Not db_owner: the service cannot manage users or permissions.
USE pianogo_library;
IF USER_ID(N'library_user') IS NULL CREATE USER library_user FOR LOGIN library_user;
ALTER ROLE db_datareader ADD MEMBER library_user;
ALTER ROLE db_datawriter ADD MEMBER library_user;
ALTER ROLE db_ddladmin ADD MEMBER library_user;
GO

USE pianogo_processing;
IF USER_ID(N'processing_user') IS NULL CREATE USER processing_user FOR LOGIN processing_user;
ALTER ROLE db_datareader ADD MEMBER processing_user;
ALTER ROLE db_datawriter ADD MEMBER processing_user;
ALTER ROLE db_ddladmin ADD MEMBER processing_user;
GO

PRINT N'db-init: databases and logins are ready';
