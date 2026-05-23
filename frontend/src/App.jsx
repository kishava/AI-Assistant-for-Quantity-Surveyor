import React, { useState, useEffect } from 'react';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('qs_token') || null);
  const [user, setUser] = useState(null);

  // Parse token on startup to restore user context
  useEffect(() => {
    if (token) {
      localStorage.setItem('qs_token', token);
      
      // Decrypt/Parse JWT locally to get username (or we can just query it, or decode payload)
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser({ id: payload.id, username: payload.username });
      } catch (e) {
        console.error('Failed to parse auth token:', e);
        handleLogout();
      }
    } else {
      localStorage.removeItem('qs_token');
      setUser(null);
    }
  }, [token]);

  const handleAuthSuccess = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('qs_token');
  };

  return (
    <div className="app-root-container">
      {token && user ? (
        <Dashboard token={token} user={user} onLogout={handleLogout} />
      ) : (
        <Login onAuthSuccess={handleAuthSuccess} />
      )}
    </div>
  );
}
