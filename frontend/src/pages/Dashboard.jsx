import React, { useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import ChatWindow from '../components/ChatWindow.jsx';
import DocumentUpload from '../components/DocumentUpload.jsx';

export default function Dashboard({ token, user, onLogout }) {
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' or 'documents'

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        user={user} 
        onLogout={onLogout} 
      />

      {/* Main Workspace Area */}
      <main className="workspace">
        {activeTab === 'chat' ? (
          <ChatWindow token={token} />
        ) : (
          <DocumentUpload token={token} />
        )}
      </main>
    </div>
  );
}
