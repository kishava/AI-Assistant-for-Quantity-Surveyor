import { isGarbledOcr } from './ocrQuality.js';

const QS_SYSTEM_PROMPT =
  'You are a Quantity Surveyor (QS) assistant in a chat app (like ChatGPT). ' +
  'Talk to the user like a sharp, friendly colleague — natural, clear, and practical. ' +
  'Use short paragraphs, bullet points, and numbered lists where they help. ' +
  'Never invent BOQ figures. Never say "snippet" or "I cannot access documents" when text is provided.';

const THINKING_SYSTEM_PROMPT =
  'You are a QS assistant performing internal document review before answering a colleague. ' +
  'Output bullet points only (use "- "). No headings, no markdown ## sections, no final answer for the user. ' +
  'Maximum 8 bullets, 120 words total.';

const BOQ_ANSWER_FORMAT =
  'Write the chat reply only (no meta-commentary about your process).\n\n' +
  'Style (organic, like ChatGPT/Gemini):\n' +
  '1. Open with 1–2 direct sentences that answer the question.\n' +
  '2. Use ## headings only for major sections (keep headings short).\n' +
  '3. Use bullet points (- ) for lists of items, checks, or takeaways.\n' +
  '4. Use numbered lists (1. 2. 3.) for steps or ranked points.\n' +
  '5. For BOQ line items, use markdown tables:\n' +
  '   | Item | Description | Unit | Qty | Rate | Amount |\n' +
  '6. Keep paragraphs to 2–4 lines max.\n' +
  '7. End with a short **What to verify** bullet list if useful.\n\n' +
  'Suggested flow when explaining a BOQ:\n' +
  '- Brief intro + document/project name\n' +
  '- ## Key sections (earthwork, civil, etc.) with totals\n' +
  '- Tables or bullets for line items\n' +
  '- ## Takeaways for QS\n\n' +
  'Copy numbers exactly from the document. Use "—" for missing data.';

const GARBLED_USER_REPLY =
  'Reply in under 120 words with ONLY:\n' +
  '1. **Problem:** OCR/scan quality is poor.\n' +
  '2. **What to do:** Reprocess in Documents (refresh icon); use a clearer PDF; `ollama pull moondream` for images.\n' +
  '3. **Then ask again.**\n' +
  'No generic QS theory.';

function docContextBlock(contextChunks, docLabel) {
  return (
    `Filename: "${docLabel}"\n\n` +
    `--- DOCUMENT TEXT ---\n\n` +
    contextChunks.map((c, i) => `### Part ${i + 1}\n${c}`).join('\n\n') +
    '\n\n--- END DOCUMENT TEXT ---'
  );
}

export function buildThinkingMessages({ message, contextChunks, retrievalMeta }) {
  const docLabel = retrievalMeta?.usedDocs?.[0] || 'uploaded document';
  const retrievalNotes = (retrievalMeta?.thinking || []).join('\n');

  return {
    messagesToSend: [
      { role: 'system', content: THINKING_SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          `User question: ${message}\n\n` +
          (retrievalNotes ? `System notes:\n${retrievalNotes}\n\n` : '') +
          `${docContextBlock(contextChunks, docLabel)}\n\n` +
          'Bullets: which BOQ sections you see; key quantities/rates spotted; anything unclear; how you will structure the compiled answer.',
      },
    ],
  };
}

export function buildCompiledAnswerMessages({
  message,
  history,
  contextChunks,
  retrievalMeta,
  analysisThinking = '',
}) {
  const uniqueCitations = retrievalMeta?.usedDocs?.length ? [...retrievalMeta.usedDocs] : [];
  const docLabel = uniqueCitations[0] || 'uploaded document';
  const fullContext = contextChunks.join('\n\n');
  const garbled = retrievalMeta?.ocrQuality === 'poor' || (fullContext && isGarbledOcr(fullContext));

  let userContent;

  if (contextChunks.length === 0) {
    userContent =
      'No document text was loaded. Tell the user to upload a BOQ in Documents, wait for **Ready**, then ask again.\n\n' +
      `User question: ${message}`;
  } else if (garbled) {
    userContent =
      `${GARBLED_USER_REPLY}\n\n` +
      `Filename: "${docLabel}"\n\n` +
      `--- Poor extract (do not quote as facts) ---\n${fullContext.slice(0, 800)}\n---\n\n` +
      `User question: ${message}`;
  } else {
    userContent =
      `${BOQ_ANSWER_FORMAT}\n\n` +
      (analysisThinking
        ? `--- INTERNAL ANALYSIS (already done — do not repeat in your reply) ---\n${analysisThinking}\n--- END ANALYSIS ---\n\n`
        : '') +
      `${docContextBlock(contextChunks, docLabel)}\n\n` +
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

/** Single-phase fallback (no document or simple queries). */
export function buildQsChatMessages(opts) {
  return buildCompiledAnswerMessages({ ...opts, analysisThinking: '' });
}

export function splitThinkingLines(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .split(/\n+/)
    .map((l) => l.trim().replace(/^[-*•]\s*/, ''))
    .filter((l) => l.length > 0);
}
