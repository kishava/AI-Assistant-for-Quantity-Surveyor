import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import MessageBubble from './MessageBubble.jsx';
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

export default function DocumentChat({ document, token, onBack }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [autoCloud] = useState(false);
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

    setLoading(true);
    setLoadingStage('Connecting…');
    setInputText('');

    const isRetry = options.useCloud || options.forceLocal;
    if (!isRetry) {
      setMessages(prev => [...prev, { role: 'user', content: text }]);
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
          documentId: document.id
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

      setLoading(false);
      setStreaming(true);
      setLoadingStage('');
      setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }]);

      let accumulated = '';
      let modelUsed = '';
      let citations = [];

      await consumeChatStream(
        response,
        (tokenPart) => {
          accumulated += tokenPart;
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: accumulated, streaming: true };
            }
            return updated;
          });
        },
        (meta) => {
          if (meta.stage) setLoadingStage(meta.stage);
          if (meta.model) modelUsed = meta.model;
          if (meta.citations) citations = meta.citations;
          if (meta.error) accumulated = `Error: ${meta.error}`;
          if (meta.done) {
            setStreaming(false);
            setLoadingStage('');
            setMessages(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === 'assistant') {
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: accumulated,
                  model_used: modelUsed,
                  citations,
                  streaming: false
                };
              }
              return updated;
            });
          }
        }
      );
    } catch (error) {
      console.error('Send message failed:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error.message}. Please verify the backend is running and Ollama config is correct.`,
        isError: true
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
                Questions are scoped to &ldquo;{document.filename}&rdquo; using semantic search.
              </p>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div key={index} className="message-with-cursor">
                <MessageBubble msg={msg} />
                {msg.streaming && <span className="streaming-cursor">|</span>}
              </div>
            ))
          )}

          {loading && (
            <div className="message-bubble assistant">
              <div className="message-content">
                {loadingStage ? (
                  <span className="loading-stage-text">{loadingStage}</span>
                ) : (
                  <span className="pulse-dots">
                    <span></span><span></span><span></span>
                  </span>
                )}
              </div>
            </div>
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
