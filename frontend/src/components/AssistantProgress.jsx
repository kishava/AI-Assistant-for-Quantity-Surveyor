import React from 'react';
import { Cpu, Brain } from 'lucide-react';

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

export default function AssistantProgress({ msg }) {
  const timeLabel = formatMessageTime(msg.created_at);
  const thinking = msg.thinking || [];
  const stage = msg.stage || 'Working on your answer…';
  const compiling = msg.answerPhase === 'compiling';

  return (
    <div className="message-bubble assistant assistant-progress">
      <div className="message-meta">
        <Cpu size={12} style={{ color: '#06b6d4' }} />
        <span>Assistant</span>
        {timeLabel && <span className="message-time">{timeLabel}</span>}
      </div>

      <div className="progress-card">
        <div className="progress-stage-row">
          <span className="progress-spinner" aria-hidden="true" />
          <span className="loading-stage-text">{stage}</span>
        </div>

        {thinking.length > 0 && (
          <div className="thinking-panel thinking-panel-live">
            <div className="thinking-panel-title">
              <Brain size={12} /> Reasoning
            </div>
            <ul className="thinking-list">
              {thinking.map((line, i) => (
                <li key={i} className="thinking-line-animate" style={{ animationDelay: `${i * 0.05}s` }}>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )}

        {compiling && (
          <p className="progress-compiling">Compiling your BOQ summary…</p>
        )}

        {!compiling && thinking.length === 0 && (
          <p className="progress-hint">Reading your documents and preparing a clear answer…</p>
        )}
      </div>
    </div>
  );
}
