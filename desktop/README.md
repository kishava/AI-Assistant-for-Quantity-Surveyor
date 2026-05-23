# QS Assistant Desktop (Phase 2)

Electron wrapper around the QS Assistant web app.

## Prerequisites

- Backend dependencies installed (`cd backend && npm install`)
- Frontend built (`cd frontend && npm run build`)
- Ollama + ChromaDB running (same as web app)

## Run in development

```bash
cd desktop
npm install
npm start
```

Set `QS_AI_BACKEND_DIR` if the backend is not at `../backend`.

## Build Windows installer

```bash
npm run build
```

Output: `desktop/release/`

Note: Add `desktop/tray-icon.png` (16x16 or 32x32) before building for system tray support.
