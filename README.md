# NeuroNote

NeuroNote is an Expo-based handwriting notebook for creating blank notes or importing PDFs and annotating them page by page.

## Current Features

- Create and rename notes from the explore screen
- Import PDFs into a note and turn each page into an annotation surface
- Draw with a pen tool, erase strokes, and lasso-select content
- Manage multiple pages inside a note
- Export notes as PDF
- Persist notes locally on device and in the browser

## Project Structure

- `app/(tabs)/explore.tsx`: note library, note creation, PDF import
- `app/(tabs)/index.tsx`: note editor, drawing tools, page management, export
- `lib/notesStorage.ts`: local persistence for note metadata and note documents
- `lib/noteDocument.ts`: shared note document types and defaults
- `components/PdfPageBackground.*`: native/web PDF background rendering split

## Running The App

```bash
npm install
npx expo start
```

Helpful commands:

```bash
npm run android
npm run ios
npm run web
npm run lint
```

## Storage Model

Notes are stored locally.

- Native platforms use Expo file storage with one JSON file per note plus an index file
- Web uses browser storage for the same note document shape

## Known Constraints

- The editor is still implemented as a large single screen and is a good candidate for further component extraction
- Web PDF imports can become heavy for large documents because page backgrounds are stored locally
- There is currently no cloud sync or account system

## Next Refactor Targets

- Split editor state management into smaller hooks and components
- Move more serialization logic out of the editor screen
- Add tests around note persistence and page/document normalization
