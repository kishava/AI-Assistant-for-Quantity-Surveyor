import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import ChatMessage from './ChatMessage.jsx';
import ChatComposer from './ChatComposer.jsx';
import AssistantProgress from './AssistantProgress.jsx';
import CloudConsentModal from './CloudConsentModal.jsx';
import QsOutputPanel from './QsOutputPanel.jsx';
import { consumeChatStream } from '../utils/chatStream.js';

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
          setPendingMessage(text);
          setPendingTokenInfo({ tokenCount: data.tokenCount, threshold: data.threshold });
          setShowConsentModal(true);
          setLoading(false);
          return;
        }
      }

      let accumulated = '';
      let modelUsed = '';
      let citations = [];
      const thinkingAccum = [];

      const patchAssistant = (patch) => {
        setMessages((prev) => {
          const updated = [...prev];
          const idx = updated.findLastIndex((m) => m.role === 'assistant');
          if (idx === -1) return prev;
          updated[idx] = { ...updated[idx], ...patch };
          return updated;
        });
      };

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
            setPendingMessage(text);
            setPendingTokenInfo({
              tokenCount: meta.consentRequired.tokenCount,
              threshold: meta.consentRequired.threshold,
            });
            setShowConsentModal(true);
            setMessages((prev) => prev.filter((m) => !m.working));
            return;
          }
          if (meta.stage) patchAssistant({ stage: meta.stage, working: true });
          if (meta.thinking) {
            if (!thinkingAccum.includes(meta.thinking)) thinkingAccum.push(meta.thinking);
            patchAssistant({ thinking: [...thinkingAccum], working: true });
          }
          if (meta.answerStart) {
            patchAssistant({ answerPhase: 'compiling', stage: 'Writing your answer…', working: true });
          }
          if (meta.model) modelUsed = meta.model;
          if (meta.citations) citations = meta.citations;
          if (meta.error) {
            accumulated = `Error: ${meta.error}`;
            patchAssistant({ content: accumulated, working: false, isError: true });
          }
          if (meta.done) {
            setStreaming(false);
            patchAssistant({
              content: accumulated || 'No response generated.',
              thinking: thinkingAccum.length ? [...thinkingAccum] : undefined,
              model_used: modelUsed,
              citations,
              streaming: false,
              working: false,
              answerPhase: undefined,
            });
          }
        }
      );
    } catch (error) {
      console.error('Send message failed:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error.message}. Please verify the backend is running and Ollama config is correct.`,
        isError: true,
        created_at: new Date().toISOString()
      }]);
    } finally {
      setLoading(false);
      setStreaming(false);
      setPendingMessage(null);
    }
  };

  const handleConsentConfirm = () => {
    setShowConsentModal(false);
    if (pendingMessage) handleSendMessage(pendingMessage, { useCloud: true });
  };

  const handleConsentDecline = () => {
    setShowConsentModal(false);
    if (pendingMessage) handleSendMessage(pendingMessage, { forceLocal: true });
  };

  const handleConsentCancel = () => {
    setShowConsentModal(false);
    setMessages(prev => prev.slice(0, -1));
    setPendingMessage(null);
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
          <button className="btn btn-secondary" onClick={onBack} style={{ padding: '8px 12px' }}>
            <ArrowLeft size={16} />
            Back
          </button>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>{document.filename}</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Document-scoped chat</p>
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
                Use <strong>Generate QS tables</strong> above for BOQ lines, section summaries, measurement schedules, and checklists.
              </p>
              <div className="chat-suggestions">
                <button type="button" disabled={loading || streaming} onClick={() => handleSendMessage('Explain this BOQ section by section in plain English for a quantity surveyor.')}>
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
                Allow Groq Cloud to read document contents
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
