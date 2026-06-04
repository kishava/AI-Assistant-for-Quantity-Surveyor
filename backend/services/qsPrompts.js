import { isGarbledOcr } from './ocrQuality.js';

const QS_SYSTEM_PROMPT =
  'You are a Quantity Surveyor (QS) assistant used by practising QS professionals on site and in the office. ' +
  'Write in clear, plain English. Be concise and practical — no textbook lectures, no filler, no invented data. ' +
  'Never reference "snippets", "documents I cannot access", or generic BOQ theory when document text is provided below. ' +
  'Use markdown: short headings, bullet lists, and tables where helpful. ' +
  'British/Indian QS terms are fine (Cum, Sqm, PCC, BOQ).';

const BOQ_EXPLAIN_FORMAT =
  'Answer using ONLY the document text below. Structure your reply exactly like this:\n\n' +
  '## Document\n' +
  '- **File:** (filename from context)\n' +
  '- **Project / title:** (from document if visible, else "Not stated in extract")\n\n' +
  '## In brief\n' +
  '2–4 sentences: what this BOQ covers and the main cost areas.\n\n' +
  '## Sections & line items\n' +
  'For each major section (e.g. Earth work, Civil works):\n' +
  '- Section name and **section total** if shown\n' +
  '- Table or bullets: **Item** | **Description** | **Unit** | **Qty** | **Rate** | **Amount** (use "—" if missing)\n\n' +
  '## Totals & notes for QS\n' +
  '- Call out section totals and anything unusual (disposal, fill, grade of concrete, etc.)\n' +
  '- One short bullet list: what to verify on site or in drawings\n\n' +
  'Rules: copy numbers exactly from the text; do not guess rates or quantities; if a field is unreadable, mark it "—" and say so once in notes.';

const GARBLED_RESPONSE_FORMAT =
  'The extracted text from the uploaded file is too garbled for a reliable BOQ explanation.\n\n' +
  'Reply in under 120 words with ONLY:\n' +
  '1. **Problem:** OCR/scan quality is poor (do not invent line items).\n' +
  '2. **What to do:** In Documents, click the refresh icon to **Reprocess**; use a clearer PDF/scan; ensure Ollama model `moondream` is installed for images (`ollama pull moondream`).\n' +
  '3. **Then ask again:** e.g. "Explain this BOQ section by section."\n\n' +
  'Do NOT write generic QS theory or pretend to explain excavation/formwork from snippets.';

export function buildQsChatMessages({ message, history, contextChunks, retrievalMeta }) {
  const uniqueCitations = retrievalMeta?.usedDocs?.length ? [...retrievalMeta.usedDocs] : [];
  const docLabel = uniqueCitations[0] || 'uploaded document';
  const fullContext = contextChunks.join('\n\n');
  const garbled = retrievalMeta?.ocrQuality === 'poor' || (fullContext && isGarbledOcr(fullContext));

  let userContent;

  if (contextChunks.length === 0) {
    userContent =
      'No document text was loaded.\n\n' +
      'Tell the user: upload the BOQ under **Documents**, wait until status is **Ready**, optionally attach it in chat, then ask again.\n\n' +
      `User question: ${message}`;
  } else if (garbled) {
    userContent =
      `${GARBLED_RESPONSE_FORMAT}\n\n` +
      `Filename: "${docLabel}"\n\n` +
      `--- Poor quality extract (for reference only, do not quote as facts) ---\n${fullContext.slice(0, 1200)}\n---\n\n` +
      `User question: ${message}`;
  } else {
    userContent =
      `${BOQ_EXPLAIN_FORMAT}\n\n` +
      `Filename: "${docLabel}"\n\n` +
      `--- DOCUMENT TEXT (read newest upload; use only this) ---\n\n` +
      contextChunks.map((c, i) => `### Part ${i + 1}\n${c}`).join('\n\n') +
      `\n\n--- END DOCUMENT TEXT ---\n\n` +
      `User question: ${message}`;
  }

  return {
    messagesToSend: [
      { role: 'system', content: QS_SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: userContent },
    ],
    uniqueCitations,
    garbled,
  };
}
