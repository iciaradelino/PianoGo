# PianoGo

PianoGo is a web app for beginner pianists. You upload sheet music (MusicXML or PDF), it labels every note (letter names or solfège), and you can practise measure by measure on an on-screen piano that shows which keys each hand plays.

It runs as a **single Next.js process** with **SQLite**. No extra services are needed.

## Features

**Sheet library**

- upload MusicXML or PDF files
- title, composer, difficulty, tags, favourites and practice status
- search and filter the library, with thumbnail previews
- open, download or delete a sheet

**Music processing**

- parse MusicXML and label notes in the rendered score
- read notes from digital (vector) PDFs and draw labels over the original page
- recognise scanned PDFs with [Audiveris](https://audiveris.github.io) (optional install)
- customise labels: solfège or letter names, size, colour, case, position, octave numbers

**Piano**

- two keyboards, one per hand, linked to the score
- step through measures and play a whole measure with its notes numbered in order

**Settings**

- English or Spanish
- light, dark or system theme
- collapsible sidebar for a two-page score view

## Architecture

One Next.js app serves both the UI and the API. The backend is split into two domains that share one SQLite file and meet only on `sheet_id`.

```
browser
   │
   ▼
Next.js (UI + /api/*)
   ├── lib/library     → sheets, tags, files
   └── lib/processing  → annotations, notes, PDF/OMR parsing
           │
           ▼
     SQLite ($DATA_DIR/pianogo.db)
```

| Path | Contents |
| --- | --- |
| `app/` | page and API route handlers (`/api/sheets`, `/api/annotations`) |
| `components/` | React UI: library, piano, processing (score views), settings, `ui/` (shadcn) |
| `lib/db.ts` | opens SQLite, creates the schema and runs migrations |
| `lib/library/` | sheet model, validation, queries, previews |
| `lib/processing/` | annotations, solfège, PDF note extraction (`pdf/`), Audiveris OMR (`omr/`) |
| `lib/settings/` | translations and user preferences |
| `tests/` | Jest unit tests for `lib/` |

Tables: `sheets`, `tags`, `sheet_tags` (library) and `annotations`, `notes`, `pdf_notes` (processing). Design decisions are recorded in [ADR.md](ADR.md).

## Setup

Requires Node.js 22+.

```bash
npm install
npm run build
npm start
```

Then open http://localhost:3000. For development, use `npm run dev`.

The database and upload folder are created on first run.

### Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | listen port |
| `DATA_DIR` | `./data` | SQLite database and uploaded files |
| `AUDIVERIS_PATH` | standard install location | Audiveris launcher, needed only for scanned PDFs |

`npm start` binds to `0.0.0.0`.

```bash
PORT=8080 DATA_DIR=/tmp/pianogo npm start
```

## Tests

```bash
npm test -- --coverage
```

Tests cover the core logic in `lib/` (not routes or React). Each test file uses its own temporary `DATA_DIR`. The coverage threshold is 70%.
