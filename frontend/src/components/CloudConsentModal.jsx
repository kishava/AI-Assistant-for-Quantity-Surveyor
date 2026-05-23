import React from 'react';
import { ShieldAlert, Cpu, CloudLightning } from 'lucide-react';

export default function CloudConsentModal({ onConfirm, onDecline, onCancel, tokenCount, threshold }) {
  return (
    <div className="modal-overlay">
      <div className="modal-content glass-panel">
        
        {/* Header Icon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            borderRadius: '12px',
            padding: '10px',
            display: 'inline-flex',
            color: '#f43f5e'
          }}>
            <ShieldAlert size={28} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Data Delegation Warning</h2>
            <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '2px' }}>Large query context detected</p>
          </div>
        </div>

        {/* Token warning summary */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--glass-border)',
          borderRadius: '8px',
          padding: '14px 18px',
          fontSize: '0.85rem',
          lineHeight: 1.5,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#9ca3af' }}>Current Prompt Size:</span>
            <strong style={{ color: '#f43f5e' }}>~{tokenCount} tokens</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#9ca3af' }}>Local Threshold Limit:</span>
            <strong>{threshold} tokens</strong>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '4px', paddingTop: '8px', color: '#9ca3af' }}>
            Processing this query locally might be slow or hit token limits. Running via cloud-based AI (Groq) is recommended, but **your document snippets will leave this local device**.
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
          {/* Option 1: Groq Cloud */}
          <button 
            className="btn btn-primary"
            onClick={onConfirm}
            style={{ 
              width: '100%', 
              justifyContent: 'center', 
              padding: '12px', 
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)'
            }}
          >
            <CloudLightning size={16} />
            <span>Yes, route to Cloud (Groq)</span>
          </button>

          {/* Option 2: Ollama Local force */}
          <button 
            className="btn btn-cyan"
            onClick={onDecline}
            style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
          >
            <Cpu size={16} />
            <span>No, process locally (Ollama)</span>
          </button>

          {/* Option 3: Cancel */}
          <button 
            className="btn btn-secondary"
            onClick={onCancel}
            style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
          >
            <span>Cancel Query</span>
          </button>
        </div>

      </div>
    </div>
  );
}
