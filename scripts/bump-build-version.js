/**
 * Bump semver patch across all package.json files (called at start of dist).
 * Usage: node scripts/bump-build-version.js bump | current
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const PACKAGE_PATHS = [
  'package.json',
  'desktop/package.json',
  'backend/package.json',
  'frontend/package.json',
];

function readDesktopVersion() {
  const raw = fs.readFileSync(path.join(root, 'desktop/package.json'), 'utf8');
  return JSON.parse(raw).version || '1.0.0';
}

function bumpPatch(version) {
  const parts = String(version).trim().split('.').map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  return parts.join('.');
}

function writeVersion(version) {
  for (const rel of PACKAGE_PATHS) {
    const filePath = path.join(root, rel);
    if (!fs.existsSync(filePath)) continue;
    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    json.version = version;
    fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`);
  }
}

const cmd = process.argv[2];

if (cmd === 'current') {
  process.stdout.write(readDesktopVersion());
} else if (cmd === 'bump') {
  const next = bumpPatch(readDesktopVersion());
  writeVersion(next);
  process.stdout.write(next);
} else {
  console.error('Usage: node scripts/bump-build-version.js bump|current');
  process.exit(1);
}
