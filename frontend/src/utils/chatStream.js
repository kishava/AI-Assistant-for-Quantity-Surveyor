export async function consumeChatStream(response, onToken, onMeta) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trimStart();

      if (payload === '[DONE]') {
        onMeta({ done: true });
      } else if (payload.startsWith('[MODEL]')) {
        onMeta({ model: payload.slice(7) });
      } else if (payload.startsWith('[CITATIONS]')) {
        try {
          onMeta({ citations: JSON.parse(payload.slice(11)) });
        } catch {
          onMeta({ citations: [] });
        }
      } else if (payload.startsWith('[ERROR]')) {
        onMeta({ error: payload.slice(7) });
      } else if (payload.startsWith('[STAGE]')) {
        onMeta({ stage: payload.slice(7) });
      } else {
        onToken(payload);
      }
    }
  }
}
