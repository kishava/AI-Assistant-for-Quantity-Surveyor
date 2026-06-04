import express from 'express';
import db from '../db.js';
import authMiddleware from '../middleware/auth.js';
import { routeQuery } from '../services/aiRouter.js';
import { retrieveContext } from '../services/contextRetrieval.js';
import {
  QS_OUTPUT_TYPES,
  buildGenerateMessages,
  parseQsOutputJson,
} from '../services/qsOutputs.js';

const router = express.Router();

router.get('/types', authMiddleware, (_req, res) => {
  const types = Object.entries(QS_OUTPUT_TYPES).map(([id, spec]) => ({
    id,
    label: spec.label,
    description: spec.description,
  }));
  res.json({ types });
});

router.post('/generate', authMiddleware, async (req, res) => {
  const { type, documentId, hint } = req.body;

  if (!type || typeof type !== 'string') {
    return res.status(400).json({ error: 'Output type is required' });
  }
  if (!QS_OUTPUT_TYPES[type]) {
    return res.status(400).json({ error: `Unknown output type: ${type}` });
  }

  try {
    const retrieved = await retrieveContext(
      hint || `Generate ${type} table from BOQ`,
      req.user.id,
      documentId || null
    );

    const documentText = retrieved.chunks.join('\n\n');
    const docLabel = retrieved.meta?.usedDocs?.[0] || 'uploaded document';

    if (!documentText.trim()) {
      return res.status(400).json({
        error: 'No document text found. Upload a BOQ in Documents and wait until Ready.',
      });
    }

    if (retrieved.meta?.ocrQuality === 'poor') {
      return res.status(400).json({
        error: 'Document OCR quality is too low for reliable tables. Reprocess the file or upload a clearer PDF.',
      });
    }

    const { messagesToSend, meta } = buildGenerateMessages(
      type,
      documentText,
      docLabel,
      typeof hint === 'string' ? hint : ''
    );

    const aiResult = await routeQuery(messagesToSend, false, true);
    const aiResponse = aiResult.content || '';

    try {
      const parsed = parseQsOutputJson(aiResponse);
      return res.status(200).json({
        type,
        type_label: meta.label,
        document: docLabel,
        document_id: documentId || retrieved.meta?.primaryDoc?.id || null,
        provider: aiResult.provider,
        model: aiResult.model,
        generated_at: new Date().toISOString(),
        ...parsed,
      });
    } catch (parseErr) {
      return res.status(200).json({
        error: 'Could not parse structured output. Try Reprocess on the document or a different output type.',
        raw: aiResponse.slice(0, 4000),
        type,
      });
    }
  } catch (error) {
    console.error('QS output generate error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate QS output' });
  }
});

export default router;
