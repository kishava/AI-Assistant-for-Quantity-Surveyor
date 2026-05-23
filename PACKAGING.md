# Windows Packaging Guide

## Quick start (development)

```powershell
# Terminal 1 — ChromaDB
chroma run --path ./chroma_data

# Terminal 2 — Backend
cd backend; npm run dev

# Terminal 3 — Frontend
cd frontend; npm run dev
```

## Production single-server

```powershell
cd frontend; npm run build
cd backend; npm run start:prod
# Open http://127.0.0.1:3001
```

Data is stored in `%APPDATA%\QS-AI\` (database, uploads, `.env`).

## One-click launcher

```powershell
.\QS-Assistant.bat
```

Runs dependency checks, starts the backend, opens the browser.

## Package for distribution

```powershell
powershell -File scripts\package-windows.ps1
```

Output: `dist\QS-Assistant\` — copy portable Node 20 into `dist\QS-Assistant\node\`.

## Installer (Inno Setup)

1. Run `scripts\package-windows.ps1`
2. Install [Inno Setup](https://jrsoftware.org/isinfo.php)
3. Compile `installer\QS-Assistant.iss`
4. Output: `dist\installer\QS-Assistant-Setup.exe`

## Prerequisites for end users

- **Ollama**: `ollama pull phi3:mini` and `ollama pull nomic-embed-text`
- **ChromaDB**: `pip install chromadb` then `chroma run --path ./chroma_data`
- **Groq** (optional): set `GROQ_API_KEY` in `%APPDATA%\QS-AI\.env`

## Phase 2 — Electron desktop

See [desktop/README.md](desktop/README.md).
