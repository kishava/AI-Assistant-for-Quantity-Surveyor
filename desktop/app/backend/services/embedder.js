import { ensureModelPulled } from './ollamaModelHelper.js';

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBED_TIMEOUT_MS = parseInt(process.env.EMBED_TIMEOUT_MS || '15000', 10);

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Embedding request timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function embedText(text) {
  await ensureModelPulled('nomic-embed-text');
  const res = await fetchWithTimeout(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'nomic-embed-text', prompt: text })
  }, EMBED_TIMEOUT_MS);

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Embedding service unavailable: ${errText || res.statusText}`);
  }

  const data = await res.json();
  if (!data.embedding) {
    throw new Error('Embedding service returned no vector — run: ollama pull nomic-embed-text');
  }
  return data.embedding;
}

export async function embedBatch(texts) {
  const embeddings = [];
  for (const text of texts) {
    const emb = await embedText(text);
    embeddings.push(emb);
  }
  return embeddings;
}
