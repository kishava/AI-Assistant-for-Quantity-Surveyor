import React, { useState } from 'react';
import { Table2, ChevronDown, Loader2 } from 'lucide-react';
import { QS_OUTPUT_TYPES } from '../config/qsOutputTypes.js';
import QsDataTable from './QsDataTable.jsx';

export default function QsOutputPanel({ token, documentId, documentLabel, disabled }) {
  const [open, setOpen] = useState(false);
  const [outputType, setOutputType] = useState('boq_line_items');
  const [hint, setHint] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emptyResult, setEmptyResult] = useState(false);
  const [result, setResult] = useState(null);

  const scopeText = documentLabel
    ? `"${documentLabel}"`
    : documentId
      ? 'the attached document'
      : 'your most recent ready document (upload one under Documents if none appears)';

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    setEmptyResult(false);
    setResult(null);

    try {
      const response = await fetch('/api/qs-outputs/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: outputType,
          documentId: documentId || undefined,
          hint: hint.trim() || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Generation failed');
      if (data.error) {
        setError(data.error);
        return;
      }
      if (!data.tables?.length) {
        setEmptyResult(true);
        setOpen(true);
        return;
      }
      setResult(data);
      setOpen(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const selected = QS_OUTPUT_TYPES.find((t) => t.id === outputType);

  return (
    <div className="qs-output-panel">
      <button
        type="button"
        className="qs-output-panel-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="qs-output-panel-body"
      >
        <Table2 size={16} />
        <span>Generate QS tables</span>
        <ChevronDown size={16} className={`reasoning-chevron${open ? ' open' : ''}`} />
      </button>

      {open && (
        <div id="qs-output-panel-body" className="qs-output-panel-body">
          <p className="qs-output-panel-desc">
            Build structured tables from {scopeText} — review here or export as CSV.
          </p>

          {disabled && (
            <p className="qs-output-panel-hint">Wait until the assistant finishes the current reply.</p>
          )}

          <div className="qs-output-form">
            <label className="qs-output-label">
              Output type
              <select
                value={outputType}
                onChange={(e) => setOutputType(e.target.value)}
                disabled={loading || disabled}
                className="qs-output-select"
              >
                {QS_OUTPUT_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            {selected && <p className="qs-output-type-hint">{selected.description}</p>}

            <label className="qs-output-label">
              Focus (optional)
              <input
                type="text"
                className="qs-output-input"
                placeholder="e.g. Earth work only, concrete items…"
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                disabled={loading || disabled}
              />
            </label>

            <button
              type="button"
              className="btn btn-cyan"
              onClick={handleGenerate}
              disabled={loading || disabled}
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="qs-spin" />
                  Generating…
                </>
              ) : (
                'Generate table'
              )}
            </button>
          </div>

          {error && (
            <div className="qs-output-error" role="alert">
              {error}
              <button type="button" className="qs-output-retry" onClick={handleGenerate} disabled={loading || disabled}>
                Try again
              </button>
            </div>
          )}

          {emptyResult && (
            <div className="qs-output-empty" role="status">
              No table rows could be extracted. Try a different output type, reprocess the file in Documents, or ask in chat.
            </div>
          )}

          {result && result.tables?.length > 0 && (
            <div className="qs-output-results">
              <h3 className="qs-output-result-title">{result.title}</h3>
              {result.document && <p className="qs-output-result-meta">Source: {result.document}</p>}
              {result.tables.map((table, idx) => (
                <QsDataTable key={idx} title={table.title} columns={table.columns} rows={table.rows} />
              ))}
              {result.notes?.length > 0 && (
                <div className="qs-output-notes">
                  <strong>Notes for QS</strong>
                  <ul>
                    {result.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
