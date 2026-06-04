import { friendlyChatError } from './userMessages.js';

export function patchLastAssistant(setMessages, patch) {
  setMessages((prev) => {
    const updated = [...prev];
    const idx = updated.findLastIndex((m) => m.role === 'assistant');
    if (idx === -1) return prev;
    updated[idx] = { ...updated[idx], ...patch };
    return updated;
  });
}

export function replaceWorkingWithError(setMessages, rawMessage) {
  const content = friendlyChatError(rawMessage);
  setMessages((prev) => {
    const updated = [...prev];
    const idx = updated.findLastIndex(
      (m) => m.role === 'assistant' && (m.working || !m.content?.trim())
    );
    if (idx >= 0) {
      updated[idx] = {
        ...updated[idx],
        content,
        working: false,
        streaming: false,
        isError: true,
        answerPhase: undefined,
      };
      return updated;
    }
    return [
      ...prev,
      {
        role: 'assistant',
        content,
        isError: true,
        created_at: new Date().toISOString(),
      },
    ];
  });
}
