import React, { useEffect, useRef } from 'react';
import { ShieldAlert, CloudLightning, Cpu } from 'lucide-react';

export default function CloudConsentModal({ onConfirm, onDecline, onCancel, tokenCount, threshold }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="modal-content glass-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-dialog-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="consent-icon-wrap">
            <ShieldAlert size={28} />
          </div>
          <div>
            <h2 id="consent-dialog-title" style={{ fontSize: '1.25rem', fontWeight: 700 }}>
              Use cloud AI for this question?
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '2px' }}>
              Your question is large — faster on cloud, but text leaves this device
            </p>
          </div>
        </div>

        <div className="consent-summary-box">
          <p>
            <strong>What stays local:</strong> Your files remain on this computer unless you also enable
            &quot;Share document text with cloud&quot;.
          </p>
          <p>
            <strong>What may go to cloud:</strong> Your question and relevant document excerpts used to
            answer it (~{tokenCount || 'many'} words of context; local limit ~{threshold}).
          </p>
        </div>

        <div className="consent-actions">
          <button type="button" className="btn btn-primary consent-btn-primary" onClick={onConfirm}>
            <CloudLightning size={16} />
            <span>Use cloud (faster)</span>
          </button>
          <button type="button" className="btn btn-cyan" onClick={onDecline} style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
            <Cpu size={16} />
            <span>Keep on this device (local AI)</span>
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel} style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
