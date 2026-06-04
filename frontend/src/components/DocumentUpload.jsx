import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UploadCloud, FileText, Trash2, Clock, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import DocumentChat from './DocumentChat.jsx';
import { ACCEPT_ATTRIBUTE, SUPPORTED_FORMATS_LABEL } from '../config/fileTypes.js';

export default function DocumentUpload({ token, user }) {
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  
  const fileInputRef = useRef(null);

  // Fetch document list
  const fetchDocuments = useCallback(async () => {
    try {
      const response = await fetch('/api/documents', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setDocuments(data);
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  }, [token]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Set up polling if any document is in 'processing' status
  useEffect(() => {
    const hasProcessing = documents.some(doc => doc.status === 'processing');
    if (hasProcessing) {
      const timer = setInterval(() => {
        fetchDocuments();
      }, 3000); // Poll every 3 seconds

      return () => clearInterval(timer);
    }
  }, [documents, fetchDocuments]);

  // Handle file upload
  const uploadFile = async (file) => {
    setError('');
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload document');
      }

      // Add to state immediately as processing
      setDocuments(prev => [data.document, ...prev]);

    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  // Drag handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      uploadFile(e.target.files[0]);
    }
  };

  const handleReprocess = async (docId) => {
    try {
      const response = await fetch(`/api/documents/${docId}/reprocess`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to reprocess document');
      setDocuments(prev => prev.map(d => d.id === docId ? { ...d, status: 'processing', error_message: null } : d));
      fetchDocuments();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this document? All associated search indexes will be removed.')) {
      return;
    }

    try {
      const response = await fetch(`/api/documents/${docId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete document');
      }

      // Remove from list
      setDocuments(prev => prev.filter(doc => doc.id !== docId));
    } catch (err) {
      setError(err.message);
    }
  };

  // Helper to format file size
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Get status components
  const renderStatus = (status, errorMsg) => {
    switch (status) {
      case 'processing':
        return (
          <span className="badge badge-processing">
            <Clock size={12} style={{ marginRight: '4px' }} />
            Processing
          </span>
        );
      case 'ready':
        return (
          <span className="badge badge-ready">
            <CheckCircle size={12} style={{ marginRight: '4px' }} />
            Ready for query
          </span>
        );
      case 'failed':
        return (
          <span className="badge badge-failed" title={errorMsg || 'Unknown parsing error'}>
            <AlertCircle size={12} style={{ marginRight: '4px' }} />
            Failed
          </span>
        );
      default:
        return status;
    }
  };

  if (selectedDoc) {
    return (
      <DocumentChat
        document={selectedDoc}
        token={token}
        user={user}
        onBack={() => setSelectedDoc(null)}
      />
    );
  }

  return (
    <div className="document-panel">
      {/* Header Info */}
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '6px' }}>Document Library</h2>
        <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
          Upload QS documents, spreadsheets, or site photos. Files are parsed and indexed locally for semantic search.
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div style={{
          background: 'rgba(244, 63, 94, 0.1)',
          border: '1px solid rgba(244, 63, 94, 0.2)',
          color: '#f43f5e',
          padding: '12px 16px',
          borderRadius: '8px',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Drop Zone Area */}
      <div 
        className={`dropzone ${dragActive ? 'active' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current.click()}
      >
        <input 
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={handleFileInputChange}
          accept={ACCEPT_ATTRIBUTE}
          disabled={uploading}
        />
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <UploadCloud size={40} style={{ color: '#06b6d4' }} />
          <div>
            <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>
              {uploading ? 'Uploading and indexing file...' : 'Drag & drop document here, or click to browse'}
            </p>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>
              Supports {SUPPORTED_FORMATS_LABEL}
            </p>
          </div>
          {uploading && (
            <div className="pulse-dots" style={{ marginTop: '8px' }}>
              <span></span>
              <span></span>
              <span></span>
            </div>
          )}
        </div>
      </div>

      {/* Uploaded Documents List */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={18} />
          <span>Uploaded Files ({documents.length})</span>
        </h3>

        {documents.length === 0 ? (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: '#6b7280',
            fontSize: '0.85rem'
          }}>
            No documents uploaded yet. Add files above to construct your local RAG knowledge base.
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="doc-table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Size</th>
                  <th>Status</th>
                  <th>Uploaded At</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr
                    key={doc.id}
                    className={`animate-fade-in${doc.status === 'ready' ? ' doc-row-clickable' : ''}`}
                    onClick={() => {
                      if (doc.status === 'ready') setSelectedDoc(doc);
                    }}
                  >
                    <td style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileText size={16} style={{ color: '#9ca3af' }} />
                      {doc.filename}
                    </td>
                    <td>{formatBytes(doc.file_size)}</td>
                    <td>{renderStatus(doc.status, doc.error_message)}</td>
                    <td>{new Date(doc.created_at).toLocaleDateString()}</td>
                    <td style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                      {(doc.status === 'ready' || doc.status === 'failed') && (
                        <button
                          className="btn btn-secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReprocess(doc.id);
                          }}
                          style={{ padding: '6px' }}
                          title="Re-extract text and rebuild search index"
                        >
                          <RefreshCw size={14} />
                        </button>
                      )}
                      <button
                        className="btn btn-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(doc.id);
                        }}
                        style={{ padding: '6px' }}
                        title="Delete Document"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
