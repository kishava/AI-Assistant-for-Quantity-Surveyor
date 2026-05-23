import React, { useState } from 'react';
import { Lock, User, HardDrive, Cpu } from 'lucide-react';

export default function Login({ onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!username.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }

    if (!isLogin) {
      if (username.trim().length > 80) {
        setError('Username must be 80 characters or fewer.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      if (password.length > 256) {
        setError('Password must be 256 characters or fewer.');
        return;
      }
    }

    setLoading(true);
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed. Please try again.');
      }

      onAuthSuccess(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card glass-panel animate-fade-in">
        
        {/* Branding Title */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <HardDrive size={28} className="text-cyan" style={{ color: '#06b6d4' }} />
            <Cpu size={24} className="text-indigo" style={{ color: '#6366f1' }} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.5px' }}>
            QS Assistant
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '4px' }}>
            Offline-First AI Document Intelligence
          </p>
        </div>

        {/* Tab Selection */}
        <div className="auth-tabs">
          <div 
            className={`auth-tab ${isLogin ? 'active' : ''}`}
            onClick={() => { setIsLogin(true); setError(''); }}
          >
            Sign In
          </div>
          <div 
            className={`auth-tab ${!isLogin ? 'active' : ''}`}
            onClick={() => { setIsLogin(false); setError(''); }}
          >
            Register
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div style={{
            background: 'rgba(244, 63, 94, 0.1)',
            border: '1px solid rgba(244, 63, 94, 0.2)',
            color: '#f43f5e',
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '0.85rem',
            marginBottom: '16px',
            textAlign: 'center'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Username */}
          <div className="form-group">
            <label>Username</label>
            <div style={{ position: 'relative' }}>
              <User size={18} style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#6b7280'
              }} />
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: '40px' }}
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="form-group">
            <label>Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#6b7280'
              }} />
              <input
                type="password"
                className="form-input"
                style={{ paddingLeft: '40px' }}
                placeholder={isLogin ? '••••••••' : 'Min. 8 characters'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                minLength={isLogin ? undefined : 8}
                required
              />
            </div>
            {!isLogin && (
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '6px' }}>
                Use at least 8 characters
              </p>
            )}
          </div>

          {/* Submit */}
          <button 
            type="submit" 
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '8px', height: '42px' }}
            disabled={loading}
          >
            {loading ? (
              <span className="pulse-dots">
                <span></span>
                <span></span>
                <span></span>
              </span>
            ) : (
              isLogin ? 'Sign In' : 'Create Account'
            )}
          </button>
        </form>

      </div>
    </div>
  );
}
