import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import ChatMessage from './ChatMessage.jsx';
import ChatComposer from './ChatComposer.jsx';
import AssistantProgress from './AssistantProgress.jsx';
import CloudConsentModal from './CloudConsentModal.jsx';
import QsOutputPanel from './QsOutputPanel.jsx';
import { consumeChatStream } from '../utils/chatStream.js';
import { patchLastAssistant, replaceWorkingWithError } from '../utils/chatHelpers.js';

export default function DocumentChat({ document, token, user, onBack }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [autoCloud] = useState(false);
  const [allowGroqDocs, setAllowGroqDocs] = useState(false);

  const [showConsentModal, setShowConsentModal] = useState(false);
  const [pendingMessage, setPendingMessage] = useState(null);
  const [pendingTokenInfo, setPendingTokenInfo] = useState({ tokenCount: 0, threshold: 1000 });
  const pendingMessageRef = useRef(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, streaming]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [inputText]);

  const handleSendMessage = async (text, options = {}) => {
    if (!text.trim() || loading) return;

    setInputText('');
    setLoading(false);
    setStreaming(true);

    const isRetry = options.useCloud || options.forceLocal;
    const now = new Date().toISOString();
    const progressBubble = {
      role: 'assistant',
      content: '',
      thinking: [],
      streaming: true,
      working: true,
      stage: 'Sending request…',
      created_at: now,
    };

    if (!isRetry) {
      setMessages(prev => [...prev, { role: 'user', content: text, created_at: now }, progressBubble]);
    } else {
      setMessages(prev => [...prev, progressBubble]);
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: text,
          useCloud: options.useCloud !== undefined ? options.useCloud : autoCloud,
          forceLocal: options.forceLocal || false,
          documentId: document.id,
          allowGroqDocs: allowGroqDocs
        })
      });

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Server error occurred');
        }
        if (data.consentRequired) {
          pendingMessageRef.current = text;
          setPendingMessage(text);
          setPendingTokenInfo({ tokenCount: data.tokenCount, threshold: data.threshold });
          setShowConsentModal(true);
          setMessages((prev) => prev.filter((m) => !m.working));
          setStreaming(false);
          return;
        }
      }

      let accumulated = '';
      let modelUsed = '';
      let citations = [];
      const thinkingAccum = [];
      const patchAssistant = (patch) => patchLastAssistant(setMessages, patch);

      await consumeChatStream(
        response,
        (tokenPart) => {
          accumulated += tokenPart;
          patchAssistant({
            content: accumulated,
            working: false,
            answerPhase: undefined,
            streaming: true,
          });
        },
        (meta) => {
          if (meta.consentRequired) {
            setStreaming(false);
            pendingMessageRef.current = text;
            setPendingMessage(text);
            setPendingTokenInfo({
              tokenCount: meta.consentRequired?.tokenCount ?? 0,
              threshold: meta.consentRequired?.threshold ?? 1000,
            });
            setShowConsentModal(true);
            setMessages((prev) => prev.filter((m) => !m.working));
            return;
          }
          if (meta.notice) patchAssistant({ notice: meta.notice });
          if (meta.stage) patchAssistant({ stage: meta.stage, working: true });
          if (meta.thinking) {
            if (!thinkingAccum.includes(meta.thinking)) thinkingAccum.push(meta.thinking);
            patchAssistant({ thinking: [...thinkingAccum], working: true });
          }
          if (meta.answerStart) {
            patchAssistant({ answerPhase: 'compiling', stage: 'Writing your answer…', working: true });
          }
          if (meta.replace) {
            accumulated = meta.replace;
            patchAssistant({ content: accumulated, working: false, streaming: true });
          }
          if (meta.model) modelUsed = meta.model;
          if (meta.citations) citations = meta.citations;
          if (meta.error) {
            accumulated = meta.error;
            patchAssistant({ content: accumulated, working: false, isError: true, streaming: false });
          }
          if (meta.done) {
            setStreaming(false);
            const empty = !accumulated?.trim();
            patchAssistant({
              content: empty
                ? 'No answer was generated. Check sidebar status and try again.'
                : accumulated,
              thinking: thinkingAccum.length ? [...thinkingAccum] : undefined,
              model_used: modelUsed,
              citations,
              streaming: false,
              working: false,
              answerPhase: undefined,
              ...(empty ? { isError: true } : {}),
            });
          }
        }
      );
    } catch (error) {
      console.error('Send message failed:', error);
      replaceWorkingWithError(setMessages, error.message);
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  };

  const handleConsentConfirm = () => {
    const msg = pendingMessageRef.current || pendingMessage;
    pendingMessageRef.current = null;
    setPendingMessage(null);
    setShowConsentModal(false);
    if (msg) handleSendMessage(msg, { useCloud: true });
  };

  const handleConsentDecline = () => {
    const msg = pendingMessageRef.current || pendingMessage;
    pendingMessageRef.current = null;
    setPendingMessage(null);
    setShowConsentModal(false);
    if (msg) handleSendMessage(msg, { forceLocal: true });
  };

  const handleConsentCancel = () => {
    setShowConsentModal(false);
    pendingMessageRef.current = null;
    setPendingMessage(null);
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === 'user') return prev.slice(0, -1);
      return prev.filter((m) => !m.working);
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(inputText);
    }
  };

  return (
    <div className="document-chat-panel chat-layout">
      <header className="document-chat-header chat-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button type="button" className="btn btn-secondary" onClick={onBack} style={{ padding: '8px 12px' }} aria-label="Back to documents">
            <ArrowLeft size={16} />
            Back
          </button>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>{document.filename}</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Questions use this file only</p>
          </div>
        </div>
      </header>

      <QsOutputPanel
        token={token}
        documentId={document.id}
        documentLabel={document.filename}
        disabled={loading || streaming}
      />

      <div className="document-chat-layout" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <main className="chat-thread">
          <div className="chat-thread-inner">
          {messages.length === 0 && !loading ? (
            <div className="chat-welcome">
              <h3>Ask about this document</h3>
              <p>
                Use <strong>Generate QS tables</strong> above for BOQ lines, section summaries, and measurement schedules.
              </p>
              <div className="chat-suggestions">
                <button type="button" disabled={loading || streaming} onClick={() => handleSendMessage('Explain this BOQ section by section with headings and bullet points.')}>
                  Explain BOQ
                </button>
                <button type="button" disabled={loading || streaming} onClick={() => handleSendMessage('What are the main sections and section totals in this tender BOQ?')}>
                  Section totals
                </button>
              </div>
            </div>
          ) : (
            messages.map((msg, index) =>
              msg.role === 'assistant' && msg.working && !msg.content?.trim() ? (
                <AssistantProgress key={index} msg={msg} />
              ) : (
                <ChatMessage key={index} msg={msg} />
              )
            )
          )}
          <div ref={messagesEndRef} />
          </div>
        </main>

        <footer className="chat-composer-area">
          <div className="chat-composer-wrap">
            <ChatComposer
              textareaRef={textareaRef}
              inputText={inputText}
              onInputChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              onSend={() => handleSendMessage(inputText)}
              showAttach={false}
              sendDisabled={!inputText.trim() || loading || streaming}
              placeholder="Ask about this document…"
            />
            {user?.username !== 'guest' && (
              <label className="chat-cloud-opt">
                <input
                  type="checkbox"
                  checked={allowGroqDocs}
                  onChange={(e) => setAllowGroqDocs(e.target.checked)}
                />
                Share document text with cloud AI
              </label>
            )}
          </div>
        </footer>
      </div>

      {showConsentModal && (
        <CloudConsentModal
          onConfirm={handleConsentConfirm}
          onDecline={handleConsentDecline}
          onCancel={handleConsentCancel}
          tokenCount={pendingTokenInfo.tokenCount}
          threshold={pendingTokenInfo.threshold}
        />
      )}
    </div>
  );
}
