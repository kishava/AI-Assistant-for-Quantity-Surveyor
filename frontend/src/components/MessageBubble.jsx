import React from 'react';
import { Cpu, User, FileText } from 'lucide-react';

export default function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';

  const formatInline = (line) => {
    const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);

    return parts.map((part, index) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={index}
            style={{
              background: 'rgba(255,255,255,0.08)',
              padding: '2px 4px',
              borderRadius: '4px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85em'
            }}
          >
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
          <li key={idx} style={{ marginLeft: '20px', marginBottom: '4px' }}>
            {formatInline(trimmed.substring(2))}
          </li>
        );
      }

      return (
        <p key={idx} style={{ marginBottom: trimmed === '' ? '12px' : '6px' }}>
          {formatInline(line)}
        </p>
      );
    });
  };

  return (
    <div className={`message-bubble ${isUser ? 'user' : 'assistant'}`}>
      
      {/* Sender profile header */}
      <div className="message-meta" style={{ justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
        {isUser ? (
          <>
            <span>You</span>
            <User size={12} />
          </>
        ) : (
          <>
            <Cpu size={12} style={{ color: msg.isError ? '#f43f5e' : '#06b6d4' }} />
            <span>Assistant</span>
            {msg.model_used && (
              <span style={{ 
                background: 'rgba(255,255,255,0.05)', 
                border: '1px solid rgba(255,255,255,0.08)',
                padding: '1px 6px',
                borderRadius: '4px',
                fontSize: '0.7rem',
                color: '#9ca3af'
              }}>
                {msg.model_used}
              </span>
            )}
          </>
        )}
      </div>

      {/* Main bubble */}
      <div 
        className="message-content" 
        style={{
          color: msg.isError ? '#f43f5e' : 'inherit',
          borderColor: msg.isError ? 'rgba(244, 63, 94, 0.3)' : undefined
        }}
      >
        {formatContent(msg.content)}
      </div>

      {/* Citations block for Assistant responses */}
      {!isUser && msg.citations && msg.citations.length > 0 && (
        <div className="citations-wrapper">
          <span style={{ fontSize: '0.75rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px', width: '100%', marginBottom: '2px' }}>
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
