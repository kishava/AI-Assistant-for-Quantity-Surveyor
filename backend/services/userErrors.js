/** User-facing chat error text (avoid leaking raw stack traces). */
export function toUserChatError(error) {
  const msg = error?.message || String(error || '');
  if (/timed out|timeout/i.test(msg)) {
    return 'The AI took too long to respond. Try a shorter question or turn on cloud assist.';
  }
  if (/empty response/i.test(msg)) {
    return 'The local AI returned no text. Check that Ollama is running and the model is installed (see sidebar status).';
  }
  if (/Ollama API error/i.test(msg)) {
    return 'Local AI (Ollama) is not responding correctly. Check sidebar status and restart QS Assistant.';
  }
  if (/Groq API/i.test(msg)) {
    return 'Cloud AI (Groq) failed. Try again or turn off cloud assist to use local AI only.';
  }
  if (/GROQ_API_KEY|Groq API Key/i.test(msg)) {
    return 'Cloud assist is not configured on this machine.';
  }
  if (/Embedding|nomic-embed/i.test(msg)) {
    return 'Document search is limited because the embedding model is missing. Chat may still work with uploaded text.';
  }
  if (msg.length > 0 && msg.length <= 200) return msg;
  return 'Something went wrong while generating your answer. Please try again.';
}
