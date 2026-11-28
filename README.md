# PianoGo

https://github.com/user-attachments/assets/fe9d6a74-cdce-4b74-8dbc-5597a366b40c

PianoGo is a web app for beginner pianists. You upload sheet music (MusicXML or PDF), it labels every note (letter names or solfège), and you can practise measure by measure on an on-screen piano that shows which keys each hand plays.

**Live:** https://iadelinoieu2024ui.z28.web.core.windows.net

The services scale to zero and their databases pause when nobody uses them, so the first visit after a quiet period shows "Starting up…" for up to about a minute (ADR-8).

## Features

**Sheet library**

- upload MusicXML or PDF files
- title, composer, difficulty and practice status
- search by title or composer, filter by difficulty and status, with thumbnail previews
- open, download or delete a sheet

**Music processing**

- parse MusicXML and label notes in the rendered score
- read notes from digital (vector) PDFs and draw labels over the original page
- customise labels: solfège or letter names, size, colour, case, position, octave numbers
- scanned PDFs can be viewed but not annotated in the deployed system (ADR-10)

**Piano**

- two keyboards, one per hand, linked to the score
- step through measures and play a whole measure with its notes numbered in order

**Settings**

- English or Spanish
- light, dark or system theme
- collapsible sidebar for a two-page score view

## Architecture

PianoGo started as one Next.js process with SQLite (Assignment 1). It is now split along the seam between its two domains (ADR-6):

| Part | What it owns | Where it runs |
| --- | --- | --- |
| `services/library` | sheets, their uploaded files (in the database) and first-page previews | Container App `iadelino-ieu2024-library`, database `iadelino-ieu2024-library-db` |
| `services/processing` | annotations, the notes read from PDFs and their label style | Container App `iadelino-ieu2024-processing`, database `iadelino-ieu2024-processing-db` |
| `ui` | the React interface, exported as static files | Storage static website `iadelinoieu2024ui` |

Both services are Node.js 24 + TypeScript + Express with SQL Server (`mssql`). The browser calls both directly. One call crosses the seam on the server: when you generate annotations, processing fetches the sheet's file from library (`GET /sheets/{id}/file`, 10 s timeout). If library is down, that one action answers `503` with "The library is not responding… Try again in a minute", and everything else in processing keeps working.

| Document | Contents |
| --- | --- |
| [docs/architecture-diagram.md](docs/architecture-diagram.md) | before (monolith) and after (two services) |
| [docs/deployment-diagram.md](docs/deployment-diagram.md) | GitHub → Actions → GHCR → Azure, with every resource |
| [docs/database-diagram.md](docs/database-diagram.md) | one database diagram per service, matching the migrations |
| [docs/ADR.md](docs/ADR.md) | design decisions (6-10 are Assignment 2) |
| [docs/AI_USAGE.md](docs/AI_USAGE.md) | every use of AI, with what I changed and how the code works |
| [system.yaml](system.yaml) | the system description (validated against [system.schema.json](system.schema.json)) |
| `services/*/openapi.yaml` | each service's API |

```
services/
  library/      src/ (app, routes, repository, preview, migrate), migrations/, tests/, Dockerfile, openapi.yaml
  processing/   src/ (app, routes, repository, library-client, pdf/, omr/, migrate), migrations/, tests/, Dockerfile, openapi.yaml
ui/             Next.js static export; public/config.js says where the services are
db/init.sql     local only: creates both databases and one login per service
tests/integration/cross-seam.test.mjs
infra/setup-azure.sh
.github/workflows/ci.yml, cd.yml
```

## Running locally

