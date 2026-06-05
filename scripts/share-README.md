# QS Assistant — Tester Package (v{{VERSION}})

Thank you for testing **QS Assistant**, an offline-first AI tool for quantity surveyors.

Built: {{BUILT_AT}}  
Region defaults: **SAR** (Saudi Riyal). Ask for **AED** (UAE Dirham) in chat if your project is in the UAE.

---

## What you get

| Folder | Contents |
|--------|----------|
| **Installer** | `QS-Assistant-Setup.exe` — recommended for first-time setup |
| **Portable** | Full app folder — run without installing (USB / quick trial) |

---

## Option A — Installer (recommended)

1. Open the **Installer** folder.
2. Double-click **`QS-Assistant-Setup.exe`**.
3. Follow the setup wizard (you can change the install location).
4. On first run, the app may download **Ollama** and AI models — allow this; it can take 10–30 minutes on first launch.
5. Launch **QS Assistant** from the desktop or Start menu.

**Data location:** `%APPDATA%\QS-AI` (your documents and chats stay on your PC).

---

## Option B — Portable (no install)

1. Copy the entire **Portable** folder to your PC or USB drive.
2. Open the **Portable** folder.
3. Double-click **`QS Assistant.exe`**.
4. First run may take longer while local AI services start.

**Note:** Do not delete other files in the Portable folder — the `.exe` needs the surrounding files.

---

## First-time prerequisites

QS Assistant runs **locally** on your machine. On first launch it will **automatically install** (internet required):

| Component | Purpose |
|-----------|---------|
| **Ollama** | Local AI (chat & BOQ answers) |
| **AI models** | phi3:mini, nomic-embed-text, moondream |
| **Python + ChromaDB** | Document search |

- **Installer:** setup runs a visible progress window during installation (10–30 min).
- **Portable:** same setup runs on **first app launch** with an on-screen progress panel.
- If setup fails, QS Assistant offers **Retry setup** on the next launch.

---

## Quick start for QS work

1. **Continue as Guest** (local only, no account) or create a simple account.
2. Go to **Documents** → upload a BOQ, PDF, Excel, or site photo.
3. Open **Chat** → attach the file or ask a question.
4. Try: *"Give a preliminary BOQ for a generator room 4m x 2.5m with rates in SAR"*
5. Use **Generate QS tables** for structured BOQ lines and CSV export.

### Example questions (Gulf projects)

- *"Summarise earthwork section with quantities in SAR"*
- *"List concrete items with unit, qty, rate and amount (AED) for a Dubai villa"*
- *"What should I verify on site for MEP provisional sums?"*

---

## Currency

- Default estimates use **SAR (ر.س)** — suitable for KSA and general Gulf benchmarking.
- For UAE projects, say **"use AED"** or mention Dubai/Abu Dhabi in your question.
- All chat estimates are **indicative** until taken from tender BOQ or measured drawings.

---

## Privacy

- **Guest mode:** data cleared when you close the app.
- **Signed-in:** chats and uploads stay in `%APPDATA%\QS-AI` on your PC.
- **Cloud AI (optional):** only if you enable it — document text is not sent to cloud unless you tick "Share document text with cloud AI".

---

## Troubleshooting

| Problem | Try this |
|---------|----------|
| App stuck on "Starting up…" | Wait 2 minutes; restart; ensure Ollama is running (system tray). |
| "Local AI unavailable" | Install Ollama; run `ollama pull phi3:mini` in Command Prompt. |
| Document upload failed | Use PDF/Excel under 20 MB; try a clearer scan. |
| Slow answers | Normal on first query; smaller questions are faster. |

---

## Sharing feedback

Please note your Windows version, install vs portable, and what you asked the assistant. Screenshots of BOQ outputs are very helpful.

---

*QS Assistant v{{VERSION}} — Saegis Research*
