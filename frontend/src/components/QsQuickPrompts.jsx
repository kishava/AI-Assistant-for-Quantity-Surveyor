import React, { useState } from 'react';
import { Lightbulb, ChevronDown } from 'lucide-react';
import { QS_QUICK_PROMPT_CATEGORIES } from '../config/qsQuickPrompts.js';

export default function QsQuickPrompts({ onSelect, disabled, compact = false }) {
  const [open, setOpen] = useState(!compact);
  const [activeCategory, setActiveCategory] = useState(QS_QUICK_PROMPT_CATEGORIES[0]?.id);

  const category = QS_QUICK_PROMPT_CATEGORIES.find((c) => c.id === activeCategory);

  return (
    <div className={`qs-quick-prompts${compact ? ' qs-quick-prompts-compact' : ''}`}>
      <button
        type="button"
        className="qs-quick-prompts-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Lightbulb size={15} />
        <span>QS quick prompts</span>
        <ChevronDown size={14} className={`reasoning-chevron${open ? ' open' : ''}`} />
      </button>

      {open && (
        <div className="qs-quick-prompts-body">
          <div className="qs-quick-prompts-tabs" role="tablist">
            {QS_QUICK_PROMPT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={activeCategory === cat.id}
                className={`qs-quick-tab${activeCategory === cat.id ? ' active' : ''}`}
                onClick={() => setActiveCategory(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </div>
          {category && (
            <div className="chat-quick-prompts" role="tabpanel">
              {category.prompts.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(p.text)}
                  title={p.text}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
