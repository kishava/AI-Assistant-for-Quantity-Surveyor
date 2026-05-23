import React, { useState, useEffect } from 'react';
import { MessageSquare, Files, LogOut, HardDrive } from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, user, onLogout }) {
  const [health, setHealth] = useState(null);

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
