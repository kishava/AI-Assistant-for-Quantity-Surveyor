import dotenv from 'dotenv';

dotenv.config();

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'phi3:mini';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama3-8b-8192';
const CLOUD_THRESHOLD_TOKENS = parseInt(process.env.CLOUD_THRESHOLD_TOKENS || '1000', 10);

/**
 * Helper to estimate token counts based on word count.
 * (Words * 1.3)
 */
export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(wordCount * 1.3);
}

/**
 * Queries the local Ollama instance.
 */
async function queryOllama(messages) {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return {
      content: data.message?.content || '',
      model: OLLAMA_MODEL,
      provider: 'Local (Ollama)',
    };
  } catch (error) {
    console.error('Ollama Query failed:', error);
    throw new Error(`Failed to contact local AI (Ollama). Please verify it is running on ${OLLAMA_URL} and the model "${OLLAMA_MODEL}" is pulled. Details: ${error.message}`);
  }
}

/**
 * Queries the Groq API.
 */
async function queryGroq(messages) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('Groq API Key is not configured in the backend environment. Cannot route to cloud.');
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(`Groq API error (${response.status}): ${errData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      model: GROQ_MODEL,
      provider: 'Cloud (Groq)',
    };
  } catch (error) {
    console.error('Groq Query failed:', error);
    throw error;
  }
}

/**
 * Route query to appropriate AI engine based on token length and cloud permissions.
 * 
 * @param {Array<{role: string, content: string}>} messages - Chat history + system instructions.
 * @param {boolean} useCloudConsent - Has the user given cloud consent for this session or request?
 * @param {boolean} forceLocal - Bypass cloud check and force local processing regardless of token count.
 * @returns {Promise<Object>} - The AI output or a consent required notice.
 */
export async function routeQuery(messages, useCloudConsent = false, forceLocal = false) {
  // Compile all content to check total tokens
  const fullText = messages.map(m => m.content).join('\n');
  const tokenCount = estimateTokens(fullText);

  // If token count is larger than cloud threshold, and user hasn't allowed cloud, AND they are not forcing local
  if (tokenCount >= CLOUD_THRESHOLD_TOKENS && !useCloudConsent && !forceLocal) {
    return {
      consentRequired: true,
      tokenCount,
      threshold: CLOUD_THRESHOLD_TOKENS,
    };
  }

  // Routing conditions:
  // If useCloudConsent is true AND tokenCount is >= threshold AND not forceLocal, send to Groq.
  // Otherwise, process locally on Ollama.
  if (useCloudConsent && tokenCount >= CLOUD_THRESHOLD_TOKENS && !forceLocal) {
    return await queryGroq(messages);
  } else {
    return await queryOllama(messages);
  }
}
