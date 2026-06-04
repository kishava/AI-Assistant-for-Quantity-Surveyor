const OLLAMA_URL = process.env.OLLAMA_BASE_URL || process.env.OLLAMA_URL || 'http://localhost:11434';

// Keep track of models we have already checked and verified in this process session
const verifiedModels = new Set();

/**
 * Checks if a given Ollama model is installed. If not, attempts to pull it from the Ollama registry.
 * @param {string} modelName - The name of the model (e.g., 'phi3:mini', 'nomic-embed-text', 'moondream')
 * @returns {Promise<boolean>}
 */
export async function ensureModelPulled(modelName) {
  if (verifiedModels.has(modelName)) {
    return true;
  }

  try {
    const listRes = await fetch(`${OLLAMA_URL}/api/tags`);
    if (listRes.ok) {
      const listData = await listRes.json();
      const models = listData.models || [];
      const hasModel = models.some(m => m.name === modelName || m.name.startsWith(modelName + ':') || m.name === modelName + ':latest');
      if (hasModel) {
        verifiedModels.add(modelName);
        return true;
      }
    }
  } catch (err) {
    console.warn(`[Ollama Helper] Failed to check if model "${modelName}" is installed:`, err.message);
  }

  console.log(`[Ollama Helper] Required model "${modelName}" not found. Initiating auto-pull...`);
  try {
    const pullRes = await fetch(`${OLLAMA_URL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: false })
    });
    if (!pullRes.ok) {
      const errText = await pullRes.text().catch(() => '');
      throw new Error(`Ollama pull API returned status ${pullRes.status}: ${errText}`);
    }
    console.log(`[Ollama Helper] Model "${modelName}" pulled successfully.`);
    verifiedModels.add(modelName);
    return true;
  } catch (err) {
    console.error(`[Ollama Helper] Failed to pull model "${modelName}":`, err.message);
    throw new Error(`Ollama model "${modelName}" is not installed and auto-pull failed. Please run "ollama pull ${modelName}" manually in your terminal. Details: ${err.message}`);
  }
}
