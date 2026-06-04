import React from 'react';
import { Cpu, User, FileText } from 'lucide-react';

function formatMessageTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  const timeLabel = formatMessageTime(msg.created_at);

  const formatInline = (line) => {
    const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);

    return parts.map((part, index) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={index} className="message-inline-code">
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={index}>{part.slice(1, -1)}</em>;
      }
      return part;
    });
  };

  const formatContent = (content) => {
    if (!content) return '';

    return content.split('\n').map((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        return (
          <li key={idx} className="message-list-item">
            {formatInline(trimmed.substring(2))}
          </li>
        );
      }

      return (
        <p key={idx} className={trimmed === '' ? 'message-paragraph-spaced' : 'message-paragraph'}>
          {formatInline(line)}
        </p>
      );
    });
  };

  return (
    <div className={`message-bubble ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-meta" style={{ justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
        {isUser ? (
          <>
            {timeLabel && <span className="message-time">{timeLabel}</span>}
            <span>You</span>
            <User size={12} />
          </>
        ) : (
          <>
            <Cpu size={12} style={{ color: msg.isError ? '#f43f5e' : '#06b6d4' }} />
            <span>Assistant</span>
            {msg.model_used && (
              <span className="message-model-badge">{msg.model_used}</span>
            )}
            {timeLabel && <span className="message-time">{timeLabel}</span>}
          </>
        )}
      </div>

      {!isUser && msg.thinking && msg.thinking.length > 0 && (
        <details className="thinking-panel thinking-panel-inline" open={!!msg.streaming}>
          <summary className="thinking-panel-title">Reasoning ({msg.thinking.length} steps)</summary>
          <ul className="thinking-list">
            {msg.thinking.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </details>
      )}

      <div
        className="message-content"
        style={{
          color: msg.isError ? '#f43f5e' : 'inherit',
          borderColor: msg.isError ? 'rgba(244, 63, 94, 0.3)' : undefined
        }}
      >
        {formatContent(msg.content)}
      </div>

      {!isUser && msg.citations && msg.citations.length > 0 && (
        <div className="citations-wrapper">
          <span className="citations-label">
            <FileText size={10} /> Source Documents:
          </span>
          {msg.citations.map((citation, index) => (
            <div key={index} className="citation-badge">
              {citation}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
