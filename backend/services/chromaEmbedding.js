import { embedText } from './embedder.js';

/** Chroma collection embedding function — uses Ollama nomic-embed-text (same as app embedder). */
export const ollamaChromaEmbedding = {
  name: 'ollama-nomic-embed',
  defaultSpace() {
    return 'cosine';
  },
  supportedSpaces() {
    return ['cosine'];
  },
  async generate(texts) {
    const vectors = [];
    for (const text of texts) {
      vectors.push(await embedText(text));
    }
    return vectors;
  },
};
