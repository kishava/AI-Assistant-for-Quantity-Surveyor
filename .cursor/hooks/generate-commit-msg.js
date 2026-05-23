#!/usr/bin/env node
/**
 * Generates a conventional commit message from staged or unstaged changes.
 * Usage: node .cursor/hooks/generate-commit-msg.js
 * Prints one line to stdout — the commit message only.
 */

import { execSync } from 'child_process';
import path from 'path';

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function basename(filePath) {
  return path.basename(filePath.replace(/\\/g, '/'));
}

function stem(filePath) {
  const base = basename(filePath);
  return base.replace(/\.[^.]+$/, '');
}

function prefixForFiles(files) {
  const joined = files.join(' ').toLowerCase();
  if (/fix|bug|error|validation|auth/.test(joined)) return 'fix';
  if (/\.css$|\.scss$|style|ui|component/.test(joined) && !/\.js$|\.jsx$/.test(joined)) return 'style';
  if (/readme|\.md$|docs\//.test(joined)) return 'docs';
  if (/\.cursor\/|commit\.bat|hooks\.json|gitignore/.test(joined)) return 'chore';
  return 'feat';
}

function describeChange(files) {
  const normalized = files.map((f) => f.replace(/\\/g, '/'));

  if (normalized.length === 1) {
    const file = normalized[0];
    const name = stem(file);
    if (file.includes('backend/routes/')) return `update ${name} route`;
    if (file.includes('backend/services/')) return `update ${name} service`;
    if (file.includes('frontend/src/components/')) return `update ${name} component`;
    if (file.includes('frontend/src/pages/')) return `update ${name} page`;
    return `update ${name}`;
  }

  const areas = new Set();
  for (const file of normalized) {
    if (file.startsWith('backend/')) areas.add('backend');
    if (file.startsWith('frontend/')) areas.add('frontend');
    if (file.startsWith('.cursor/')) areas.add('agent hooks');
    if (file.endsWith('.md')) areas.add('docs');
  }

  if (areas.size === 1) {
    return `update ${[...areas][0]}`;
  }

  const names = normalized.slice(0, 3).map(stem).join(', ');
  const suffix = normalized.length > 3 ? ' and others' : '';
  return `update ${names}${suffix}`;
}

try {
  let files = [];
  try {
    files = run('git diff --cached --name-only').split('\n').filter(Boolean);
  } catch {
    // no staged files
  }

  if (files.length === 0) {
    files = run('git status --porcelain')
      .split('\n')
      .filter(Boolean)
      .map((line) => line.slice(3).trim());
  }

  if (files.length === 0) {
    process.stdout.write('chore: save work in progress');
    process.exit(0);
  }

  const prefix = prefixForFiles(files);
  const description = describeChange(files);
  process.stdout.write(`${prefix}: ${description}`);
} catch {
  process.stdout.write('chore: auto-commit task changes');
}
