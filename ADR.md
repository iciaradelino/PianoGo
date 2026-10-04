# Architecture Decision Records

PianoGo: a single-process Next.js app with SQLite that helps beginner pianists keep a sheet-music library and see note names and piano keys for each sheet.

## 1. Next.js (TypeScript) as the single backend and frontend framework
Date: 2026-09-28
Status: Decided
Context: The app must run as one process from one command, and the core feature is an interactive score view and piano keyboard that react when you click a note, which needs a lot of client-side code. The first skeleton (2026-09-25) was a Python app with static files, and I would have needed a separate JS frontend anyway.
Decision: Replace the Python skeleton with one Next.js App Router project in TypeScript, where `app/api/*` route handlers are the backend and React pages are the frontend, started with `npm start` (`next start -H 0.0.0.0`).
Alternatives considered: Flask + Jinja templates with plain JS was rejected because the piano view, OpenSheetMusicDisplay rendering and pdf.js overlays are all JavaScript, so I would write and maintain two languages for one small app. FastAPI + a separate React/Vite build was rejected because it means two toolchains and two manifests, which breaks the one-manifest rule.
Consequences: One language and one `package.json` for UI, API and domain logic, and libraries like `opensheetmusicdisplay` and `pdfjs-dist` can be used directly. The cost is a heavier framework (build step, server/client component rules) and native modules such as `better-sqlite3` and `@napi-rs/canvas`, which must compile inside the Assignment 2 container.

## 2. Two feature domains, Sheet library and Music processing, joined only by a sheet id
Date: 2026-09-27
Status: Decided
Context: The assignment needs two domains that could later become separate services. PianoGo naturally has two jobs: storing and organizing uploaded files, and reading those files to produce note names and piano-key mappings.
Decision: `lib/library/` owns uploads, sheet metadata, files and previews, and `lib/processing/` owns annotations, note extraction (vector PDFs and Audiveris OMR) and pitch-to-key mapping. Processing reads a sheet's file only through the library's `readSheetFile(id)`, the library never imports processing, and only the thin `app/` route handlers call both (for example, `DELETE /api/sheets/[id]` calls `deleteAnnotations` and then `deleteSheet`).
Alternatives considered: A single `lib/sheets` module that parsed notes at upload time and stored them on the sheet row was rejected because uploads would then depend on slow parsing (Audiveris takes 10-40 s per page), and the two jobs could never be separated. Splitting by layer (`lib/models`, `lib/services`) instead of by domain was rejected because both domains would be mixed in every folder, with no visible seam.
Consequences: The seam for a later split is the one function `readSheetFile(id)`, which would become an HTTP call that returns the file for a sheet id while processing gets its own database. The cost is that cross-domain work, such as deleting a sheet and its annotations, is coordinated in the route handler instead of inside one transaction.

## 3. Processing tables reference `sheets` only through `annotations.sheet_id`, with one annotation per sheet
Date: 2026-10-03
Status: Decided
Context: When I added PDF annotation I needed to store where each notehead sits on the page (page, x, y, staff spacing) so labels can be drawn over the original file, plus the user's label style. I had to decide how this data relates to the library's `sheets` table without mixing the two domains' data.
Decision: The library's `sheets` table holds no note data and the processing tables (`annotations`, `pdf_notes`) hold no title, composer or file information, so the only link is `annotations.sheet_id`, which is `UNIQUE` (a sheet has zero or one annotation). `pdf_notes` stores each PDF note's page position, pitch, measure and piano key per annotation, and the label style is a JSON `TEXT` column on `annotations`.
Alternatives considered: Putting `sheet_id` directly on every `pdf_notes` row was rejected because re-annotating would mean deleting and re-inserting notes keyed by a library id, and it would add more foreign keys into the library's table. A separate `annotation_styles` table with one column per option was rejected because style options are still changing (color, size, uppercase, octaves), and adding a column each time means a migration each time.
Consequences: Splitting processing out later only needs one foreign key (`sheet_id`) to become a plain id, and re-annotating is an upsert on `annotations` plus replacing its `pdf_notes` in one transaction. The style JSON cannot be checked by SQLite, so `parseAnnotationStyle` validates it in code, and MusicXML notes are not stored at all because OpenSheetMusicDisplay names them in the browser as it draws the score.

## 4. Unit tests on `lib/` domain logic only, with Jest, aiming for at least 70% coverage
Date: 2026-10-04
Status: Decided
Context: Coverage must be at least 70% on core business logic, and most of the code that can break in subtle ways is pure logic: input validation, pitch maths, PDF/OMR note parsing and annotation style parsing. Route handlers and React components are mostly glue.
Decision: Write Jest tests under `tests/library/` and `tests/processing/` that call `lib/` functions directly, with coverage measured only over `lib/db.ts`, `lib/library` and `lib/processing` and a 70% threshold that fails `npm test -- --coverage`. Repository tests use a real SQLite file in a temporary `DATA_DIR` per test file and fake only outside programs (pdf.js via `jest.mock`, Audiveris via a fake `spawn`), prioritizing `model.ts` validation, pitch maths in `find-notes.ts` and `read-omr.ts`, `parseAnnotationStyle`, and the repository create/update/delete and annotation status paths (`none`, `processing`, `ready`, `failed`).
Alternatives considered: Browser end-to-end tests (Playwright) of upload, annotate and play were rejected for now because they are slow, need a running server, and test Next.js wiring more than my own logic. Mocking `better-sqlite3` was rejected because a real temporary SQLite file is fast and catches real SQL mistakes. Running the real Audiveris in tests was rejected because it takes 10-40 s a page and would have to be installed wherever tests run.
Consequences: Coverage is 96% of statements and 92% of branches, with `library/preview.ts` thinnest (58%) because rendering a PDF page to PNG needs pdf.js and a real canvas, so only its cache and non-PDF paths are tested. Bugs in route handlers or UI components are not caught, and the faked pdf.js and Audiveris will not catch changes in those programs' real output.

## 5. No user accounts or login in v1
Date: 2026-09-30
Status: Decided
Context: The target is a single beginner, or a small class or studio of about 100 daily users, each practising on their own library, and the app runs locally until Assignment 2. Login would affect every table and every route.
Decision: I did not build authentication or per-user libraries. There is one shared library, and `sheets` has no `user_id`.
Alternatives considered: Email/password accounts with sessions (or NextAuth) were rejected because they add password hashing, session storage, a `users` table and ownership checks on every route. That is a third domain I would need to test and explain, while the assignment only requires two. Being able to share or sync a library across devices is real value, but it was not worth that scope now.
Consequences: Anyone who can reach the server can see, edit and delete every sheet, so a public deployment in Assignment 2 would need at least a network restriction or a simple login in front of it. Adding accounts later means a `users` table, a `user_id` on `sheets` and filtering every library query by owner, while processing would not change because it only works with sheet ids.
