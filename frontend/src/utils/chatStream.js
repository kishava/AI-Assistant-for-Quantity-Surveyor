/** Parse SSE data line — preserves leading spaces inside token text (SSE spec strips one space after "data:" only). */
function parseSseDataLine(line) {
  if (!line.startsWith('data:')) return null;
  let payload = line.slice(5);
  if (payload.startsWith(' ')) payload = payload.slice(1);
  return payload;
}

/** Join all data: lines in one SSE event (multiline tokens / [REPLACE] payloads). */
function payloadFromEventBlock(part) {
  const lines = part.split('\n').filter((l) => l.startsWith('data:'));
  if (!lines.length) return null;
  return lines.map(parseSseDataLine).join('\n');
}

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
      const payload = payloadFromEventBlock(part);
      if (payload === null) continue;

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
      } else if (payload.startsWith('[THINKING]')) {
        onMeta({ thinking: payload.slice(10) });
      } else if (payload === '[ANSWER_START]') {
        onMeta({ answerStart: true });
      } else if (payload.startsWith('[REPLACE]')) {
        onMeta({ replace: payload.slice(9) });
      } else if (payload.startsWith('[NOTICE]')) {
        onMeta({ notice: payload.slice(8) });
      } else if (payload.startsWith('[CONSENT_REQUIRED]')) {
        try {
          onMeta({ consentRequired: JSON.parse(payload.slice(18)) });
        } catch {
          onMeta({ consentRequired: null });
        }
      } else {
        onToken(payload);
      }
    }
  }
}
