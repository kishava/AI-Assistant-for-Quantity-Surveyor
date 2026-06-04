import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import db from '../db.js';
import authMiddleware from '../middleware/auth.js';
import { parseDocument } from '../services/docParser.js';
import { validateUploadedFile } from '../services/fileValidation.js';
import { ALLOWED_EXTENSIONS, SUPPORTED_FORMATS_LABEL } from '../config/fileTypes.js';
import { chunkText } from '../services/chunker.js';
import { embedBatch } from '../services/embedder.js';
import { storeChunks, deleteDocumentChunks } from '../services/vectorStore.js';
import { routeQuery } from '../services/aiRouter.js';
import paths from '../config/paths.js';

const router = express.Router();

const uploadDir = paths.uploadsDir;
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Supported: ${SUPPORTED_FORMATS_LABEL}`));
    }
  }
});

async function indexDocumentVectors(docId, chunks, userId) {
  const maxChunks = 40;
  const limitedChunks = chunks.slice(0, maxChunks);
  if (limitedChunks.length === 0) {
    return;
  }
  const chunkTexts = limitedChunks.map(c => c.content);
  const chunkObjects = chunkTexts.map((text, i) => ({
    id: `doc_${docId}_chunk_${i}`,
    text,
    documentId: docId,
    chunkIndex: i,
    userId,
  }));

  try {
    const embeddings = await embedBatch(chunkTexts);
    const indexed = await storeChunks(chunkObjects, embeddings);
    if (!indexed) {
      console.warn(`Document ${docId}: vector search unavailable (start ChromaDB on port 8000).`);
    }
  } catch (vectorErr) {
    console.warn(`Document ${docId}: vector indexing skipped:`, vectorErr.message);
  }
}

// Background processor for parsing and chunking
async function processDocument(docId, filePath) {
  try {
    console.log(`[documents] Processing ID ${docId}: ${filePath}`);
    const text = await parseDocument(filePath);
    if (!text.trim()) {
      throw new Error('Document content is empty — no text could be extracted');
    }

    const chunks = chunkText(text, 250, 50);
    if (chunks.length === 0) {
      throw new Error('Document produced no searchable chunks');
    }

    const insertTransaction = db.transaction((chunksArray, id) => {
      const insertChunk = db.prepare('INSERT INTO chunks (document_id, content, page_num) VALUES (?, ?, ?)');
      const insertFts = db.prepare('INSERT INTO chunks_fts (content, chunk_id, document_id) VALUES (?, ?, ?)');

      for (const chunk of chunksArray) {
        const res = insertChunk.run(id, chunk.content, chunk.page_num || null);
        insertFts.run(chunk.content, res.lastInsertRowid, id);
      }
    });

    insertTransaction(chunks, docId);

    const docRow = db.prepare('SELECT user_id FROM documents WHERE id = ?').get(docId);
    const userId = docRow?.user_id;

    const updateStmt = db.prepare('UPDATE documents SET status = ?, error_message = NULL WHERE id = ?');
    updateStmt.run('ready', docId);
    console.log(`Document ${docId} ready (${chunks.length} chunks); indexing vectors in background…`);

    indexDocumentVectors(docId, chunks, userId).catch((err) => {
      console.warn(`Document ${docId}: background vector index failed:`, err.message);
    });
  } catch (error) {
    console.error(`Document processing failed for ID: ${docId}`, error);
    try {
      const updateStmt = db.prepare('UPDATE documents SET status = ?, error_message = ? WHERE id = ?');
      updateStmt.run('failed', error.message || String(error), docId);
    } catch (dbErr) {
      console.error('Failed to update document error status in DB:', dbErr);
    }
  }
}

function parseBoqJson(aiResponse) {
  let cleaned = aiResponse.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  return JSON.parse(cleaned);
}

// Upload endpoint
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const isValidFile = await validateUploadedFile(req.file);
    if (!isValidFile) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: 'Uploaded file content does not match the allowed document type' });
    }

    const insertStmt = db.prepare(
      'INSERT INTO documents (filename, file_path, file_size, user_id, status) VALUES (?, ?, ?, ?, ?)'
    );
    const result = insertStmt.run(
      req.file.originalname,
      req.file.path,
      req.file.size,
      req.user.id,
      'processing'
    );

    const docId = result.lastInsertRowid;

    processDocument(docId, req.file.path).catch(err => {
      console.error('Background processing promise error:', err);
    });

    res.status(202).json({
      message: 'File uploaded and is being processed.',
      document: {
        id: docId,
        filename: req.file.originalname,
        file_size: req.file.size,
        status: 'processing',
        error_message: null
      }
    });
  } catch (error) {
    console.error('Upload route error:', error);
    if (req.file && req.file.path) {
      await fs.promises.unlink(req.file.path).catch(() => {});
    }
    res.status(500).json({ error: 'Failed to record document upload in database' });
  }
});

// List documents endpoint
router.get('/', authMiddleware, (req, res) => {
  try {
    const stmt = db.prepare(
      'SELECT id, filename, file_size, status, error_message, created_at FROM documents WHERE user_id = ? ORDER BY created_at DESC'
    );
    const documents = stmt.all(req.user.id);
    res.status(200).json(documents);
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: 'Failed to retrieve documents' });
  }
});

// BOQ extraction endpoint
router.post('/:id/extract-boq', authMiddleware, async (req, res) => {
  const docId = req.params.id;

  try {
    const getStmt = db.prepare('SELECT id, filename FROM documents WHERE id = ? AND user_id = ?');
    const doc = getStmt.get(docId, req.user.id);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found or access denied' });
    }

    const chunksStmt = db.prepare(
      'SELECT content FROM chunks WHERE document_id = ? ORDER BY id ASC LIMIT 6'
    );
    const chunkRows = chunksStmt.all(docId);
    const documentText = chunkRows.map(r => r.content).join('\n');

    if (!documentText.trim()) {
      return res.status(400).json({ error: 'No document content available for BOQ extraction' });
    }

    const prompt = `You are a Quantity Surveyor AI assistant. Analyse the following construction document text and extract a Bill of Quantities (BOQ).

