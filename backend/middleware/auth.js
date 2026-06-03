import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config.js';
import db from '../db.js';

const JWT_SECRET = getJwtSecret();

export default function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Format is Authorization: Bearer [token]' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Verify user exists in the database
    const stmt = db.prepare('SELECT id, username FROM users WHERE id = ?');
    const user = stmt.get(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User account no longer exists' });
    }

    req.user = user; // { id, username }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
