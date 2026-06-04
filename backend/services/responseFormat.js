/**
 * Light post-processing so local models (e.g. phi3) break up wall-of-text BOQ answers.
 */

export function isQsWorkQuery(message) {
  return /boq|bill of quantit|budget|estimate|cost|generator|room|construction|tender|quantity|measurement|rate|specification/i.test(
    message || ''
  );
}

/** Fix common wall-of-text patterns in a complete or partial string. */
export function enhanceMarkdownStructure(text) {
  if (!text || typeof text !== 'string') return text;

  let t = text.replace(/\r\n/g, '\n');

  // Headings without leading newline
  t = t.replace(/([^\n])\s*(##\s+)/g, '$1\n\n$2');
  t = t.replace(/([^\n])\s*(###\s+)/g, '$1\n\n$2');

  // Numbered list items stuck in paragraphs: "BOQ: 1. Site" or ". 2. Concrete"
  t = t.replace(/:\s*(\d+\.\s)/g, ':\n\n$1');
  t = t.replace(/([.!?])\s+(\d+\.\s)/g, '$1\n\n$2');
  t = t.replace(/([a-zA-Z])\s+(\d+\.\s+[A-Z])/g, '$1\n\n$2');

  // Bullet points stuck inline
  t = t.replace(/([.!?])\s+-\s+/g, '$1\n\n- ');
  t = t.replace(/([^\n])\s+-\s+\*\*/g, '$1\n\n- **');

  // Bold section labels without breaks
  t = t.replace(/([^\n])\s*(\*\*[A-Z][^*]+\*\*:)/g, '$1\n\n$2');

  // Collapse excessive newlines
  t = t.replace(/\n{4,}/g, '\n\n\n');

  return t.trim();
}

/** Apply per streaming token (safe for incremental output). */
export function formatStreamToken(token) {
  if (!token) return token;
  let out = token;
  out = out.replace(/:\s*(\d+\.\s)/g, ':\n\n$1');
  out = out.replace(/([.!?])\s+(\d+\.\s)/g, '$1\n\n$2');
  out = out.replace(/(\S)(##\s)/g, '$1\n\n$2');
  return out;
}
