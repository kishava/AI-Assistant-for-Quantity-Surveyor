import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import { getJwtSecret } from '../config.js';
import { deleteDocumentChunks } from '../services/vectorStore.js';
import paths from '../config/paths.js';
import fs from 'fs';

const router = express.Router();
const JWT_SECRET = getJwtSecret();

// Register
router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const usernameValue = typeof username === 'string' ? username.trim() : '';
  const passwordValue = typeof password === 'string' ? password : '';

  if (!usernameValue || !passwordValue) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (usernameValue.length > 80) {
    return res.status(400).json({ error: 'Username must be 80 characters or fewer' });
  }
  const usernameRegex = /^[a-zA-Z0-9_-]+$/;
  if (!usernameRegex.test(usernameValue)) {
    return res.status(400).json({ error: 'Username can only contain alphanumeric characters, underscores, and dashes.' });
  }
  if (passwordValue.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (passwordValue.length > 256) {
    return res.status(400).json({ error: 'Password must be 256 characters or fewer' });
  }

  try {
    // Check if user exists
    const checkStmt = db.prepare('SELECT id FROM users WHERE username = ?');
    const existing = checkStmt.get(usernameValue);
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(passwordValue, salt);

    // Insert user
    const insertStmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
    const result = insertStmt.run(usernameValue, passwordHash);

    // Issue Token
    const token = jwt.sign(
      { id: result.lastInsertRowid, username: usernameValue },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: { id: result.lastInsertRowid, username: usernameValue }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const usernameValue = typeof username === 'string' ? username.trim() : '';
  const passwordValue = typeof password === 'string' ? password : '';

  if (!usernameValue || !passwordValue) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (usernameValue.length > 80 || passwordValue.length > 256) {
    return res.status(400).json({ error: 'Invalid username or password' });
  }

  try {
    // Find user
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    const user = stmt.get(usernameValue);
    if (!user) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    // Check password
    const isMatch = await bcrypt.compare(passwordValue, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    // Issue Token
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      user: { id: user.id, username: user.username }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

export async function deleteUserData(userId) {
  try {
    // Find all documents for this user
    const docs = db.prepare('SELECT id, file_path FROM documents WHERE user_id = ?').all(userId);
    for (const doc of docs) {
      // Delete FTS chunks
      try {
        db.prepare('DELETE FROM chunks_fts WHERE document_id = ?').run(doc.id);
      } catch (e) {
        console.warn(`Failed to delete FTS chunks for doc ${doc.id}:`, e.message);
      }

      // Delete Chroma chunks
      try {
        await deleteDocumentChunks(doc.id);
      } catch (e) {
        console.warn(`Failed to delete Chroma chunks for doc ${doc.id}:`, e.message);
      }

      // Delete file on disk
      try {
        if (fs.existsSync(doc.file_path)) {
          fs.unlinkSync(doc.file_path);
        }
      } catch (e) {
        console.warn(`Failed to delete file ${doc.file_path}:`, e.message);
      }
    }

    // Delete documents (cascades to chunks)
    db.prepare('DELETE FROM documents WHERE user_id = ?').run(userId);
    // Delete conversations (cascades to messages)
    db.prepare('DELETE FROM conversations WHERE user_id = ?').run(userId);
    console.log(`[QS] Cleaned up guest data for user ID ${userId}`);
  } catch (err) {
    console.error(`Error during guest data cleanup for user ${userId}:`, err);
  }
}

// Guest Login
router.post('/guest', (req, res) => {
  try {
    const token = jwt.sign(
      { id: 9999, username: 'guest' },
      JWT_SECRET,
      { expiresIn: '1d' }
    );
    res.status(200).json({
      message: 'Logged in as guest',
      token,
      user: { id: 9999, username: 'guest' }
    });
  } catch (err) {
    console.error('Guest login error:', err);
    res.status(500).json({ error: 'Failed to authenticate guest' });
  }
});

// Guest Cleanup
router.post('/guest-cleanup', async (req, res) => {
  await deleteUserData(9999);
  res.status(200).json({ message: 'Guest data cleaned up' });
});

export default router;
