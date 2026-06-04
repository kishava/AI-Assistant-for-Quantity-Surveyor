import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';

function getAppDataDir() {
  if (process.env.QS_AI_DATA_DIR) {
    return process.env.QS_AI_DATA_DIR;
  }
  const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(base, 'QS-AI');
}

export const paths = {
  isProduction,
  projectRoot: path.resolve(__dirname, '..'),
  repoRoot: path.resolve(__dirname, '../..'),
  appDataDir: getAppDataDir(),
  get databaseFile() {
    if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('./')) {
      return process.env.DATABASE_URL;
    }
    if (isProduction || process.env.USE_APPDATA === 'true') {
      return path.join(this.appDataDir, 'qs_ai.db');
    }
    return path.join(this.projectRoot, process.env.DATABASE_URL || 'qs_ai.db');
  },
  get uploadsDir() {
    if (isProduction || process.env.USE_APPDATA === 'true') {
      return path.join(this.appDataDir, 'uploads');
    }
    return path.join(this.projectRoot, 'uploads');
  },
  get frontendDist() {
    const bundled = path.join(this.projectRoot, 'frontend-dist');
    if (fs.existsSync(bundled)) return bundled;
    return path.join(this.repoRoot, 'frontend', 'dist');
  },
  get envFile() {
    if (isProduction || process.env.USE_APPDATA === 'true') {
      return path.join(this.appDataDir, '.env');
    }
    return path.join(this.projectRoot, '.env');
  },
};

export function ensureDataDirs() {
  fs.mkdirSync(paths.appDataDir, { recursive: true });
  fs.mkdirSync(paths.uploadsDir, { recursive: true });
}

export default paths;
