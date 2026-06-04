import dotenv from 'dotenv';
import { ensureModelPulled } from './ollamaModelHelper.js';

dotenv.config();

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'phi3:mini';
const CLOUD_THRESHOLD_TOKENS = parseInt(process.env.CLOUD_THRESHOLD_TOKENS || '1000', 10);
const OLLAMA_TIMEOUT_MS = parseInt(process.env.OLLAMA_TIMEOUT_MS || '120000', 10);
const GROQ_TIMEOUT_MS = parseInt(process.env.GROQ_TIMEOUT_MS || '60000', 10);

const GROQ_MODEL_MIGRATIONS = {
  'llama3-8b-8192': 'llama-3.1-8b-instant',
  'llama3-70b-8192': 'llama-3.3-70b-versatile',
  'mixtral-8x7b-32768': 'llama-3.3-70b-versatile',
};

function resolveGroqModel() {
  const configured = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
  const migrated = GROQ_MODEL_MIGRATIONS[configured];
  if (migrated) {
    console.warn(`Groq model "${configured}" is deprecated — using "${migrated}"`);
    return migrated;
  }
  return configured;
}

const GROQ_MODEL = resolveGroqModel();

export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(wordCount * 1.3);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function writeSseToken(res, token) {
  if (token) {
    res.write(`data: ${token}\n\n`);
  }
}

async function consumeOllamaStream(response, onToken) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        const token = data.message?.content || '';
        if (token) {
          fullContent += token;
          onToken(token);
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  return fullContent;
}

async function consumeGroqStream(response, onToken) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      let payload = line.slice(5);
      if (payload.startsWith(' ')) payload = payload.slice(1);
      if (!payload || payload === '[DONE]') continue;
      try {
        const data = JSON.parse(payload);
        const token = data.choices?.[0]?.delta?.content || '';
        if (token) {
          fullContent += token;
          onToken(token);
        }
      } catch {
        // skip
      }
    }
  }

  return fullContent;
}

async function streamOllama(messages, onToken) {
  await ensureModelPulled(OLLAMA_MODEL);
  const response = await fetchWithTimeout(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
    }),
  }, OLLAMA_TIMEOUT_MS);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ollama API error (${response.status}): ${errText}`);
  }

  return consumeOllamaStream(response, onToken);
}

async function streamGroq(messages, onToken) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('Groq API Key is not configured. Add GROQ_API_KEY to backend/.env');
  }

  const response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: 0.2,
      stream: true,
    }),
  }, GROQ_TIMEOUT_MS);

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`Groq API error (${response.status}): ${errData.error?.message || response.statusText}`);
  }

  return consumeGroqStream(response, onToken);
}

async function queryOllama(messages) {
  let content = '';
  await streamOllama(messages, (token) => { content += token; });
  return {
    content,
    model: OLLAMA_MODEL,
    provider: 'Local (Ollama)',
  };
}

async function queryGroq(messages) {
  let content = '';
  await streamGroq(messages, (token) => { content += token; });
  return {
    content,
    model: GROQ_MODEL,
    provider: 'Cloud (Groq)',
  };
}

export async function routeQuery(messages, useCloudConsent = false, forceLocal = false) {
  const fullText = messages.map(m => m.content).join('\n');
  const tokenCount = estimateTokens(fullText);

  if (tokenCount >= CLOUD_THRESHOLD_TOKENS && !useCloudConsent && !forceLocal) {
    return {
      consentRequired: true,
      tokenCount,
      threshold: CLOUD_THRESHOLD_TOKENS,
    };
  }

  if (useCloudConsent && !forceLocal) {
    try {
      return await queryGroq(messages);
    } catch (error) {
      console.warn('Groq failed, falling back to Ollama:', error.message);
      return await queryOllama(messages);
    }
  }

  return await queryOllama(messages);
}

/**
 * Stream AI response tokens via callback. Returns metadata or consentRequired.
 */
export async function streamRouteQuery(messages, useCloudConsent = false, forceLocal = false, onToken) {
  const fullText = messages.map(m => m.content).join('\n');
  const tokenCount = estimateTokens(fullText);

  if (tokenCount >= CLOUD_THRESHOLD_TOKENS && !useCloudConsent && !forceLocal) {
    return {
      consentRequired: true,
      tokenCount,
      threshold: CLOUD_THRESHOLD_TOKENS,
    };
  }

  let content = '';
  const capture = (token) => {
    content += token;
    onToken(token);
  };

  let provider = 'Local (Ollama)';
  let model = OLLAMA_MODEL;

  if (useCloudConsent && !forceLocal) {
    try {
      await streamGroq(messages, capture);
      provider = 'Cloud (Groq)';
      model = GROQ_MODEL;
    } catch (error) {
      console.warn('Groq stream failed, falling back to Ollama:', error.message);
      content = '';
      await streamOllama(messages, capture);
    }
  } else {
    await streamOllama(messages, capture);
  }

  if (!content.trim()) {
    throw new Error('The AI model returned an empty response. Check that Ollama is running and the model is pulled.');
  }

  return { content, provider, model };
}

export async function checkOllamaHealth() {
  try {
    const res = await fetchWithTimeout(`${OLLAMA_URL}/api/tags`, {}, 5000);
    if (!res.ok) return { status: 'error', message: `HTTP ${res.status}` };
    const data = await res.json();
    const models = (data.models || []).map(m => m.name);
    const hasChat = models.some(m => m.includes(OLLAMA_MODEL.split(':')[0]));
    const hasEmbed = models.some(m => m.includes('nomic-embed-text'));
    return {
      status: hasChat ? 'ok' : 'warning',
      message: hasChat ? 'ok' : `Model "${OLLAMA_MODEL}" not found`,
      models: models.slice(0, 5),
      embedding: hasEmbed ? 'ok' : 'missing nomic-embed-text',
    };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

export async function checkGroqHealth() {
  if (!process.env.GROQ_API_KEY) {
    return { status: 'unconfigured', message: 'No API key set' };
  }
  try {
    const res = await fetchWithTimeout('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    }, 5000);
    if (!res.ok) return { status: 'error', message: `HTTP ${res.status}` };
    return { status: 'ok', model: GROQ_MODEL };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

export { GROQ_MODEL, OLLAMA_MODEL, OLLAMA_URL };
