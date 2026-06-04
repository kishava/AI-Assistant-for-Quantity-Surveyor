const TOKEN_KEY = 'qs_token';

export function isGuestUsername(username) {
  return username === 'guest';
}

export function isGuestToken(token) {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.username === 'guest' || payload.id === 9999;
  } catch {
    return false;
  }
}

export function loadStoredToken() {
  const sessionToken = sessionStorage.getItem(TOKEN_KEY);
  if (sessionToken && isGuestToken(sessionToken)) {
    return sessionToken;
  }

  const localToken = localStorage.getItem(TOKEN_KEY);
  if (localToken && isGuestToken(localToken)) {
    // Legacy guest token — do not restore session; server wipes guest on startup
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    return null;
  }

  return localToken || sessionToken || null;
}

export function persistToken(token, user) {
  if (!token) return;
  if (isGuestUsername(user?.username) || isGuestToken(token)) {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(TOKEN_KEY);
  } else {
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

export async function cleanupGuestSession(token) {
  if (!token || !isGuestToken(token)) return;
  try {
    await fetch('/api/auth/guest-cleanup', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.warn('Guest cleanup failed:', err);
  }
}

/** Best-effort cleanup when the tab or window is closing. */
export function cleanupGuestOnUnload(token) {
  if (!token || !isGuestToken(token)) return;
  try {
    fetch('/api/auth/guest-cleanup', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true,
    });
  } catch {
    // ignore — tab may already be gone
  }
  clearStoredToken();
}
