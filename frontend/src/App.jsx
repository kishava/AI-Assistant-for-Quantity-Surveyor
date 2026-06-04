import React, { useState, useEffect, useRef, useCallback } from 'react';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import {
  loadStoredToken,
  persistToken,
  clearStoredToken,
  cleanupGuestSession,
  cleanupGuestOnUnload,
  isGuestUsername,
  isGuestToken,
} from './utils/guestSession.js';

export default function App() {
  const [token, setToken] = useState(loadStoredToken);
  const [user, setUser] = useState(null);
  const tokenRef = useRef(token);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const nextUser = { id: payload.id, username: payload.username };
        setUser(nextUser);
        persistToken(token, nextUser);
      } catch (e) {
        console.error('Failed to parse auth token:', e);
        setToken(null);
        setUser(null);
        clearStoredToken();
      }
    } else {
      setUser(null);
      clearStoredToken();
    }
  }, [token]);

  const handleAuthSuccess = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    persistToken(newToken, newUser);
  };

  const handleLogout = useCallback(async () => {
    const currentToken = tokenRef.current;
    if (currentToken && (isGuestUsername(user?.username) || isGuestToken(currentToken))) {
      await cleanupGuestSession(currentToken);
    }
    setToken(null);
    setUser(null);
    clearStoredToken();
  }, [user?.username]);

  useEffect(() => {
    const onPageHide = () => {
      const currentToken = tokenRef.current;
      if (currentToken && isGuestToken(currentToken)) {
        cleanupGuestOnUnload(currentToken);
        setToken(null);
        setUser(null);
      }
    };

    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

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
