import React from 'react';
import { User, FileText } from 'lucide-react';
import { MessageContent } from '../utils/formatMessageContent.jsx';
import ThinkingBlock from './ThinkingBlock.jsx';

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function ChatMessage({ msg }) {
  const isUser = msg.role === 'user';
  const hasThinking = !isUser && msg.thinking?.length > 0;
  const isLive = msg.streaming && msg.working;

  if (isUser) {
    return (
      <div className="chat-msg chat-msg-user">
        <div className="chat-msg-user-row">
          <div className="chat-bubble-user">
            <MessageContent content={msg.content} />
          </div>
          <div className="chat-avatar chat-avatar-user" title="You">
            <User size={16} />
          </div>
        </div>
        {msg.created_at && (
          <span className="chat-msg-time">{formatTime(msg.created_at)}</span>
        )}
      </div>
    );
  }

  return (
    <div className={`chat-msg chat-msg-assistant${msg.isError ? ' chat-msg-error' : ''}`}>
      <div className="chat-msg-assistant-row">
        <div className="chat-avatar chat-avatar-assistant" aria-hidden="true">
          QS
        </div>
        <div className="chat-msg-body">
          {msg.notice && (
            <p className="chat-system-notice" role="status">{msg.notice}</p>
          )}
          {hasThinking && (
            <ThinkingBlock
              steps={msg.thinking}
              live={isLive}
              defaultOpen={isLive}
            />
          )}

          <div className="chat-bubble-assistant">
            {msg.content?.trim() ? (
              <MessageContent content={msg.content} />
            ) : msg.streaming ? (
              <span className="chat-typing-indicator" aria-label="Assistant is typing">
                <span /><span /><span />
              </span>
            ) : null}
            {msg.streaming && msg.content?.trim() && (
              <span className="streaming-cursor" aria-hidden="true" />
            )}
          </div>

          {msg.citations?.length > 0 && (
            <div className="chat-sources">
              <FileText size={12} />
              <span>
                {msg.citations.map((c, i) => (
                  <span key={i} className="chat-source-chip">{c}</span>
                ))}
              </span>
            </div>
          )}

          {(msg.model_used || msg.created_at) && !msg.streaming && (
            <div className="chat-msg-footer">
              {msg.model_used && <span className="chat-model-tag">{msg.model_used}</span>}
              {msg.created_at && <span className="chat-msg-time">{formatTime(msg.created_at)}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
