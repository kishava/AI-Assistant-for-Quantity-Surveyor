import db from '../db.js';
import { embedText } from './embedder.js';
import { searchChunks } from './vectorStore.js';
import { assessDocumentText } from './ocrQuality.js';

function isBoqStyleQuery(message) {
  const q = message.toLowerCase();
  return /boq|bill of quantit|quantity|tender|earth\s*work|excavation|formwork|section\s*\d|explain.*(document|upload|boq)/i.test(q);
}

function searchChunksFts(message, userId, documentId, topK = 8) {
  const terms = message
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .map((w) => `"${w.replace(/"/g, '""')}"`)
    .join(' OR ');
  if (!terms) return [];

  try {
    if (documentId) {
      const stmt = db.prepare(`
        SELECT f.content FROM chunks_fts f
        WHERE chunks_fts MATCH ? AND f.document_id = ?
        LIMIT ?
      `);
      return stmt.all(terms, documentId, topK).map((r) => r.content);
    }
    const stmt = db.prepare(`
      SELECT f.content FROM chunks_fts f
      INNER JOIN documents d ON d.id = f.document_id
      WHERE chunks_fts MATCH ? AND d.user_id = ?
      ORDER BY d.created_at DESC
      LIMIT ?
    `);
    return stmt.all(terms, userId, topK).map((r) => r.content);
  } catch (err) {
    console.warn('FTS search skipped:', err.message);
    return [];
  }
}

function loadSequentialChunks(documentId, limit = 14) {
  const stmt = db.prepare(`
    SELECT content FROM chunks
    WHERE document_id = ?
    ORDER BY id ASC
    LIMIT ?
  `);
  return stmt.all(documentId, limit).map((r) => r.content);
}

function loadAllChunks(documentId, limit = 40) {
  return loadSequentialChunks(documentId, limit);
}

async function loadChunksForDocument(documentId, message, topK = 6) {
  const chunks = [];

  if (isBoqStyleQuery(message)) {
    chunks.push(...loadAllChunks(documentId, 22));
    if (chunks.length >= 6) {
      return chunks.slice(0, 22);
    }
  }

  try {
    const queryEmbedding = await embedText(message);
    const vectorResults = await searchChunks(queryEmbedding, topK, documentId, null);
    for (const c of vectorResults) {
      if (!chunks.includes(c)) chunks.push(c);
    }
  } catch (err) {
    console.warn('Vector search for document skipped:', err.message);
  }

  if (chunks.length < 4) {
    for (const c of searchChunksFts(message, null, documentId, topK)) {
      if (!chunks.includes(c)) chunks.push(c);
    }
  }

  if (chunks.length === 0) {
    chunks.push(...loadSequentialChunks(documentId, 10));
  }

  return chunks.slice(0, 18);
}

function getLatestReadyDocument(userId) {
  return db.prepare(`
    SELECT id, filename, created_at FROM documents
    WHERE user_id = ? AND status = 'ready'
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get(userId);
}

function getSecondLatestReadyDocument(userId, excludeId) {
  return db.prepare(`
    SELECT id, filename, created_at FROM documents
    WHERE user_id = ? AND status = 'ready' AND id != ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get(userId, excludeId);
}

/**
 * Retrieve context prioritizing the most recently uploaded document.
 * Older documents are only used if the query likely needs them or the latest has little text.
 */
export async function retrieveContext(message, userId, explicitDocumentId = null) {
  const meta = { primaryDoc: null, usedDocs: [], thinking: [] };

  if (explicitDocumentId) {
    const doc = db.prepare(
      'SELECT id, filename, created_at FROM documents WHERE id = ? AND user_id = ? AND status = ?'
    ).get(explicitDocumentId, userId, 'ready');
    if (!doc) {
      meta.thinking.push('Attached document is not ready or was not found.');
      return { chunks: [], meta };
    }
    meta.primaryDoc = doc;
    meta.usedDocs = [doc.filename];
    meta.thinking.push(`Reading attached document: ${doc.filename} (uploaded ${doc.created_at}).`);
    let chunks = await loadChunksForDocument(doc.id, message);
    return finalizeRetrieval(chunks, meta);
  }

  const latest = getLatestReadyDocument(userId);
  if (!latest) {
    meta.thinking.push('No processed documents found. Upload a BOQ or spec in Documents first.');
    return { chunks: [], meta };
  }

  meta.primaryDoc = latest;
  meta.usedDocs.push(latest.filename);
  meta.thinking.push(
    `Using your most recent upload: "${latest.filename}" (${latest.created_at}). Older files are skipped unless needed.`
  );

  let chunks = await loadChunksForDocument(latest.id, message);

  const needsMore = chunks.join(' ').length < 400 && !isBoqStyleQuery(message);
  if (needsMore) {
    const older = getSecondLatestReadyDocument(userId, latest.id);
    if (older) {
      meta.thinking.push(`Adding context from previous upload: "${older.filename}".`);
      meta.usedDocs.push(older.filename);
      const olderChunks = await loadChunksForDocument(older.id, message, 4);
      for (const c of olderChunks) {
        if (!chunks.includes(c)) chunks.push(c);
      }
    }
  }

  if (chunks.length === 0) {
    meta.thinking.push('Could not load text from the document. Try re-uploading a clearer PDF or image.');
  }

  return finalizeRetrieval(chunks, meta);
}

function finalizeRetrieval(chunks, meta) {
  const trimmed = chunks.slice(0, 24);
  const joined = trimmed.join('\n\n');
  const quality = assessDocumentText(joined);
  meta.ocrQuality = quality.label === 'poor' ? 'poor' : 'good';

  if (quality.garbled) {
    meta.thinking.push(
      'Scan/OCR quality looks poor — answers may be limited. Use Reprocess (refresh) on this file or upload a clearer PDF.'
    );
  } else {
    meta.thinking.push(`Loaded ${trimmed.length} text section(s) from the document (readable extract).`);
  }

  return { chunks: trimmed, meta };
}
