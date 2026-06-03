import React, { useState, useEffect } from 'react';
import { MessageSquare, Files, LogOut, HardDrive, Plus, Trash2, Edit3, Check, X } from 'lucide-react';

export default function Sidebar({ 
  activeTab, 
  setActiveTab, 
  selectedConversationId, 
  setSelectedConversationId, 
  user, 
  onLogout, 
  token 
}) {
  const [health, setHealth] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  const fetchConversations = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/chat/conversations', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, [token]);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) setHealth(await res.json());
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
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title: 'New Chat' })
      });
      if (res.ok) {
        const data = await res.json();
        await fetchConversations();
        setSelectedConversationId(data.id);
        setActiveTab('chat');
      }
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  };

  const handleDeleteConversation = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this chat session?')) return;
    try {
      const res = await fetch(`/api/chat/conversations/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        await fetchConversations();
        if (selectedConversationId === id) {
          setSelectedConversationId('default');
        }
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
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
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title: editTitle })
      });
      if (res.ok) {
        setEditingId(null);
        await fetchConversations();
      }
    } catch (err) {
      console.error('Failed to rename conversation:', err);
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
      ? 'Offline-first ready'
      : ollamaOk
        ? 'ChromaDB unavailable'
        : 'Ollama unavailable';

  const dotColor = allCoreOk ? 'var(--accent-emerald)' : 'var(--accent-rose)';

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <HardDrive size={22} style={{ color: '#06b6d4' }} />
        <span>QS Assistant</span>
      </div>

      <nav className="sidebar-nav">
        <div
          className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          <MessageSquare size={18} />
          <span>Chat Assistant</span>
        </div>

        <div
          className={`nav-item ${activeTab === 'documents' ? 'active' : ''}`}
          onClick={() => setActiveTab('documents')}
        >
          <Files size={18} />
          <span>Documents</span>
        </div>

        {/* Conversations section */}
        {activeTab === 'chat' && (
          <div className="sidebar-conversations-section animate-fade-in">
            <div className="conversations-header">
              <span className="section-title">Recent Chats</span>
              <button 
                className="btn-new-chat" 
                onClick={handleCreateConversation}
                title="Start a new chat"
              >
                <Plus size={14} />
              </button>
            </div>

            <div className="conversations-list">
              <div 
                className={`conversation-item ${selectedConversationId === 'default' ? 'active' : ''}`}
                onClick={() => setSelectedConversationId('default')}
              >
                <MessageSquare size={14} className="conv-icon" />
                <span className="conversation-title" title="Default Workspace">Default Workspace</span>
              </div>

              {conversations.map(conv => (
                <div 
                  key={conv.id}
                  className={`conversation-item ${selectedConversationId === conv.id ? 'active' : ''}`}
                  onClick={() => setSelectedConversationId(conv.id)}
                >
                  <MessageSquare size={14} className="conv-icon" />
                  {editingId === conv.id ? (
                    <div className="rename-input-wrapper" onClick={e => e.stopPropagation()}>
                      <input
                        type="text"
                        className="rename-input"
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveRename(conv.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                      />
                      <button className="rename-btn save" onClick={() => handleSaveRename(conv.id)}>
                        <Check size={12} />
                      </button>
                      <button className="rename-btn cancel" onClick={handleCancelRename}>
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="conversation-title" title={conv.title}>{conv.title}</span>
                      <div className="conversation-actions">
                        <button 
                          className="action-btn edit" 
                          onClick={e => startEditing(conv, e)}
                          title="Rename chat"
                        >
                          <Edit3 size={12} />
                        </button>
                        <button 
                          className="action-btn delete" 
                          onClick={e => handleDeleteConversation(conv.id, e)}
                          title="Delete chat"
                        >
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
        <div className="service-status-panel">
          <div className="service-status-row">
            <span className={`service-dot ${ollamaOk ? 'ok' : 'error'}`} />
            Ollama {health.ollama?.status || 'unknown'}
          </div>
          <div className="service-status-row">
            <span className={`service-dot ${chromaOk ? 'ok' : 'error'}`} />
            ChromaDB {health.chroma?.status || 'unknown'}
          </div>
          <div className="service-status-row">
            <span className={`service-dot ${health.groq?.status === 'ok' ? 'ok' : 'warn'}`} />
            Groq {health.groq?.status || 'unknown'}
          </div>
        </div>
      )}

      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="avatar">
            {user.username.slice(0, 2).toUpperCase()}
          </div>
          <div className="user-info">
            <span className="username">{user.username}</span>
            <div className="status-indicator">
              <span className="status-dot" style={{ backgroundColor: dotColor }} />
              <span>{statusLabel}</span>
            </div>
          </div>
        </div>

        <button
          className="btn btn-secondary"
          onClick={onLogout}
          style={{ width: '100%', justifyContent: 'flex-start', padding: '8px 12px' }}
        >
          <LogOut size={16} />
          <span>Log Out</span>
        </button>
      </div>
    </aside>
  );
}
