import React from 'react';
import { Send, Paperclip } from 'lucide-react';

export default function ChatComposer({
  textareaRef,
  inputText,
  onInputChange,
  onKeyDown,
  onSend,
  onAttach,
  attachDisabled,
  sendDisabled,
  placeholder,
  showAttach = true,
  children,
}) {
  return (
    <div className="chat-composer-shell">
      {children}
      <div className="chat-composer">
        {showAttach && onAttach && (
          <button
            type="button"
            className="chat-composer-icon-btn"
            onClick={onAttach}
            disabled={attachDisabled}
            title="Attach document"
            aria-label="Attach document"
          >
            <Paperclip size={20} />
          </button>
        )}
        <textarea
          ref={textareaRef}
          className="chat-composer-input"
          placeholder={placeholder}
          rows={1}
          value={inputText}
          onChange={onInputChange}
          onKeyDown={onKeyDown}
          disabled={sendDisabled && !inputText}
        />
        <button
          type="button"
          className="chat-composer-send"
          onClick={onSend}
          disabled={sendDisabled}
          aria-label="Send message"
        >
          <Send size={18} />
        </button>
      </div>
      <p className="chat-composer-hint">QS Assistant can make mistakes. Verify quantities and rates on site.</p>
    </div>
  );
}
