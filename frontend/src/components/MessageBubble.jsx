import React, { useState } from 'react';
import { Cpu, User, FileText, ChevronDown, Brain } from 'lucide-react';
import { parseMarkdownBlocks } from '../utils/parseMarkdownTables.js';
import QsDataTable from './QsDataTable.jsx';

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
  const hasThinking = !isUser && msg.thinking && msg.thinking.length > 0;
  const [showThinking, setShowThinking] = useState(false);

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

  const formatTextBlock = (content) => {
    return content.split('\n').map((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('## ')) {
        return (
          <h3 key={idx} className="message-heading">
            {formatInline(trimmed.slice(3))}
          </h3>
        );
      }
      if (trimmed.startsWith('### ')) {
        return (
          <h4 key={idx} className="message-subheading">
            {formatInline(trimmed.slice(4))}
          </h4>
        );
      }
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

  const formatContent = (content) => {
    if (!content) return '';

    const blocks = parseMarkdownBlocks(content);
    return blocks.map((block, bi) => {
      if (block.type === 'table') {
        return (
          <QsDataTable
            key={`tbl-${bi}`}
            columns={block.columns}
            rows={block.rows}
          />
        );
      }
      return <div key={`txt-${bi}`}>{formatTextBlock(block.content)}</div>;
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

      {!isUser && hasThinking && (
        <div className="reasoning-toolbar">
          <button
            type="button"
            className={`reasoning-toggle-btn${showThinking ? ' active' : ''}`}
            onClick={() => setShowThinking((v) => !v)}
            aria-expanded={showThinking}
          >
            <Brain size={14} />
            <span>{showThinking ? 'Hide reasoning' : 'View reasoning'}</span>
            <span className="reasoning-count">{msg.thinking.length}</span>
            <ChevronDown size={14} className={`reasoning-chevron${showThinking ? ' open' : ''}`} />
          </button>
          {showThinking && (
            <div className="thinking-panel thinking-panel-collapsed">
              <ul className="thinking-list">
                {msg.thinking.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!isUser && msg.content?.trim() && (
        <div className="answer-label">Answer</div>
      )}

      <div
        className={`message-content${!isUser && msg.content?.trim() ? ' message-content-answer' : ''}`}
        style={{
          color: msg.isError ? '#f43f5e' : 'inherit',
          borderColor: msg.isError ? 'rgba(244, 63, 94, 0.3)' : undefined,
        }}
      >
        {msg.content?.trim() ? formatContent(msg.content) : (
          <span className="progress-hint">Waiting for answer…</span>
        )}
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
