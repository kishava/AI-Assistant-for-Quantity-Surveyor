import React from 'react';
import { MessageSquare, Files, LogOut, HardDrive } from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, user, onLogout }) {
  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div className="sidebar-logo">
        <HardDrive size={22} style={{ color: '#06b6d4' }} />
        <span>QS Assistant</span>
      </div>

      {/* Navigation List */}
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

      {/* User Session Info & Actions */}
      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="avatar">
            {user.username.slice(0, 2).toUpperCase()}
          </div>
          <div className="user-info">
            <span className="username">{user.username}</span>
            <div className="status-indicator">
              <span className="status-dot"></span>
              <span>Offline-first ready</span>
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
