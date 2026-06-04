import React from 'react';
import { parseMarkdownBlocks } from './parseMarkdownTables.js';
import QsDataTable from '../components/QsDataTable.jsx';

function formatInline(text) {
  const parts = String(text).split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index} className="message-inline-code">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

function renderLines(lines, keyPrefix) {
  const out = [];
  let bulletBuf = [];
  let numberBuf = [];
  let key = 0;

  const flushBullets = () => {
    if (!bulletBuf.length) return;
    out.push(
      <ul key={`${keyPrefix}-ul-${key++}`} className="chat-list">
        {bulletBuf.map((item, i) => (
          <li key={i}>{formatInline(item)}</li>
        ))}
      </ul>
    );
    bulletBuf = [];
  };

  const flushNumbers = () => {
    if (!numberBuf.length) return;
    out.push(
      <ol key={`${keyPrefix}-ol-${key++}`} className="chat-list chat-list-ordered">
        {numberBuf.map((item, i) => (
          <li key={i}>{formatInline(item)}</li>
        ))}
      </ol>
    );
    numberBuf = [];
  };

  const flushLists = () => {
    flushBullets();
    flushNumbers();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^[-*•]\s+/.test(trimmed)) {
      flushNumbers();
      bulletBuf.push(trimmed.replace(/^[-*•]\s+/, ''));
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      flushBullets();
      numberBuf.push(trimmed.replace(/^\d+\.\s+/, ''));
      continue;
    }

    flushLists();

    if (!trimmed) continue;

    if (trimmed.startsWith('## ')) {
      out.push(
        <h3 key={`${keyPrefix}-h3-${key++}`} className="chat-heading">
          {formatInline(trimmed.slice(3))}
        </h3>
      );
    } else if (trimmed.startsWith('### ')) {
      out.push(
        <h4 key={`${keyPrefix}-h4-${key++}`} className="chat-subheading">
          {formatInline(trimmed.slice(4))}
        </h4>
      );
    } else {
      out.push(
        <p key={`${keyPrefix}-p-${key++}`} className="chat-paragraph">
          {formatInline(line)}
        </p>
      );
    }
  }

  flushLists();
  return out;
}

export function MessageContent({ content }) {
  if (!content?.trim()) return null;

  const blocks = parseMarkdownBlocks(content);
  return (
    <div className="chat-formatted-content">
      {blocks.map((block, bi) =>
        block.type === 'table' ? (
          <QsDataTable key={`tbl-${bi}`} columns={block.columns} rows={block.rows} />
        ) : (
          <div key={`txt-${bi}`}>{renderLines(block.content.split('\n'), `b${bi}`)}</div>
        )
      )}
    </div>
  );
}