Needs [Docker Desktop](https://www.docker.com/products/docker-desktop/) (on Apple silicon, turn on "Use Rosetta for x86_64/amd64 emulation", since SQL Server's image is amd64 only). Nothing else.

```bash
docker compose up --build
```

| | Address |
| --- | --- |
| UI | http://localhost:8080 |
| library | http://localhost:8001 (try `/health`, `/sheets`) |
| processing | http://localhost:8002 |
| SQL Server | `localhost:1433`, databases `pianogo_library` and `pianogo_processing` |

The first start takes a few minutes: SQL Server boots, `db-init` creates the databases and logins, each service runs its migrations, and `ui-build` builds the UI. Data is kept in the `sqldata` volume between runs. To start again from empty databases, `docker compose down -v`.

The compose file has local-only default passwords. To use your own, put `SA_PASSWORD`, `LIBRARY_DB_PASSWORD` and `PROCESSING_DB_PASSWORD` in a `.env` file next to it (gitignored).

To see partial failure, stop library while the UI is open. The library page then shows an error, existing annotations still load, and generating new ones shows the 503 message:

```bash
docker compose stop library
```
```bash
docker compose start library
```

### Running a single service

With Docker, `docker compose up --build library` starts only library and its database (processing can start alone the same way, and then answers `503` to anything that needs library).

Without Docker for the service itself (Node.js 24), start only the database, then run the service from its folder:

```bash
docker compose up -d db-init
```
```bash
cd services/library
npm ci
npm run build
DATABASE_URL="Server=localhost,1433;Database=pianogo_library;User Id=library_user;Password=Local-only-library-1;Encrypt=true;TrustServerCertificate=true" npm start
```

For processing, use `pianogo_processing`, `processing_user` and `Local-only-processing-1`, and set `LIBRARY_URL=http://localhost:8001`.

| Variable | Service | Default | Meaning |
| --- | --- | --- | --- |
| `PORT` | both | `8001` / `8002` | listen port |
| `DATABASE_URL` | both | none (required, secret) | SQL Server connection string for this service's own database |
| `ALLOWED_ORIGIN` | both | `http://localhost:8080` | the UI's origin, the only one CORS allows |
| `GIT_SHA` | both | `dev` | commit reported by `/health`, set when the image is built |
| `LIBRARY_URL` | processing | `http://library:8001` | where library is |
| `LIBRARY_TIMEOUT_S` | processing | `10` | timeout of the call to library |
| `AUDIVERIS_PATH` | processing | standard install path | Audiveris launcher, only for scanned PDFs (not in the image, ADR-10) |

On startup each service connects to its database (retrying for up to about 100 s, for a paused Azure database), applies any migration in `migrations/` that `schema_migrations` does not list yet, and only then listens. `GET /health` returns `200 {"status":"ok","db":"ok","version":"<sha>"}` when it can write and read its own database, `503` otherwise. Every request is logged to stdout with method, path, status and duration.

## Tests

Each service has its own Jest tests. The tests that need SQL Server use a throwaway database on the server in `TEST_DATABASE_URL` and are skipped without it, so run them against the compose SQL Server:

```bash
docker compose up -d sqlserver
```
```bash
cd services/library
npm ci
TEST_DATABASE_URL="Server=localhost,1433;Database=master;User Id=sa;Password=Local-only-sa-1;Encrypt=true;TrustServerCertificate=true" npm run test:coverage
```

Same in `services/processing`. `npm run lint` and `npm run typecheck` work in each service and in `ui`. Coverage fails below 70% statements, branches, functions or lines. Latest result (2026-11-28, all database tests included):

| Service | Tests | Statements | Branches | Functions | Lines |
| --- | --- | --- | --- | --- | --- |
| library | 79 | 99.06% | 91.27% | 96.96% | 100% |
| processing | 120 | 98.13% | 90.84% | 97.08% | 99.06% |

The cross-seam integration test runs against the real compose stack. It annotates a sheet across the seam, stops library, checks the 503 and that processing still serves its own data, then starts library again:

```bash
docker compose up -d --build library processing
```
```bash
node --test "tests/integration/*.test.mjs"
```

What is and is not tested, and why, is in ADR-9.

## Deployment

Everything runs in the resource group `rg-iadelino-ieu2024` (`francecentral`) of my Azure for Students subscription. The diagram is in [docs/deployment-diagram.md](docs/deployment-diagram.md).

**How it works.** Changes reach `main` only through pull requests.

1. **CI** (`.github/workflows/ci.yml`) runs on every push and pull request. For each service it runs lint, typecheck and the tests with coverage against a throwaway SQL Server container. It also builds the UI, validates `system.yaml` and both OpenAPI documents, runs the cross-seam test on the compose stack, and builds both images. CI never connects to Azure.
2. **CD** (`.github/workflows/cd.yml`) runs on every push to `main`. It runs the same CI, then pushes both images to GHCR tagged with the commit SHA. It signs in to Azure with OIDC as the managed identity `iadelino-ieu2024-github` (no Azure password in GitHub), sets each Container App's `database-url` secret from the GitHub secrets, and points each app at its new image. It builds the UI, writes `config.js` with the services' Azure URLs, and uploads it to the static website. Finally it waits until both `/health` endpoints return `200` with the new SHA, and fails the run if that takes more than 5 minutes.
3. The new revision of each service applies any new migration when it starts (ADR-7).

**Initial setup (done once).** [`infra/setup-azure.sh`](infra/setup-azure.sh) creates everything and can be run again safely. To reproduce it:

1. Install the [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli), the [GitHub CLI](https://cli.github.com), and Docker or `sqlcmd`.
2. Sign in to both:
   ```bash
   az login
   ```
   ```bash
   gh auth login
   ```
   Pick the "Azure for Students" subscription.
3. From the repository root, in Bash (Git Bash on Windows):
   ```bash
   bash infra/setup-azure.sh
   ```
   In order, it:
   - creates the resource group;
   - creates the storage account with static website hosting;
   - creates the SQL server and two serverless databases on the free offer;
   - opens the firewall to Azure services, plus your IP while it runs;
   - creates one database user per service, with rights only in its own database;
   - creates the Container Apps environment and both Container Apps (0–1 replicas, 0.5 vCPU, 1 GiB, with a placeholder image and the connection string as a secret);
   - creates the managed identity with Contributor on the resource group and a federated credential for `main`;
   - sets the GitHub secrets (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `LIBRARY_DB_PASSWORD`, `PROCESSING_DB_PASSWORD`) and variables (`PREFIX`, `RESOURCE_GROUP`, `UI_STORAGE`);
   - gives the professors Reader access.
   
   Passwords are generated in the script and go straight to Azure and GitHub. Nothing is printed or saved, and the SQL admin password is not kept (reset it in the portal if you need the Query editor).
4. Push to `main` (or merge a PR) to run CD. After the first run, make both packages `pianogo-library` and `pianogo-processing` public in GitHub (Packages, then Package settings, then Change visibility), so Container Apps can pull them without credentials. Then run CD again.

After that, nothing is changed by hand in the portal. Every change goes through the pipeline.

## AI disclosure

I acknowledge the use of Cursor and Claude Code (Anthropic) to design, write, test and document PianoGo. The prompts used include building the UI and the library and processing features, writing unit and integration tests, splitting the monolith into two services, writing the Dockerfiles, compose file, migrations, CI/CD workflows and Azure setup script, handling cold starts, and drafting the ADRs and this README. The output of these prompts was used as a starting point that I reviewed, tested, ran and changed where needed. Every use, what I changed and how the code works in my own words is logged in [docs/AI_USAGE.md](docs/AI_USAGE.md).
