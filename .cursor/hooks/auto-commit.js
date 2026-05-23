#!/usr/bin/env node
/**
 * Cursor stop hook — auto-commits any uncommitted changes when an agent task ends.
 * Reads stop-hook JSON from stdin (ignored). Fails open on errors.
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function run(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function hasChanges() {
  const status = run('git status --porcelain');
  return status.length > 0;
}

function quoteMessage(msg) {
  return `"${msg.replace(/"/g, '\\"')}"`;
}

try {
  // Consume stdin from the stop hook payload
  try {
    readFileSync(0, 'utf8');
  } catch {
    // stdin may be empty
  }

  if (!hasChanges()) {
    process.exit(0);
  }

  run('git add -A');

  const staged = run('git diff --cached --name-only');
  if (!staged) {
    process.exit(0);
  }

  const msg = run('node .cursor/hooks/generate-commit-msg.js');
  run(`git commit -m ${quoteMessage(msg)}`);
  process.stderr.write(`[auto-commit] ${msg}\n`);
} catch (err) {
  process.stderr.write(`[auto-commit] skipped: ${err.message}\n`);
}

process.exit(0);