Return ONLY a valid JSON array. No explanation. No markdown. No preamble. Just the raw JSON array.

Each item in the array must have these exact keys:
- "item_no": string (e.g. "1.1", "1.2", "2.1")
- "description": string (what the work item is)
- "unit": string (e.g. "m2", "m3", "nr", "ls", "kg")
- "quantity": number or null if not found
- "rate": number or null if not found
- "amount": number or null if not found

Document text:
${documentText}`;

    const messagesToSend = [
      {
        role: 'system',
        content: 'You are an expert Quantity Surveyor AI assistant. Return only valid JSON arrays when asked.'
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    const aiResult = await routeQuery(messagesToSend, false, true);
    const aiResponse = aiResult.content || '';

    try {
      const parsedArray = parseBoqJson(aiResponse);
      if (!Array.isArray(parsedArray)) {
        throw new Error('Response is not a JSON array');
      }
      return res.status(200).json({
        items: parsedArray,
        document_id: docId,
        extracted_at: new Date().toISOString()
      });
    } catch (parseErr) {
      return res.status(200).json({
        error: 'Could not extract BOQ from this document',
        raw: aiResponse
      });
    }
  } catch (error) {
    console.error('BOQ extraction error:', error);
    res.status(500).json({ error: 'Failed to extract BOQ' });
  }
});

// Re-chunk and re-index an existing upload (e.g. after chunker/OCR improvements)
router.post('/:id/reprocess', authMiddleware, async (req, res) => {
  const docId = req.params.id;

  try {
    const doc = db.prepare(
      'SELECT id, file_path, filename FROM documents WHERE id = ? AND user_id = ?'
    ).get(docId, req.user.id);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found or access denied' });
    }

    if (!fs.existsSync(doc.file_path)) {
      return res.status(400).json({ error: 'Original file is missing on disk. Please upload again.' });
    }

    db.prepare('DELETE FROM chunks WHERE document_id = ?').run(docId);
    db.prepare('DELETE FROM chunks_fts WHERE document_id = ?').run(docId);

    try {
      await deleteDocumentChunks(docId);
    } catch (chromaErr) {
      console.warn(`Reprocess: could not clear vector chunks for ${docId}:`, chromaErr.message);
    }

    db.prepare('UPDATE documents SET status = ?, error_message = NULL WHERE id = ?').run('processing', docId);

    res.status(202).json({
      message: `Reprocessing "${doc.filename}" with updated text extraction.`,
      document_id: docId,
      status: 'processing'
    });

    processDocument(docId, doc.file_path);
  } catch (error) {
    console.error('Reprocess document error:', error);
    res.status(500).json({ error: 'Failed to reprocess document' });
  }
});

// Delete document endpoint
router.delete('/:id', authMiddleware, async (req, res) => {
  const docId = req.params.id;

  try {
    const getStmt = db.prepare('SELECT file_path, filename FROM documents WHERE id = ? AND user_id = ?');
    const doc = getStmt.get(docId, req.user.id);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found or access denied' });
    }

    db.prepare('DELETE FROM chunks WHERE document_id = ?').run(docId);
    db.prepare('DELETE FROM chunks_fts WHERE document_id = ?').run(docId);

    const deleteDoc = db.prepare('DELETE FROM documents WHERE id = ? AND user_id = ?');
    deleteDoc.run(docId, req.user.id);

    try {
      await deleteDocumentChunks(docId);
    } catch (chromaErr) {
      console.warn(`Could not delete ChromaDB chunks for document ${docId}:`, chromaErr);
    }

    try {
      await fs.promises.unlink(doc.file_path);
    } catch (fileErr) {
      console.warn(`Could not delete file on disk at: ${doc.file_path}`, fileErr);
    }

    res.status(200).json({ message: `Document '${doc.filename}' deleted successfully` });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
