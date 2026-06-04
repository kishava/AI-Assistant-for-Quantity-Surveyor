import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import MessageBubble from './MessageBubble.jsx';
import AssistantProgress from './AssistantProgress.jsx';
import CloudConsentModal from './CloudConsentModal.jsx';
import { consumeChatStream } from '../utils/chatStream.js';

function formatCell(value) {
  if (value === null || value === undefined || value === '') {
    return <span className="boq-null">—</span>;
  }
  return value;
}

function BoqTable({ items }) {
  const totalAmount = items.reduce((sum, item) => {
    const amt = typeof item.amount === 'number' ? item.amount : 0;
    return sum + amt;
  }, 0);

  return (
    <div className="boq-table-wrapper">
      <table className="boq-table">
        <thead>
          <tr>
            <th>Item No.</th>
            <th>Description</th>
            <th>Unit</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx}>
              <td>{formatCell(item.item_no)}</td>
              <td>{formatCell(item.description)}</td>
              <td>{formatCell(item.unit)}</td>
              <td>{formatCell(item.quantity)}</td>
              <td>{formatCell(item.rate)}</td>
              <td>{formatCell(item.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="boq-totals-row">
            <td colSpan={5}>Total</td>
            <td>{totalAmount > 0 ? totalAmount.toFixed(2) : <span className="boq-null">—</span>}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function DocumentChat({ document, token, user, onBack }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [autoCloud] = useState(false);
  const [allowGroqDocs, setAllowGroqDocs] = useState(false);
  const [boqItems, setBoqItems] = useState(null);
  const [boqLoading, setBoqLoading] = useState(false);
  const [boqError, setBoqError] = useState('');

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

  const handleExtractBoq = async () => {
    setBoqLoading(true);
    setBoqError('');
    setBoqItems(null);

    try {
      const response = await fetch(`/api/documents/${document.id}/extract-boq`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to extract BOQ');
      if (data.error) {
        setBoqError(data.error);
      } else {
        setBoqItems(data.items);
      }
    } catch (err) {
      setBoqError(err.message);
    } finally {
      setBoqLoading(false);
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
    <div className="document-chat-panel">
      <div className="document-chat-header">
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
        <button className="btn btn-cyan" onClick={handleExtractBoq} disabled={boqLoading}>
          Extract BOQ
        </button>
      </div>

      <div className="chat-container document-chat-body">
        <div className="chat-messages">
          {messages.length === 0 && !loading ? (
            <div className="document-chat-empty">
              <h3 style={{ fontWeight: 500 }}>Ask about this document</h3>
              <p style={{ fontSize: '0.85rem', maxWidth: '360px' }}>
                Questions use &ldquo;{document.filename}&rdquo; — newest upload is read first.
              </p>
              <div className="chat-quick-prompts">
                <button type="button" disabled={loading || streaming} onClick={() => handleSendMessage('Explain this BOQ section by section in plain English for a quantity surveyor.')}>
                  Explain BOQ
                </button>
                <button type="button" disabled={loading || streaming} onClick={() => handleSendMessage('What are the main sections and section totals in this tender BOQ?')}>
                  Section totals
                </button>
              </div>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div key={index} className="message-with-cursor">
                {msg.role === 'assistant' && msg.working && !msg.content?.trim() ? (
                  <AssistantProgress msg={msg} />
                ) : (
                  <MessageBubble msg={msg} />
                )}
                {msg.streaming && msg.content?.trim() && <span className="streaming-cursor">|</span>}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-wrapper">
          <textarea
            ref={textareaRef}
            className="chat-input"
            placeholder="Ask about quantities, specifications, or costs in this document..."
            rows="1"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading || streaming}
          />
          <button
            className="btn btn-primary"
            onClick={() => handleSendMessage(inputText)}
            disabled={!inputText.trim() || loading || streaming}
            style={{ padding: '8px 12px', borderRadius: '8px' }}
          >
            <Send size={16} />
          </button>
        </div>
        {user?.username !== 'guest' && (
          <div style={{ marginTop: '8px', paddingLeft: '4px' }}>
            <label style={{ fontSize: '0.8rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={allowGroqDocs}
                onChange={(e) => setAllowGroqDocs(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Allow Groq Cloud to read document contents
            </label>
          </div>
        )}
      </div>

      {boqLoading && (
        <div className="boq-loading">
          <span className="boq-loading-text">Extracting BOQ…</span>
        </div>
      )}

      {boqError && <div className="boq-error">{boqError}</div>}

      {boqItems && boqItems.length > 0 && <BoqTable items={boqItems} />}

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
