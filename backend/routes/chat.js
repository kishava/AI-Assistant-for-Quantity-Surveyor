import express from 'express';
import db from '../db.js';
import authMiddleware from '../middleware/auth.js';
import { routeQuery } from '../services/aiRouter.js';
import { embedText } from '../services/embedder.js';
import { searchChunks } from '../services/vectorStore.js';

const router = express.Router();

// POST /api/chat - RAG Query Endpoint
router.post('/', authMiddleware, async (req, res) => {
  const { message, useCloud, forceLocal, documentId } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message content is required' });
  }

  try {
    const queryEmbedding = await embedText(message);
    const contextChunks = await searchChunks(
      queryEmbedding,
      5,
      documentId || null,
      documentId ? null : req.user.id
    );

    const historyStmt = db.prepare(`
      SELECT role, content FROM messages 
      WHERE user_id = ? 
      ORDER BY id DESC LIMIT 6
    `);
    const history = historyStmt.all(req.user.id).reverse();

    let contextHeader = '';
    let uniqueCitations = [];

    if (contextChunks.length > 0) {
      if (documentId) {
        const docStmt = db.prepare('SELECT filename FROM documents WHERE id = ? AND user_id = ?');
        const doc = docStmt.get(documentId, req.user.id);
        if (doc) {
          uniqueCitations = [doc.filename];
        }
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

    const aiResult = await routeQuery(messagesToSend, !!useCloud, !!forceLocal);

    if (aiResult.consentRequired) {
      return res.status(200).json({
        consentRequired: true,
        tokenCount: aiResult.tokenCount,
        threshold: aiResult.threshold,
        message: 'This query requires sending context to cloud-based Groq. Do you consent?'
      });
    }

    const insertMsg = db.prepare('INSERT INTO messages (user_id, role, content, model_used) VALUES (?, ?, ?, ?)');
    insertMsg.run(req.user.id, 'user', message, null);

    const modelLabel = `${aiResult.provider} (${aiResult.model})`;
    insertMsg.run(req.user.id, 'assistant', aiResult.content, modelLabel);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reply = aiResult.content || '';
    const words = reply.split(' ');
    for (const word of words) {
      res.write(`data: ${word} \n\n`);
      await new Promise(r => setTimeout(r, 30));
    }
    res.write(`data: [MODEL]${modelLabel}\n\n`);
    if (uniqueCitations.length > 0) {
      res.write(`data: [CITATIONS]${JSON.stringify(uniqueCitations)}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Chat endpoint error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'An error occurred during chat completion' });
    } else {
      res.write(`data: [ERROR]${error.message}\n\n`);
      res.end();
    }
  }
});

// GET /api/chat/history - Retrieve Conversation History
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
