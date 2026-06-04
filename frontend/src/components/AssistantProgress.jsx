import React from 'react';
import ThinkingBlock from './ThinkingBlock.jsx';

export default function AssistantProgress({ msg }) {
  const thinking = msg.thinking || [];
  const stage = msg.stage || 'Working on your answer…';

  return (
    <div className="chat-msg chat-msg-assistant">
      <div className="chat-msg-assistant-row">
        <div className="chat-avatar chat-avatar-assistant chat-avatar-pulse" aria-hidden="true">
          QS
        </div>
        <div className="chat-msg-body">
          <div className="chat-status-line">
            <span className="progress-spinner" aria-hidden="true" />
            <span>{stage}</span>
          </div>
          {thinking.length > 0 && (
            <ThinkingBlock steps={thinking} live defaultOpen />
          )}
          {!thinking.length && (
            <p className="chat-status-hint">Reading your documents…</p>
          )}
          <span className="chat-typing-indicator">
            <span /><span /><span />
          </span>
        </div>
      </div>
    </div>
  );
}
