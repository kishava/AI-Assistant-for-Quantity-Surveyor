# Windows Packaging Guide

## Development (web)

```powershell
chroma run --path ./chroma_data
npm run dev
```

## Keep portable + installer sources in sync

Whenever you change `backend/`, `frontend/`, or `launcher/`:

```powershell
npm run desktop:sync
```

`commit.bat` runs this automatically before each commit.

## Build portable + installer together

Single command builds **both** outputs from the same `desktop\app` bundle:

```powershell
npm run dist
```

| Output | Path |
|--------|------|
| **Portable** | `desktop\release\win-unpacked\QS Assistant.exe` |
| **Installer** | `desktop\release\QS-Assistant-Setup.exe` |
| **Installer (mirror)** | `dist\installer\QS-Assistant-Setup.exe` |

Each successful `npm run dist` **bumps the patch version** (e.g. 1.0.0 → 1.0.1) in all `package.json` files, **overwrites** the portable and installer at the paths above, and **deletes** stale `build-*` folders, `.blockmap`, and `builder-*.yml` files from `desktop\release\`.

Build metadata: `desktop\release\build-info.json`

## Share with a QS tester

After `npm run dist`, a ready-to-zip folder is created automatically:

```
dist\QS-Assistant-Share\
  README.md
  Installer\QS-Assistant-Setup.exe
  Portable\QS Assistant.exe  (+ supporting files)
```

Or run manually: `npm run share`

Zip **QS-Assistant-Share** and send via Google Drive, WeTransfer, etc.

**Gulf defaults:** chat estimates use **SAR**; testers can ask for **AED** in questions for UAE projects.

Requires: Node.js in PATH, `npm install` in `desktop/` (for electron-builder).

## Run Electron shell in dev

```powershell
npm run desktop:sync
npm run desktop
```

## Legacy Inno Setup (optional)

Older batch-based layout under `dist\QS-Assistant\`:

```powershell
powershell -File scripts\package-windows.ps1
# Then compile installer\QS-Assistant.iss with Inno Setup 6+
```

Prefer **`npm run dist`** — one pipeline for portable + NSIS installer.

## End-user prerequisites

Installed automatically by the NSIS installer hook (`desktop\build\installer.nsh`):

- Ollama + models: `phi3:mini`, `nomic-embed-text`, `moondream`
- Python + ChromaDB

Data directory: `%APPDATA%\QS-AI\`
