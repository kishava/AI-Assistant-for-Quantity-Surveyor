/** Map technical API / AI errors to plain language for QS users. */
export function friendlyChatError(message) {
  const m = String(message || '').trim();
  if (!m) {
    return 'Something went wrong. Check that QS Assistant is running, then try again.';
  }
  if (/too many|rate limit/i.test(m)) {
    return 'You are sending messages too quickly. Wait a moment and try again.';
  }
  if (/timed out|timeout/i.test(m)) {
    return 'The AI took too long to respond. Try a shorter question, or turn on cloud assist if you are signed in.';
  }
  if (/empty response|no response/i.test(m)) {
    return 'The local AI returned no text. Open the sidebar status: Ollama should be running and the model installed.';
  }
  if (/ollama|ECONNREFUSED|fetch failed|network/i.test(m)) {
    return 'Cannot reach the assistant service. Restart QS Assistant and check the status indicators in the sidebar.';
  }
  if (/conversation not found/i.test(m)) {
    return 'This chat session was not found. Start a new chat from the sidebar.';
  }
  if (/internal error|server error/i.test(m)) {
    return 'The server had a problem completing your request. Try again in a moment.';
  }
  if (m.length > 220) {
    return 'Something went wrong while generating your answer. Try again or use a shorter question.';
  }
  return m.startsWith('Error:') ? m : m;
}

export function friendlyDocError(message) {
  const m = String(message || '').trim();
  if (!m) return 'This file could not be processed.';
  if (/ollama pull|not installed/i.test(m)) {
    return 'A required local AI model is missing. Check sidebar status or ask your administrator to install Ollama models.';
  }
  if (/empty|no text could be extracted/i.test(m)) {
    return 'No readable text was found. Try a clearer PDF/scan or re-export the file.';
  }
  if (/unsupported file/i.test(m)) {
    return m;
  }
  if (m.length > 180) {
    return 'Processing failed. Try reprocessing the file or upload a clearer copy.';
  }
  return m;
}

export function healthServiceLabel(key, svc) {
  if (!svc?.status) return 'Checking…';
  const msg = svc.message ? ` — ${svc.message}` : '';
  if (key === 'ollama') {
    if (svc.status === 'ok') return 'Local AI ready';
    if (svc.status === 'warning') return `Local AI needs attention${msg}`;
    return `Local AI unavailable${msg}`;
  }
  if (key === 'chroma') {
    if (svc.status === 'ok') return 'Document search ready';
    if (svc.status === 'warning') return `Document search limited${msg}`;
    return `Document search off${msg}`;
  }
  if (key === 'groq') {
    if (svc.status === 'ok') return 'Cloud assist available';
    if (svc.status === 'warning') return 'Cloud assist not configured';
    return 'Cloud assist unavailable';
  }
  return svc.status;
}
