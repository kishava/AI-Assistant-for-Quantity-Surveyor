import { ChromaClient } from 'chromadb';

const client = new ChromaClient({ path: 'http://localhost:8000' });
const COLLECTION_NAME = 'qs_documents';

let collection = null;

async function getCollection() {
  if (!collection) {
    collection = await client.getOrCreateCollection({
      name: COLLECTION_NAME,
      metadata: { 'hnsw:space': 'cosine' }
    });
  }
  return collection;
}

// Store chunks with embeddings
// chunks: [{ id, text, documentId, chunkIndex, userId }]
// embeddings: number[][] — one per chunk
export async function storeChunks(chunks, embeddings) {
  const col = await getCollection();
  await col.upsert({
    ids: chunks.map(c => c.id),
    documents: chunks.map(c => c.text),
    embeddings: embeddings,
    metadatas: chunks.map(c => ({
      documentId: String(c.documentId),
      chunkIndex: String(c.chunkIndex),
      userId: String(c.userId || '')
    }))
  });
}

// Query top-k relevant chunks for a given query embedding
export async function searchChunks(queryEmbedding, topK = 5, documentId = null, userId = null) {
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
}

// Delete all chunks for a document
export async function deleteDocumentChunks(documentId) {
  const col = await getCollection();
  await col.delete({ where: { documentId: String(documentId) } });
}
