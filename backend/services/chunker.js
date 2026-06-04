/**
 * Splits text into chunks for RAG. Preserves line breaks for BOQ/tables.
 */
export function chunkText(text, maxWords = 250, overlapWords = 50) {
  if (!text || typeof text !== 'string') return [];

  const trimmed = text.replace(/\r\n/g, '\n').trim();
  if (!trimmed) return [];

  const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
  const looksTabular = lines.length >= 8 && lines.some((l) => /\d+[\d,.]*\s*$/.test(l) || /^(sr\.?\s*no|description|qty|rate|amount)/i.test(l));

  if (looksTabular) {
    return chunkByLines(lines, maxWords, overlapWords);
  }

  return chunkBySentences(trimmed, maxWords, overlapWords);
}

function chunkByLines(lines, maxWords, overlapWords) {
  const chunks = [];
  let batch = [];
  let wordCount = 0;

  for (const line of lines) {
    const lineWords = line.split(/\s+/).filter(Boolean).length;
    if (wordCount + lineWords > maxWords && batch.length > 0) {
      chunks.push({ content: batch.join('\n') });
      const flat = batch.join(' ').split(/\s+/).filter(Boolean);
      const overlap = flat.slice(-Math.min(overlapWords, flat.length)).join(' ');
      batch = overlap ? [overlap] : [];
      wordCount = overlap ? overlap.split(/\s+/).length : 0;
    }
    batch.push(line);
    wordCount += lineWords;
  }

  if (batch.length > 0) {
    chunks.push({ content: batch.join('\n') });
  }

  return chunks;
}

function chunkBySentences(text, maxWords, overlapWords) {
  const normalizedText = text.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
  const sentenceRegex = /[^.!?]+[.!?]+(\s|$)/g;
  let sentences = normalizedText.match(sentenceRegex);

  if (!sentences) {
    sentences = normalizedText.split(' ').filter(Boolean).map((word) => `${word} `);
  }

  const chunks = [];
  let currentChunkWords = [];
  let currentWordCount = 0;

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    const sentenceWords = trimmed.split(' ').filter(Boolean);
    const sentenceWordCount = sentenceWords.length;

    if (sentenceWordCount > maxWords) {
      if (currentChunkWords.length > 0) {
        chunks.push({ content: currentChunkWords.join(' ') });
        currentChunkWords = [];
        currentWordCount = 0;
      }
      for (let j = 0; j < sentenceWords.length; j += Math.max(1, maxWords - overlapWords)) {
        const wordSlice = sentenceWords.slice(j, j + maxWords);
        if (wordSlice.length > 0) {
          chunks.push({ content: wordSlice.join(' ') });
        }
      }
      continue;
    }

    if (currentWordCount + sentenceWordCount > maxWords) {
      chunks.push({ content: currentChunkWords.join(' ') });
      const allWords = currentChunkWords.join(' ').split(' ').filter(Boolean);
      const overlapSlice = allWords.slice(-overlapWords);
      currentChunkWords = overlapSlice.length ? [overlapSlice.join(' '), trimmed] : [trimmed];
      currentWordCount = overlapSlice.length + sentenceWordCount;
    } else {
      currentChunkWords.push(trimmed);
      currentWordCount += sentenceWordCount;
    }
  }

  if (currentChunkWords.length > 0) {
    const remainingText = currentChunkWords.join(' ').trim();
    if (remainingText) chunks.push({ content: remainingText });
  }

  return chunks;
}
