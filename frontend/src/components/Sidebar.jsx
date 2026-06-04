import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Files, LogOut, HardDrive, Plus, Trash2, Edit3, Check, X } from 'lucide-react';
import { healthServiceLabel } from '../utils/userMessages.js';

function NavItem({ active, onClick, children }) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`nav-item ${active ? 'active' : ''}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {children}
    </div>
  );
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  selectedConversationId,
  setSelectedConversationId,
  user,
  onLogout,
  token,
}) {
  const [health, setHealth] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [sidebarNotice, setSidebarNotice] = useState('');

  const fetchConversations = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/chat/conversations', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setConversations(await res.json());
        setSidebarNotice('');
      } else {
        setSidebarNotice('Could not load chat list.');
      }
    } catch {
      setSidebarNotice('Could not reach the assistant. Is it running?');
    }
  }, [token]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) setHealth(await res.json());
        else setHealth({ status: 'error' });
      } catch {
        setHealth({ status: 'error' });
      }
    };
    fetchHealth();
    const timer = setInterval(fetchHealth, 30000);
    return () => clearInterval(timer);
  }, []);

  const handleCreateConversation = async () => {
    try {
      const res = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: 'New Chat' }),
      });
      if (res.ok) {
        const data = await res.json();
        await fetchConversations();
        setSelectedConversationId(data.id);
        setActiveTab('chat');
      } else {
        setSidebarNotice('Could not create a new chat.');
      }
    } catch {
      setSidebarNotice('Could not create a new chat. Check the app is running.');
    }
  };

  const handleDeleteConversation = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this chat? Messages cannot be recovered.')) return;
    try {
      const res = await fetch(`/api/chat/conversations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await fetchConversations();
        if (selectedConversationId === id) setSelectedConversationId('default');
      } else {
        setSidebarNotice('Could not delete chat.');
      }
    } catch {
      setSidebarNotice('Could not delete chat.');
    }
  };

  const startEditing = (conv, e) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const handleSaveRename = async (id) => {
    if (!editTitle.trim()) return;
    try {
      const res = await fetch(`/api/chat/conversations/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: editTitle }),
      });
      if (res.ok) {
        setEditingId(null);
        await fetchConversations();
      } else {
        setSidebarNotice('Could not rename chat.');
      }
    } catch {
      setSidebarNotice('Could not rename chat.');
    }
  };

  const handleCancelRename = (e) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const ollamaOk = health?.ollama?.status === 'ok';
  const chromaOk = health?.chroma?.status === 'ok';
  const allCoreOk = ollamaOk && chromaOk;

  const statusLabel = !health
    ? 'Checking services…'
    : allCoreOk
      ? 'Ready for offline use'
      : ollamaOk
        ? 'Document search limited'
        : 'Local AI unavailable';

  const dotColor = allCoreOk ? 'var(--accent-emerald)' : 'var(--accent-rose)';

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <HardDrive size={22} style={{ color: '#06b6d4' }} />
        <span>QS Assistant</span>
      </div>

      {sidebarNotice && (
        <div className="sidebar-notice" role="alert">
          {sidebarNotice}
          <button type="button" className="sidebar-notice-dismiss" onClick={() => setSidebarNotice('')} aria-label="Dismiss">
            <X size={12} />
          </button>
        </div>
      )}

      <nav className="sidebar-nav">
        <NavItem active={activeTab === 'chat'} onClick={() => setActiveTab('chat')}>
          <MessageSquare size={18} />
          <span>Chat</span>
        </NavItem>

        <NavItem active={activeTab === 'documents'} onClick={() => setActiveTab('documents')}>
          <Files size={18} />
          <span>Documents</span>
        </NavItem>

        {activeTab === 'chat' && (
          <div className="sidebar-conversations-section animate-fade-in">
            <div className="conversations-header">
              <span className="section-title">Recent chats</span>
              <button
                type="button"
                className="btn-new-chat"
                onClick={handleCreateConversation}
                aria-label="Start a new chat"
                title="New chat"
              >
                <Plus size={14} />
              </button>
            </div>

            <div className="conversations-list">
              <div
                role="button"
                tabIndex={0}
                className={`conversation-item ${selectedConversationId === 'default' ? 'active' : ''}`}
                onClick={() => setSelectedConversationId('default')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedConversationId('default');
                  }
                }}
              >
                <MessageSquare size={14} className="conv-icon" />
                <span className="conversation-title" title="Main chat">Main chat</span>
              </div>

              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  role="button"
                  tabIndex={0}
                  className={`conversation-item ${selectedConversationId === conv.id ? 'active' : ''}`}
                  onClick={() => setSelectedConversationId(conv.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedConversationId(conv.id);
                    }
                  }}
                >
                  <MessageSquare size={14} className="conv-icon" />
                  {editingId === conv.id ? (
                    <div className="rename-input-wrapper" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        className="rename-input"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename(conv.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                        aria-label="Chat title"
                      />
                      <button type="button" className="rename-btn save" onClick={() => handleSaveRename(conv.id)} aria-label="Save name">
                        <Check size={12} />
                      </button>
                      <button type="button" className="rename-btn cancel" onClick={handleCancelRename} aria-label="Cancel rename">
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="conversation-title" title={conv.title}>{conv.title}</span>
                      <div className="conversation-actions">
                        <button type="button" className="action-btn edit" onClick={(e) => startEditing(conv, e)} title="Rename chat" aria-label="Rename chat">
                          <Edit3 size={12} />
                        </button>
                        <button type="button" className="action-btn delete" onClick={(e) => handleDeleteConversation(conv.id, e)} title="Delete chat" aria-label="Delete chat">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </nav>

      {health && (
        <div className="service-status-panel" title="Background services for local AI and document search">
          <div className="service-status-row">
            <span className={`service-dot ${health.ollama?.status === 'ok' ? 'ok' : health.ollama?.status === 'warning' ? 'warn' : 'error'}`} />
            {healthServiceLabel('ollama', health.ollama)}
          </div>
          <div className="service-status-row">
            <span className={`service-dot ${chromaOk ? 'ok' : health.chroma?.status === 'warning' ? 'warn' : 'error'}`} />
            {healthServiceLabel('chroma', health.chroma)}
          </div>
          <div className="service-status-row">
            <span className={`service-dot ${health.groq?.status === 'ok' ? 'ok' : 'warn'}`} />
            {healthServiceLabel('groq', health.groq)}
          </div>
        </div>
      )}

      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="avatar">{user.username.slice(0, 2).toUpperCase()}</div>
          <div className="user-info">
            <span className="username">{user.username}</span>
            <div className="status-indicator">
              <span className="status-dot" style={{ backgroundColor: dotColor }} />
              <span>{statusLabel}</span>
            </div>
          </div>
        </div>

        <button type="button" className="btn btn-secondary" onClick={onLogout} style={{ width: '100%', justifyContent: 'flex-start', padding: '8px 12px' }}>
          <LogOut size={16} />
          <span>Log out</span>
        </button>
      </div>
    </aside>
  );
}
