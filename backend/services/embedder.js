const OLLAMA_URL = process.env.OLLAMA_BASE_URL || process.env.OLLAMA_URL || 'http://localhost:11434';

export async function embedText(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'nomic-embed-text', prompt: text })
  });
  if (!res.ok) throw new Error('Embedding service unavailable');
  const data = await res.json();
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
