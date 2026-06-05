import { isGarbledOcr } from './ocrQuality.js';
import { isQsWorkQuery } from './responseFormat.js';
import { REGION_CURRENCY_PROMPT } from './qsRegion.js';

const FORMAT_EXAMPLE = `
EXAMPLE of correct formatting (follow this style):

## Summary
Brief answer in 2 sentences.

## Preliminary BOQ
| Item | Description | Unit | Qty | Rate | Amount |
| --- | --- | --- | --- | --- | --- |
| 1 | Excavation | m3 | 10 | SAR 45 | SAR 450 |

## Assumptions
- Assumption one
- Assumption two

## What to verify on site
- Check item A
- Check item B
`;

const QS_SYSTEM_PROMPT =
  'You are a Quantity Surveyor (QS) assistant for Gulf / GCC projects (Saudi Arabia, UAE, and neighbouring markets).\n' +
  'CRITICAL: Never output one long paragraph. Always use markdown structure.\n' +
  'Required: ## headings, blank lines between sections, bullet lists (- ), numbered lists (1. 2. 3.), tables for BOQ lines.\n' +
  'Max 3 sentences per paragraph. If estimating without a tender document, label figures as indicative ranges.\n' +
  REGION_CURRENCY_PROMPT +
  FORMAT_EXAMPLE;

const FORMAT_RULES_BLOCK =
  '\n\n=== MANDATORY FORMAT (do not ignore) ===\n' +
  '1. Start with ## Summary (2 short sentences).\n' +
  '2. Use ## headings for each major section.\n' +
  '3. Put a blank line before every ## heading and before every numbered item.\n' +
  '4. For BOQ/cost items use EITHER a markdown table OR numbered list — never inline "1. 2. 3." in one paragraph.\n' +
  '5. End with ## What to verify (bullet list).\n' +
  '6. Do NOT write "Here is an estimated BOQ:" followed by a wall of text.\n' +
  '=== END FORMAT ===\n';

const THINKING_SYSTEM_PROMPT =
  'Internal review only. Bullet points (- ), max 8 bullets, 120 words. No ## headings. No user-facing answer.';

const DOCUMENT_ANSWER_INTRO =
  'Answer using the document text below. Copy figures exactly from the document when present.\n';

const GENERAL_QS_INTRO =
  'No BOQ document is attached. Give a structured **indicative** QS estimate for the user\'s scenario.\n' +
  'State clearly that figures are preliminary until measured from drawings or a tender BOQ.\n' +
  'Express all costs in SAR (Saudi Riyal) unless the user asks for UAE/AED.\n';

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
          'Bullets: sections seen; key figures; gaps; planned answer structure.',
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
  const hasDocument = contextChunks.length > 0 && !garbled;

  let userContent;

  if (garbled) {
    userContent =
      'OCR quality is poor. Reply with ## Summary, ## Problem, ## What to do (reprocess file, clearer scan), under 120 words.\n\n' +
      `Filename: "${docLabel}"\n\n` +
      `--- Poor extract ---\n${fullContext.slice(0, 800)}\n---\n\n` +
      `User question: ${message}` +
      FORMAT_RULES_BLOCK;
  } else if (hasDocument) {
    userContent =
      `${DOCUMENT_ANSWER_INTRO}\n` +
      (analysisThinking
        ? `--- INTERNAL NOTES (do not repeat) ---\n${analysisThinking}\n---\n\n`
        : '') +
      `${docContextBlock(contextChunks, docLabel)}\n\n` +
      `User question: ${message}` +
      FORMAT_RULES_BLOCK;
  } else if (isQsWorkQuery(message)) {
    userContent =
      `${GENERAL_QS_INTRO}\n` +
      `User question: ${message}` +
      FORMAT_RULES_BLOCK;
  } else {
    userContent =
      `User question: ${message}\n` +
      'Use ## Summary and bullet points. Keep it concise.' +
      (isQsWorkQuery(message) ? FORMAT_RULES_BLOCK : '');
  }

  // Trim history so prior wall-of-text replies do not reinforce bad format
  const trimmedHistory = history.slice(-4).map((m) => {
    if (m.role === 'assistant' && m.content?.length > 2000) {
      return { ...m, content: m.content.slice(0, 500) + '\n\n[Previous reply truncated]' };
    }
    return m;
  });

  return {
    messagesToSend: [
      { role: 'system', content: QS_SYSTEM_PROMPT },
      ...trimmedHistory,
      { role: 'user', content: userContent },
    ],
    uniqueCitations,
    garbled,
  };
}

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
