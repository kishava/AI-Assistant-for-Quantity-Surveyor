# QS Assistant Desktop

Electron shell — **portable** and **NSIS installer** are built together from root sources.

## Sync bundle (after code changes)

From repo root:

```powershell
npm run desktop:sync
```

Copies `backend/`, `frontend/dist/`, and `launcher/` into `desktop/app/` (gitignored).

## Build portable + installer together

```powershell
npm run dist
```

| Output | Path |
|--------|------|
| Portable | `desktop\release\win-unpacked\QS Assistant.exe` |
| Installer | `dist\installer\QS-Assistant-Setup.exe` |

`commit.bat` runs sync automatically. Add `dist` as a second argument to also compile:

```bat
commit.bat "feat: my change" dist
```

## Dev: run Electron

```powershell
npm run desktop:sync
cd desktop
npm install
npm start
```

See [PACKAGING.md](../PACKAGING.md) for full details.
