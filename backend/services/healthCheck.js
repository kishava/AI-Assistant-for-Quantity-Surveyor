import { checkOllamaHealth, checkGroqHealth } from './aiRouter.js';
import { checkChromaHealth } from './vectorStore.js';

export async function getSystemHealth() {
  const [ollama, chroma, groq] = await Promise.all([
    checkOllamaHealth(),
    checkChromaHealth(),
    checkGroqHealth(),
  ]);

  let overall = 'ok';
  if (ollama.status === 'error') overall = 'degraded';
  else if (ollama.status === 'warning') overall = 'warning';
  else if (chroma.status === 'error') overall = 'warning';

  return {
    status: overall,
    time: new Date().toISOString(),
    ollama,
    chroma,
    groq,
  };
}
