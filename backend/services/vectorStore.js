import { ChromaClient } from 'chromadb';
import { ollamaChromaEmbedding } from './chromaEmbedding.js';

const CHROMA_URL = process.env.CHROMA_URL || 'http://localhost:8000';

function createChromaClient(url) {
  try {
    const parsed = new URL(url);
    const port = parsed.port
      ? parseInt(parsed.port, 10)
      : (parsed.protocol === 'https:' ? 443 : 80);
    return new ChromaClient({
      host: parsed.hostname,
      port,
      ssl: parsed.protocol === 'https:',
    });
  } catch {
    return new ChromaClient({ host: 'localhost', port: 8000, ssl: false });
  }
}

const client = createChromaClient(CHROMA_URL);
const COLLECTION_NAME = 'qs_documents';

let collection = null;

async function getCollection() {
  if (!collection) {
    collection = await client.getOrCreateCollection({
      name: COLLECTION_NAME,
      metadata: { 'hnsw:space': 'cosine' },
      embeddingFunction: ollamaChromaEmbedding,
    });
  }
  return collection;
}

export async function storeChunks(chunks, embeddings) {
  try {
    const col = await getCollection();
    await col.upsert({
      ids: chunks.map(c => c.id),
      documents: chunks.map(c => c.text),
      embeddings: embeddings,
      metadatas: chunks.map(c => ({
        documentId: String(c.documentId),
        chunkIndex: String(c.chunkIndex),
        userId: String(c.userId || ''),
      })),
    });
    return true;
  } catch (error) {
    console.warn('ChromaDB storeChunks failed:', error.message);
    return false;
  }
}

export async function searchChunks(queryEmbedding, topK = 5, documentId = null, userId = null) {
  try {
    const col = await getCollection();
    const where = documentId
      ? { documentId: String(documentId) }
      : userId
        ? { userId: String(userId) }
        : undefined;
    const results = await col.query({
      queryEmbeddings: [queryEmbedding],
      nResults: topK,
      where
    });
    return results.documents[0] || [];
  } catch (error) {
    console.warn('ChromaDB search unavailable:', error.message);
    return [];
  }
}

export async function deleteDocumentChunks(documentId) {
  try {
    const col = await getCollection();
    await col.delete({ where: { documentId: String(documentId) } });
  } catch (error) {
    console.warn(`ChromaDB delete skipped for document ${documentId}:`, error.message);
  }
}

export async function checkChromaHealth() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${CHROMA_URL}/api/v2/heartbeat`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { status: 'error', message: `HTTP ${res.status}` };
    return { status: 'ok', url: CHROMA_URL };
  } catch (err) {
    try {
      await client.heartbeat();
      return { status: 'ok', url: CHROMA_URL };
    } catch (inner) {
      return { status: 'error', message: inner.message || err.message };
    }
  }
}
