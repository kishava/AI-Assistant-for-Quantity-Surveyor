import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import { getJwtSecret } from '../config.js';

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
  if (passwordValue.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
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

export default router;
