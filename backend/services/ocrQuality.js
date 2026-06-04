/**
 * Heuristic score for whether extracted document text is usable for BOQ Q&A.
 * Returns 0 (unusable) to 1 (likely good OCR).
 */
export function ocrQualityScore(text) {
  if (!text || typeof text !== 'string') return 0;

  const trimmed = text.trim();
  if (trimmed.length < 30) return 0.1;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 8) return 0.15;

  const avgWordLen = words.reduce((s, w) => s + w.length, 0) / words.length;
  const shortOrOdd = words.filter((w) => {
    if (w.length <= 1) return true;
    if (/^[^a-zA-Z0-9]{1,3}$/.test(w)) return true;
    const consonantRun = w.match(/[bcdfghjklmnpqrstvwxyz]{5,}/i);
    return consonantRun && w.length < 8;
  }).length;
  const oddRatio = shortOrOdd / words.length;

  const hasBoqSignals = /(bill of quantit|boq|earth\s*work|civil work|excavation|formwork|cum|sqm|m20|m10|rate|amount|tender|dnd)/i.test(trimmed);
  const hasTableNumbers = /\d{1,3}[,.]?\d*\s*(cum|sqm|nos|ls|kg|m3|m2)?/i.test(trimmed);
  const hasCurrency = /[\d,]+\.\d{2}/.test(trimmed);

  let score = 0.35;
  if (avgWordLen >= 3.5) score += 0.15;
  if (oddRatio < 0.2) score += 0.2;
  else if (oddRatio > 0.4) score -= 0.35;
  if (hasBoqSignals) score += 0.15;
  if (hasTableNumbers) score += 0.1;
  if (hasCurrency) score += 0.1;
  if (trimmed.length > 500) score += 0.05;

  return Math.max(0, Math.min(1, score));
}

export function isGarbledOcr(text) {
  return ocrQualityScore(text) < 0.42;
}

export function assessDocumentText(text) {
  const score = ocrQualityScore(text);
  return {
    score,
    garbled: score < 0.42,
    label: score >= 0.55 ? 'good' : score >= 0.42 ? 'fair' : 'poor',
  };
}
