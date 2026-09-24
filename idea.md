# PianoGo

PianoGo is a web application that helps beginner pianists read, organize, and practise sheet music. Users can upload a MusicXML or PDF file, and the application automatically annotates the sheet with the names of its notes.

## Core features

- Upload and store MusicXML and PDF sheet music.
- Automatically add note names using standard notation such as C4, D4, and E4.
- View the original and annotated versions of a sheet.
- Select a note and see the corresponding keys highlighted on a top-down piano diagram.
- Organize sheets in a personal library with titles, composers, tags, difficulty levels, favourites, and practice status.
- Search and filter the music library.
- Download or print annotated sheets.

## Project scope

The first version will focus on reliable MusicXML processing, PDF annotation, library management, and a static piano view for selected notes. Image-based sheet recognition, animated playback, transposition, and interactive practice exercises may be added later.

The application has two main feature domains:

1. **Sheet library:** manages uploaded files, sheet metadata, organization, and practice status.
2. **Music processing:** extracts notes, creates annotations, and maps notes to piano keys.

Both domains will store their data in SQLite while remaining logically separate so they could be split into independent services in the future.
