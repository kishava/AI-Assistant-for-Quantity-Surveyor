import React, { useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import ChatWindow from '../components/ChatWindow.jsx';
import DocumentUpload from '../components/DocumentUpload.jsx';

export default function Dashboard({ token, user, onLogout }) {
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' or 'documents'
  const [selectedConversationId, setSelectedConversationId] = useState('default');

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        selectedConversationId={selectedConversationId}
        setSelectedConversationId={setSelectedConversationId}
        user={user} 
        onLogout={onLogout} 
        token={token}
      />

      {/* Main Workspace Area */}
      <main className="workspace">
        {activeTab === 'chat' ? (
          <ChatWindow token={token} user={user} conversationId={selectedConversationId} />
        ) : (
          <DocumentUpload token={token} user={user} />
        )}
      </main>
    </div>
  );
}
