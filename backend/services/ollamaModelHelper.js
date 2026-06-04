const OLLAMA_URL = process.env.OLLAMA_BASE_URL || process.env.OLLAMA_URL || 'http://localhost:11434';

// Keep track of models we have already checked and verified in this process session
const verifiedModels = new Set();

function modelMatches(name, modelName) {
  return name === modelName
    || name.startsWith(`${modelName}:`)
    || name === `${modelName}:latest`;
}

/**
 * Returns true if the model is already available locally (no pull).
 */
export async function isModelAvailable(modelName) {
  if (verifiedModels.has(modelName)) return true;
  try {
    const listRes = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(8000) });
    if (!listRes.ok) return false;
    const listData = await listRes.json();
    const models = listData.models || [];
    const hasModel = models.some(m => modelMatches(m.name, modelName));
    if (hasModel) verifiedModels.add(modelName);
    return hasModel;
  } catch {
    return false;
  }
}

/**
 * Checks if a model is installed; optionally pulls it (chat paths only — not document upload).
 * @param {string} modelName
 * @param {{ allowPull?: boolean }} options
 */
export async function ensureModelPulled(modelName, options = {}) {
  const { allowPull = true } = options;
  if (await isModelAvailable(modelName)) return true;

  if (!allowPull) {
    throw new Error(
      `Ollama model "${modelName}" is not installed. Run at setup: ollama pull ${modelName}`
    );
  }

  console.log(`[Ollama Helper] Pulling model "${modelName}"…`);
  try {
    const pullRes = await fetch(`${OLLAMA_URL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: false }),
      signal: AbortSignal.timeout(600000),
    });
    if (!pullRes.ok) {
      const errText = await pullRes.text().catch(() => '');
      throw new Error(`Ollama pull API returned status ${pullRes.status}: ${errText}`);
    }
    verifiedModels.add(modelName);
    return true;
  } catch (err) {
    throw new Error(
      `Ollama model "${modelName}" is not installed. Run: ollama pull ${modelName}. Details: ${err.message}`
    );
  }
}
