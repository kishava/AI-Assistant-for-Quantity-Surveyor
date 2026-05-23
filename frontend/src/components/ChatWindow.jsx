import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, ShieldCheck } from 'lucide-react';
import MessageBubble from './MessageBubble.jsx';
import CloudConsentModal from './CloudConsentModal.jsx';

async function consumeChatStream(response, onToken, onMeta) {
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
      } else {
        onToken(payload);
      }
    }
  }
}

export default function ChatWindow({ token }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [autoCloud, setAutoCloud] = useState(false);

  const [showConsentModal, setShowConsentModal] = useState(false);
  const [pendingMessage, setPendingMessage] = useState(null);
  const [pendingTokenInfo, setPendingTokenInfo] = useState({ tokenCount: 0, threshold: 1000 });

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch('/api/chat/history', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setMessages(data);
        }
      } catch (err) {
        console.error('Failed to load chat history:', err);
      }
    };

    fetchHistory();
  }, [token]);

  useEffect(() => {
    scrollToBottom();
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
          forceLocal: options.forceLocal || false
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
      setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }]);

      let accumulated = '';
      let modelUsed = '';
      let citations = [];

      await consumeChatStream(
        response,
        (tokenPart) => {
          accumulated += (accumulated ? ' ' : '') + tokenPart;
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
          if (meta.model) modelUsed = meta.model;
          if (meta.citations) citations = meta.citations;
          if (meta.error) accumulated = `Error: ${meta.error}`;
          if (meta.done) {
            setStreaming(false);
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

  const handleConsentConfirm = () => {
    setShowConsentModal(false);
    if (pendingMessage) {
      handleSendMessage(pendingMessage, { useCloud: true });
    }
  };

  const handleConsentDecline = () => {
    setShowConsentModal(false);
    if (pendingMessage) {
      handleSendMessage(pendingMessage, { forceLocal: true });
    }
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
    <div className="chat-container">
      <div className="chat-header">
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>QS Workspace</h2>
          <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Query local specs and structural documents</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '0.8rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoCloud}
              onChange={(e) => setAutoCloud(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Auto Cloud Delegation (Groq)
          </label>
          <div className="badge" style={{
            background: autoCloud ? 'rgba(99, 102, 241, 0.15)' : 'rgba(6, 182, 212, 0.15)',
            color: autoCloud ? '#6366f1' : '#06b6d4',
            border: `1px solid ${autoCloud ? 'rgba(99, 102, 241, 0.3)' : 'rgba(6, 182, 212, 0.3)'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            {autoCloud ? <Sparkles size={12} /> : <ShieldCheck size={12} />}
            {autoCloud ? 'Groq Active' : 'Offline First'}
          </div>
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && !loading ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            opacity: 0.6,
            textAlign: 'center',
            gap: '12px',
            padding: '40px'
          }}>
            <MessageSquarePlaceholder />
            <h3 style={{ fontWeight: 500 }}>No messages yet</h3>
            <p style={{ fontSize: '0.85rem', maxWidth: '360px' }}>
              Upload construction sheets, BQ cost details, or schedules in the Documents tab, then ask assistant here.
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
              <span className="pulse-dots">
                <span></span>
                <span></span>
                <span></span>
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-wrapper">
        <textarea
          ref={textareaRef}
          className="chat-input"
          placeholder="Ask about materials, cost estimations, drawing numbers, or specifications..."
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

function MessageSquarePlaceholder() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-message-square">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}
