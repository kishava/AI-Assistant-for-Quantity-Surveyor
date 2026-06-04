import express from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';
import authMiddleware from '../middleware/auth.js';
import { streamRouteQuery, estimateTokens } from '../services/aiRouter.js';
import { embedText } from '../services/embedder.js';
import { searchChunks } from '../services/vectorStore.js';

const router = express.Router();
const CLOUD_THRESHOLD = parseInt(process.env.CLOUD_THRESHOLD_TOKENS || '1000', 10);

function writeSse(res, payload) {
  const text = String(payload);
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    res.write(`data: ${line}\n`);
  }
  res.write('\n');
}

function writeSsePrep(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
}

function searchChunksFts(message, userId, documentId, topK = 5) {
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
      LIMIT ?
    `);
    return stmt.all(terms, userId, topK).map((r) => r.content);
  } catch (err) {
    console.warn('FTS search skipped:', err.message);
    return [];
  }
}

async function retrieveContext(message, userId, documentId) {
  try {
    const queryEmbedding = await embedText(message);
    const vectorResults = await searchChunks(
      queryEmbedding,
      5,
      documentId || null,
      documentId ? null : userId
    );
    if (vectorResults.length > 0) return vectorResults;
  } catch (err) {
    console.warn('Vector search skipped:', err.message);
  }

  return searchChunksFts(message, userId, documentId || null);
}

function buildMessages(message, history, contextChunks, documentId, userId) {
  let contextHeader = '';
  let uniqueCitations = [];

  if (contextChunks.length > 0) {
    if (documentId) {
      const docStmt = db.prepare('SELECT filename FROM documents WHERE id = ? AND user_id = ?');
      const doc = docStmt.get(documentId, userId);
      if (doc) uniqueCitations = [doc.filename];
    } else {
      uniqueCitations = ['Uploaded documents'];
    }

    contextHeader = `Here are snippets from the uploaded documents that match the query:\n\n` +
      contextChunks.map(c => `"${c}"`).join('\n\n') +
      `\n\nInstructions: Answer the question using the snippets. Refer to the specific documents when citing answers. If you cannot find the answer in the snippets, answer based on general Quantity Surveying (QS) principles but explicitly note that the information was not in the uploaded documents.\n\n`;
  }

  const messagesToSend = [
    {
      role: 'system',
      content: 'You are an expert Quantity Surveyor (QS) AI assistant. Provide professional, detailed estimates, calculations, cost-benefit descriptions, or specifications. Keep explanations precise and clear.'
    },
    ...history,
    {
      role: 'user',
      content: contextHeader + `Question: ${message}`
    }
  ];

  return { messagesToSend, uniqueCitations };
}

router.post('/', authMiddleware, async (req, res) => {
  const { message, useCloud, forceLocal, documentId, conversationId, allowGroqDocs } = req.body;
  const activeConversationId = conversationId || 'default';

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message content is required' });
  }

  const isGuest = req.user.username === 'guest';
  const canSendDocsToCloud = allowGroqDocs === true;

  // 1. Guests cannot use cloud services at all
  let finalUseCloud = isGuest ? false : !!useCloud;
  let finalForceLocal = isGuest ? true : !!forceLocal;

  // 2. Groq cloud context allowance: if not allowed to read documents and we are in a document context, force local execution (Ollama)
  if (!canSendDocsToCloud && finalUseCloud && documentId) {
    finalUseCloud = false;
    finalForceLocal = true;
  }

  try {
    // Verify conversation exists and belongs to user (except 'default')
    if (activeConversationId !== 'default') {
      const convStmt = db.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?');
      const conv = convStmt.get(activeConversationId, req.user.id);
      if (!conv) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
    }

    // Only retrieve document chunks if NOT using cloud or if cloud doc reading is allowed
    let contextChunks = [];
    if (!finalUseCloud || canSendDocsToCloud) {
      contextChunks = await retrieveContext(message, req.user.id, documentId || null);
    }

    const historyStmt = db.prepare(`
      SELECT role, content FROM messages 
      WHERE user_id = ? AND conversation_id = ?
      ORDER BY id DESC LIMIT 6
    `);
    const history = historyStmt.all(req.user.id, activeConversationId).reverse();

    const { messagesToSend, uniqueCitations } = buildMessages(
      message,
      history,
      contextChunks,
      documentId || null,
      req.user.id
    );

    const tokenCount = estimateTokens(messagesToSend.map(m => m.content).join('\n'));
    if (tokenCount >= CLOUD_THRESHOLD && !finalUseCloud && !finalForceLocal && !isGuest) {
      return res.status(200).json({
        consentRequired: true,
        tokenCount,
        threshold: CLOUD_THRESHOLD,
        message: 'This query is large. Send to Groq cloud for a faster response?'
      });
    }

    writeSsePrep(res);
    writeSse(res, '[STAGE]Generating answer…');

    let accumulated = '';
    const aiResult = await streamRouteQuery(
      messagesToSend,
      finalUseCloud,
      finalForceLocal,
      (token) => {
        accumulated += token;
        writeSse(res, token);
      }
    );

    if (aiResult.consentRequired) {
      writeSse(res, '[ERROR]Consent required for large query');
      writeSse(res, '[DONE]');
      return res.end();
    }

    const modelLabel = `${aiResult.provider} (${aiResult.model})`;

    const insertMsg = db.prepare('INSERT INTO messages (user_id, role, content, model_used, conversation_id) VALUES (?, ?, ?, ?, ?)');
    insertMsg.run(req.user.id, 'user', message, null, activeConversationId);
    insertMsg.run(req.user.id, 'assistant', accumulated, modelLabel, activeConversationId);

    writeSse(res, `[MODEL]${modelLabel}`);
    if (uniqueCitations.length > 0) {
      writeSse(res, `[CITATIONS]${JSON.stringify(uniqueCitations)}`);
    }
    writeSse(res, '[DONE]');
    res.end();
  } catch (error) {
    console.error('Chat endpoint error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'An error occurred during chat completion' });
    } else {
      writeSse(res, '[ERROR]An internal error occurred during chat completion');
      writeSse(res, '[DONE]');
      res.end();
    }
  }
});

router.get('/history', authMiddleware, (req, res) => {
  const conversationId = req.query.conversationId || 'default';
  try {
    const stmt = db.prepare(`
      SELECT role, content, model_used, created_at 
      FROM messages 
      WHERE user_id = ? AND conversation_id = ?
      ORDER BY id ASC
    `);
    const history = stmt.all(req.user.id, conversationId);
    res.status(200).json(history);
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// GET all conversations for the user
router.get('/conversations', authMiddleware, (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT id, title, provider, created_at 
      FROM conversations 
      WHERE user_id = ? 
      ORDER BY created_at DESC
    `);
    const list = stmt.all(req.user.id);
    res.status(200).json(list);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// POST create a new conversation
