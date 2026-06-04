import React, { useState, useEffect } from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';

export default function ThinkingBlock({ steps, defaultOpen = false, live = false }) {
  const [open, setOpen] = useState(defaultOpen || live);

  useEffect(() => {
    if (live) setOpen(true);
    else if (!live && steps?.length) setOpen(false);
  }, [live, steps?.length]);

  if (!steps?.length) return null;

  return (
    <div className={`thought-block${live ? ' thought-block-live' : ''}`}>
      <button
        type="button"
        className="thought-block-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ChevronRight size={16} className={`thought-chevron${open ? ' open' : ''}`} />
        <Sparkles size={14} className="thought-icon" />
        <span className="thought-label">
          {live ? 'Thinking…' : 'Thought process'}
        </span>
        <span className="thought-count">{steps.length} steps</span>
      </button>
      {open && (
        <div className="thought-block-body">
          <ol className="thought-steps">
            {steps.map((step, i) => (
              <li key={i} className="thought-step">
                <span className="thought-step-num">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
