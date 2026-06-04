import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

import authRoutes, { deleteUserData } from './routes/auth.js';
import documentRoutes from './routes/documents.js';
import chatRoutes from './routes/chat.js';
import qsOutputsRoutes from './routes/qsOutputs.js';
import paths, { ensureDataDirs } from './config/paths.js';
import { getSystemHealth } from './services/healthCheck.js';

if (fs.existsSync(paths.envFile)) {
  dotenv.config({ path: paths.envFile });
} else {
  dotenv.config({ path: path.join(paths.projectRoot, '.env') });
}

ensureDataDirs();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '127.0.0.1';
const defaultAllowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
];
const allowedOrigins = (process.env.CORS_ORIGIN || defaultAllowedOrigins.join(','))
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

if (!allowedOrigins.includes(`http://localhost:${PORT}`)) {
  allowedOrigins.push(`http://localhost:${PORT}`);
}
if (!allowedOrigins.includes(`http://127.0.0.1:${PORT}`)) {
  allowedOrigins.push(`http://127.0.0.1:${PORT}`);
}

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again after 15 minutes.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again after 15 minutes.' }
});

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat messages. Please wait before asking more questions.' }
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many file uploads. Please try again after 15 minutes.' }
});

app.use(helmet());
app.use('/api', globalLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/chat', chatLimiter);
app.use('/api/documents/upload', uploadLimiter);

app.use(cors({
  origin(origin, callback) {
    if (!origin || 
        origin === 'null' || 
        origin.startsWith('chrome-extension://') || 
        origin.startsWith('file://') || 
        allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.error(`[CORS] Rejected origin: ${origin}`);
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/qs-outputs', qsOutputsRoutes);

app.get('/api/health', async (req, res) => {
  try {
    const health = await getSystemHealth();
    res.status(200).json(health);
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

if (paths.isProduction && fs.existsSync(paths.frontendDist)) {
  app.use(express.static(paths.frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(paths.frontendDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error occurred.'
  });
});

app.listen(PORT, HOST, () => {
  console.log(`==========================================`);
  console.log(`  QS Assistant Backend Server Starting...  `);
  console.log(`  Running on: http://${HOST}:${PORT}      `);
  console.log(`  Mode: ${paths.isProduction ? 'production' : 'development'}`);
  console.log(`  Data: ${paths.appDataDir}`);
  console.log(`==========================================`);

  // Clean up any guest data from previous runs on startup
  deleteUserData(9999).catch(err => console.error('Failed to cleanup guest data on startup:', err));
});
