import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import documentRoutes from './routes/documents.js';
import chatRoutes from './routes/chat.js';
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

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/chat', chatRoutes);

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
});
