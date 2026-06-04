import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, ShieldCheck, Paperclip, X, AlertCircle } from 'lucide-react';
import MessageBubble from './MessageBubble.jsx';
import AssistantProgress from './AssistantProgress.jsx';
import CloudConsentModal from './CloudConsentModal.jsx';
import { consumeChatStream } from '../utils/chatStream.js';
import QsOutputPanel from './QsOutputPanel.jsx';
import { ACCEPT_ATTRIBUTE } from '../config/fileTypes.js';

export default function ChatWindow({ token, user, conversationId }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [autoCloud, setAutoCloud] = useState(false);
  const [allowGroqDocs, setAllowGroqDocs] = useState(false);

  const [showConsentModal, setShowConsentModal] = useState(false);
  const [pendingMessage, setPendingMessage] = useState(null);
  const [pendingTokenInfo, setPendingTokenInfo] = useState({ tokenCount: 0, threshold: 1000 });

  const [attachedFile, setAttachedFile] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [fileError, setFileError] = useState('');

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch(`/api/chat/history?conversationId=${conversationId}`, {
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
  }, [token, conversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, streaming]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [inputText]);

  const pollDocumentStatus = (docId) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      try {
        const response = await fetch('/api/documents', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const docs = await response.json();
          const doc = docs.find(d => d.id === docId);
          if (doc) {
            if (doc.status === 'ready') {
              setAttachedFile(doc);
              setUploadingFile(false);
              clearInterval(interval);
            } else if (doc.status === 'failed') {
              setAttachedFile(doc);
              setUploadingFile(false);
              setFileError(doc.error_message || 'Processing failed');
              clearInterval(interval);
            }
          }
        }
      } catch (err) {
        console.error('Error polling document status:', err);
      }
      attempts++;
      if (attempts > 120) {
        setFileError('This file is still processing. Large scanned images can take several minutes; you can keep working and reattach it when it is ready in Documents.');
        setUploadingFile(false);
        clearInterval(interval);
      }
    }, 3000);
  };

  const handleFileSelect = async (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadingFile(true);
      setFileError('');
      setAttachedFile({ filename: file.name, status: 'uploading' });

      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch('/api/documents/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to upload document');
        }

        setAttachedFile({
          id: data.document.id,
          filename: data.document.filename,
          status: 'processing'
        });

        pollDocumentStatus(data.document.id);
      } catch (err) {
        setFileError(err.message);
        setAttachedFile({
          filename: file.name,
          status: 'failed',
          error_message: err.message
        });
        setUploadingFile(false);
      }
    }
  };

  const handleSendMessage = async (text, options = {}) => {
    if (!text.trim() || loading || uploadingFile) return;

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
      setMessages(prev => [
        ...prev,
        { role: 'user', content: text, created_at: now },
        progressBubble,
      ]);
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
          conversationId: conversationId,
          allowGroqDocs: allowGroqDocs,
          documentId: attachedFile?.status === 'ready' ? attachedFile.id : undefined
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
          if (meta.stage) {
            patchAssistant({ stage: meta.stage, working: true });
          }
          if (meta.thinking) {
            if (!thinkingAccum.includes(meta.thinking)) {
              thinkingAccum.push(meta.thinking);
            }
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
          <label style={{ 
            fontSize: '0.8rem', 
            color: user?.username === 'guest' ? '#4b5563' : '#9ca3af', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px', 
            cursor: user?.username === 'guest' ? 'not-allowed' : 'pointer',
            opacity: user?.username === 'guest' ? 0.5 : 1
          }}>
            <input
              type="checkbox"
              checked={user?.username !== 'guest' && autoCloud}
              onChange={(e) => user?.username !== 'guest' && setAutoCloud(e.target.checked)}
              disabled={user?.username === 'guest'}
              style={{ cursor: user?.username === 'guest' ? 'not-allowed' : 'pointer' }}
            />
            Auto Cloud Delegation (Groq)
          </label>
          {user?.username !== 'guest' && autoCloud && (
            <label style={{ 
              fontSize: '0.8rem', 
              color: '#9ca3af', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              cursor: 'pointer',
              marginLeft: '12px'
            }}>
              <input
                type="checkbox"
                checked={allowGroqDocs}
                onChange={(e) => setAllowGroqDocs(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Allow Groq to read documents
            </label>
          )}
          <div className="badge" style={{
            background: (user?.username !== 'guest' && autoCloud) ? 'rgba(99, 102, 241, 0.15)' : 'rgba(6, 182, 212, 0.15)',
            color: (user?.username !== 'guest' && autoCloud) ? '#6366f1' : '#06b6d4',
            border: `1px solid ${(user?.username !== 'guest' && autoCloud) ? 'rgba(99, 102, 241, 0.3)' : 'rgba(6, 182, 212, 0.3)'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            {(user?.username !== 'guest' && autoCloud) ? <Sparkles size={12} /> : <ShieldCheck size={12} />}
            {user?.username === 'guest' ? 'Offline Only (Guest)' : (autoCloud ? 'Cloud via Groq' : 'Offline (Ollama)')}
          </div>
        </div>
      </div>

      <QsOutputPanel
        token={token}
        documentId={attachedFile?.status === 'ready' ? attachedFile.id : undefined}
        documentLabel={attachedFile?.status === 'ready' ? attachedFile.filename : undefined}
        disabled={loading || streaming || uploadingFile}
      />

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
              Upload your BOQ in Documents, wait until <strong>Ready</strong>, then use a quick prompt below.
            </p>
            <div className="chat-quick-prompts">
              <button type="button" disabled={loading || streaming} onClick={() => handleSendMessage('Explain this BOQ section by section in plain English for a quantity surveyor.')}>
                Explain BOQ
              </button>
              <button type="button" disabled={loading || streaming} onClick={() => handleSendMessage('Summarise earthwork and disposal items with quantities and amounts from the document.')}>
                Earthwork summary
              </button>
              <button type="button" disabled={loading || streaming} onClick={() => handleSendMessage('List concrete and formwork items with units, qty, rate and amount.')}>
                Concrete items
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

      <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        {fileError && !attachedFile && (
          <div className="chat-file-error" role="alert">
            <AlertCircle size={14} />
            <span>{fileError}</span>
            <button
              type="button"
              onClick={() => setFileError('')}
              aria-label="Dismiss error"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {attachedFile && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            background: 'rgba(31, 41, 55, 0.7)',
            border: `1px solid ${
              attachedFile.status === 'failed' ? 'rgba(239, 68, 68, 0.4)' : 
              attachedFile.status === 'ready' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(59, 130, 246, 0.4)'
            }`,
            borderRadius: '8px',
            marginBottom: '8px',
            fontSize: '0.85rem',
            alignSelf: 'flex-start',
            maxWidth: '100%',
            color: '#e5e7eb'
          }}>
            <Paperclip size={14} style={{ 
              color: attachedFile.status === 'failed' ? '#ef4444' : 
                     attachedFile.status === 'ready' ? '#10b981' : '#3b82f6' 
            }} />
            <span style={{ 
              textOverflow: 'ellipsis', 
              overflow: 'hidden', 
              whiteSpace: 'nowrap',
              maxWidth: '250px',
              fontWeight: 500
            }}>
              {attachedFile.filename}
            </span>
            
            {attachedFile.status === 'uploading' && (
              <span style={{ color: '#3b82f6', fontSize: '0.75rem' }}>(Uploading...)</span>
            )}
            {attachedFile.status === 'processing' && (
              <span style={{ color: '#fbbf24', fontSize: '0.75rem' }}>(Processing...)</span>
            )}
            {attachedFile.status === 'ready' && (
              <span style={{ color: '#10b981', fontSize: '0.75rem' }}>(Ready - scoped to query)</span>
            )}
            {attachedFile.status === 'failed' && (
              <span 
                style={{ color: '#ef4444', fontSize: '0.75rem', cursor: 'help', display: 'flex', alignItems: 'center', gap: '3px' }}
                title={attachedFile.error_message || 'Processing failed'}
              >
                <AlertCircle size={12} />
                Failed (hover for info)
              </span>
            )}
            
            <button
              type="button"
              onClick={() => {
                setAttachedFile(null);
                setFileError('');
                setUploadingFile(false);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#9ca3af',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="chat-input-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileSelect}
            accept={ACCEPT_ATTRIBUTE}
            disabled={loading || streaming || uploadingFile}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || streaming || uploadingFile}
            style={{ padding: '8px 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Attach a file to this chat query"
          >
            <Paperclip size={16} />
          </button>

          <textarea
            ref={textareaRef}
            className="chat-input"
            placeholder={uploadingFile ? "Uploading and processing file..." : "Ask about materials, cost estimations, drawing numbers, or specifications..."}
            rows="1"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading || streaming || uploadingFile}
            style={{ flex: 1 }}
          />
          <button
            className="btn btn-primary"
            onClick={() => handleSendMessage(inputText)}
            disabled={!inputText.trim() || loading || streaming || uploadingFile}
            style={{ padding: '8px 12px', borderRadius: '8px' }}
          >
            <Send size={16} />
          </button>
        </div>
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