router.post('/conversations', authMiddleware, (req, res) => {
  const { title, provider } = req.body;
  const conversationId = randomUUID();
  const conversationTitle = (typeof title === 'string' && title.trim()) ? title.trim() : 'New Chat';
  const conversationProvider = (provider === 'groq' || provider === 'local') ? provider : 'local';

  try {
    const stmt = db.prepare(`
      INSERT INTO conversations (id, user_id, title, provider)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(conversationId, req.user.id, conversationTitle, conversationProvider);

    res.status(201).json({
      id: conversationId,
      user_id: req.user.id,
      title: conversationTitle,
      provider: conversationProvider
    });
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// PUT rename conversation title
router.put('/conversations/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { title, provider } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    // Verify ownership
    const checkStmt = db.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?');
    const existing = checkStmt.get(id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const updateStmt = db.prepare(`
      UPDATE conversations 
      SET title = ?, provider = ?
      WHERE id = ? AND user_id = ?
    `);
    updateStmt.run(title.trim(), provider || 'local', id, req.user.id);

    res.status(200).json({ id, title: title.trim(), provider: provider || 'local' });
  } catch (error) {
    console.error('Update conversation error:', error);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

// DELETE a conversation
router.delete('/conversations/:id', authMiddleware, (req, res) => {
  const { id } = req.params;

  try {
    // Verify ownership
    const checkStmt = db.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?');
    const existing = checkStmt.get(id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Delete associated messages
    const deleteMsgs = db.prepare('DELETE FROM messages WHERE conversation_id = ? AND user_id = ?');
    deleteMsgs.run(id, req.user.id);

    // Delete conversation
    const deleteConv = db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?');
    deleteConv.run(id, req.user.id);

    res.status(200).json({ message: 'Conversation deleted successfully' });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

export default router;
