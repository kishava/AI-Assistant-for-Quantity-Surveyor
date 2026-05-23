/**
 * Splits a larger text block into manageable chunks.
 * Attempts to preserve sentence boundaries and includes a specified overlap.
 * 
 * @param {string} text - The input text to chunk.
 * @param {number} maxWords - Maximum number of words per chunk.
 * @param {number} overlapWords - Number of words to overlap between consecutive chunks.
 * @returns {Array<{content: string}>} - Array of chunks.
 */
export function chunkText(text, maxWords = 250, overlapWords = 50) {
  if (!text || typeof text !== 'string') return [];

  // Normalize whitespace
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  
  // Split into sentences using a regex that keeps the punctuation
  // Matches periods, question marks, and exclamation marks, followed by space or end of string
  const sentenceRegex = /[^.!?]+[.!?]+(\s|$)/g;
  let sentences = normalizedText.match(sentenceRegex);

  // Fallback if regex returns null (e.g. no punctuation or single long word sequence)
  if (!sentences) {
    sentences = normalizedText.split(' ').filter(Boolean).map(word => word + ' ');
  }

  const chunks = [];
  let currentChunkWords = [];
  let currentWordCount = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    if (!sentence) continue;

    const sentenceWords = sentence.split(' ').filter(Boolean);
    const sentenceWordCount = sentenceWords.length;

    // If a single sentence exceeds the maxWords on its own, we split it by words
    if (sentenceWordCount > maxWords) {
      // If we have some content in current chunk, save it first
      if (currentChunkWords.length > 0) {
        chunks.push({ content: currentChunkWords.join(' ') });
        currentChunkWords = [];
        currentWordCount = 0;
      }
      
      // Chunk the massive sentence by words
      for (let j = 0; j < sentenceWords.length; j += (maxWords - overlapWords)) {
        const wordSlice = sentenceWords.slice(j, j + maxWords);
        if (wordSlice.length > 0) {
          chunks.push({ content: wordSlice.join(' ') });
        }
      }
      continue;
    }

    if (currentWordCount + sentenceWordCount > maxWords) {
      // Save current chunk
      chunks.push({ content: currentChunkWords.join(' ') });

      // Create overlap: take last overlapWords from current chunk
      const allWords = currentChunkWords.flatMap(s => s.split(' '));
      const overlapSlice = allWords.slice(-overlapWords);
      
      currentChunkWords = [overlapSlice.join(' '), sentence];
      currentWordCount = overlapSlice.length + sentenceWordCount;
    } else {
      currentChunkWords.push(sentence);
      currentWordCount += sentenceWordCount;
    }
  }

  // Push remaining text if any exists
  if (currentChunkWords.length > 0) {
    const remainingText = currentChunkWords.join(' ').trim();
    if (remainingText) {
      chunks.push({ content: remainingText });
    }
  }

  return chunks;
}
