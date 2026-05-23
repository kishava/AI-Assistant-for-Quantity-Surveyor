import express from 'express';
import db from '../db.js';
import authMiddleware from '../middleware/auth.js';
import { streamRouteQuery, estimateTokens } from '../services/aiRouter.js';
import { embedText } from '../services/embedder.js';
import { searchChunks } from '../services/vectorStore.js';

const router = express.Router();
const CLOUD_THRESHOLD = parseInt(process.env.CLOUD_THRESHOLD_TOKENS || '1000', 10);

function writeSse(res, payload) {
  res.write(`data: ${payload}\n\n`);
}

function writeSsePrep(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
}

async function retrieveContext(message, userId, documentId) {
  try {
    const queryEmbedding = await embedText(message);
    return await searchChunks(
      queryEmbedding,
      5,
      documentId || null,
      documentId ? null : userId
    );
  } catch (err) {
    console.warn('Vector search skipped:', err.message);
    return [];
  }
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
  const { message, useCloud, forceLocal, documentId } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message content is required' });
  }

  try {
    const contextChunks = await retrieveContext(message, req.user.id, documentId || null);

    const historyStmt = db.prepare(`
      SELECT role, content FROM messages 
      WHERE user_id = ? 
      ORDER BY id DESC LIMIT 6
    `);
    const history = historyStmt.all(req.user.id).reverse();

    const { messagesToSend, uniqueCitations } = buildMessages(
      message,
      history,
      contextChunks,
      documentId || null,
      req.user.id
    );

    const tokenCount = estimateTokens(messagesToSend.map(m => m.content).join('\n'));
    if (tokenCount >= CLOUD_THRESHOLD && !useCloud && !forceLocal) {
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
      !!useCloud,
      !!forceLocal,
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

    const insertMsg = db.prepare('INSERT INTO messages (user_id, role, content, model_used) VALUES (?, ?, ?, ?)');
    insertMsg.run(req.user.id, 'user', message, null);
    insertMsg.run(req.user.id, 'assistant', accumulated, modelLabel);

    writeSse(res, `[MODEL]${modelLabel}`);
    if (uniqueCitations.length > 0) {
      writeSse(res, `[CITATIONS]${JSON.stringify(uniqueCitations)}`);
    }
    writeSse(res, '[DONE]');
    res.end();
  } catch (error) {
    console.error('Chat endpoint error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'An error occurred during chat completion' });
    } else {
      writeSse(res, `[ERROR]${error.message}`);
      writeSse(res, '[DONE]');
      res.end();
    }
  }
});

router.get('/history', authMiddleware, (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT role, content, model_used, created_at 
      FROM messages 
      WHERE user_id = ? 
      ORDER BY id ASC
    `);
    const history = stmt.all(req.user.id);
    res.status(200).json(history);
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

export default router;
