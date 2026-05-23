import { checkOllamaHealth, checkGroqHealth } from './aiRouter.js';
import { checkChromaHealth } from './vectorStore.js';

export async function getSystemHealth() {
  const [ollama, chroma, groq] = await Promise.all([
    checkOllamaHealth(),
    checkChromaHealth(),
    checkGroqHealth(),
  ]);

  const coreOk = ollama.status === 'ok' || ollama.status === 'warning';
  const overall = coreOk ? 'ok' : 'degraded';

  return {
    status: overall,
    time: new Date().toISOString(),
    ollama,
    chroma,
    groq,
  };
}
