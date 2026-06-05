import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, ShieldCheck, Paperclip, X, AlertCircle } from 'lucide-react';
import ChatMessage from './ChatMessage.jsx';
import AssistantProgress from './AssistantProgress.jsx';
import ChatComposer from './ChatComposer.jsx';
import CloudConsentModal from './CloudConsentModal.jsx';
import { consumeChatStream } from '../utils/chatStream.js';
import { patchLastAssistant, replaceWorkingWithError } from '../utils/chatHelpers.js';
import QsOutputPanel from './QsOutputPanel.jsx';
import { ACCEPT_ATTRIBUTE } from '../config/fileTypes.js';
import { friendlyDocError } from '../utils/userMessages.js';
import QsQuickPrompts from './QsQuickPrompts.jsx';

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
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const pendingMessageRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const fetchHistory = async () => {
      setHistoryLoading(true);
      setHistoryError('');
      try {
        const response = await fetch(`/api/chat/history?conversationId=${conversationId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setMessages(data);
        } else {
          const data = await response.json().catch(() => ({}));
          setHistoryError(data.error || 'Could not load this chat history.');
        }
      } catch (err) {
        console.error('Failed to load chat history:', err);
        setHistoryError('Could not load chat history. Check that QS Assistant is running.');
      } finally {
        setHistoryLoading(false);
      }
    };

    fetchHistory();
  }, [token, conversationId]);

  useEffect(() => {
    setStreaming(false);
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    if (!historyLoading && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [historyLoading, conversationId]);

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
          if (meta.notice) {
            patchAssistant({ notice: meta.notice });
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
          if (meta.replace) {
            accumulated = meta.replace;
            patchAssistant({
              content: accumulated,
              working: false,
              streaming: true,
            });
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
                ? 'No answer was generated. Check sidebar status (local AI) and try again.'
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
    <div className="chat-layout">
      <header className="chat-topbar">
        <div className="chat-topbar-title">
          <h2>QS Assistant</h2>
          <p>Ask about BOQs, quantities, and specifications</p>
        </div>
        <div className="chat-topbar-actions">
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
            Use cloud AI when available (faster)
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
              Share document text with cloud AI
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
            {user?.username === 'guest' ? 'Guest — local only' : (autoCloud ? 'Cloud assist on' : 'Local AI only')}
          </div>
        </div>
      </header>

      <main className="chat-thread">
        <div className="chat-thread-inner">
          {historyError && (
            <div className="chat-inline-alert" role="alert">{historyError}</div>
          )}
          {historyLoading ? (
            <div className="chat-welcome chat-welcome-loading">
              <p>Loading conversation…</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="chat-welcome">
              <div className="chat-welcome-icon">
                <MessageSquarePlaceholder />
              </div>
              <h3>How can I help with your BOQ today?</h3>
              <p>Upload a file under <strong>Documents</strong>, attach it with the paperclip, or pick a QS prompt below.</p>
              <QsQuickPrompts
                onSelect={handleSendMessage}
                disabled={loading || streaming || uploadingFile}
              />
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
          <QsOutputPanel
            token={token}
            documentId={attachedFile?.status === 'ready' ? attachedFile.id : undefined}
            documentLabel={attachedFile?.status === 'ready' ? attachedFile.filename : undefined}
            disabled={loading || streaming || uploadingFile}
          />
          <div className="chat-composer-extras">
        {fileError && (
          <div className="chat-file-error" role="alert">
            <AlertCircle size={14} />
            <span>{fileError}</span>
            <button
              type="button"
              onClick={() => setFileError('')}
              aria-label="Dismiss file error"
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
              <span style={{ color: '#10b981', fontSize: '0.75rem' }}>(Ready for chat)</span>
            )}
            {attachedFile.status === 'failed' && (
              <span style={{ color: '#ef4444', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', maxWidth: '280px' }}>
                <AlertCircle size={12} />
                {friendlyDocError(attachedFile.error_message || fileError || 'Processing failed')}
              </span>
            )}
            
            <button
              type="button"
              aria-label="Remove attached file"
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

            <input
              type="file"
              ref={fileInputRef}
              className="hidden-file-input"
              onChange={handleFileSelect}
              accept={ACCEPT_ATTRIBUTE}
              disabled={loading || streaming || uploadingFile}
            />
            <QsQuickPrompts
              compact
              onSelect={(text) => {
                setInputText(text);
                textareaRef.current?.focus();
              }}
              disabled={loading || streaming || uploadingFile}
            />
            <ChatComposer
              textareaRef={textareaRef}
              inputText={inputText}
              onInputChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              onSend={() => handleSendMessage(inputText)}
              onAttach={() => fileInputRef.current?.click()}
              attachDisabled={loading || streaming || uploadingFile}
              inputDisabled={loading || streaming || uploadingFile}
              sendDisabled={!inputText.trim() || loading || streaming || uploadingFile}
              placeholder={
                uploadingFile
                  ? 'Uploading and processing file…'
                  : 'Message QS Assistant…'
              }
            />
          </div>
        </div>
      </footer>

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
