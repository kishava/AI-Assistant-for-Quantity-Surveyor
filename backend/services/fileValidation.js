import fs from 'fs/promises';
import {
  ALLOWED_EXTENSIONS,
  getExtension,
  IMAGE_EXTENSIONS,
  SPREADSHEET_EXTENSIONS
} from '../config/fileTypes.js';

const IMAGE_SIGNATURES = [
  { ext: '.png', check: (b, a) => b[0] === 0x89 && a.startsWith('\x89PNG') },
  { ext: '.jpg', check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.jpeg', check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.gif', check: (b, a) => a.startsWith('GIF87') || a.startsWith('GIF89') },
  { ext: '.webp', check: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.length >= 12 && b.toString('ascii', 8, 12) === 'WEBP' },
  { ext: '.bmp', check: (b, a) => a.startsWith('BM') },
  { ext: '.tif', check: (b, a) => a.startsWith('II') || a.startsWith('MM') },
  { ext: '.tiff', check: (b, a) => a.startsWith('II') || a.startsWith('MM') }
];

function matchesImageSignature(buffer, asciiHeader) {
  return IMAGE_SIGNATURES.some(({ check }) => check(buffer, asciiHeader));
}

/**
 * Validates uploaded file content matches its declared extension.
 */
export async function validateUploadedFile(file) {
  const ext = getExtension(file.originalname);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return false;
  }

  const handle = await fs.open(file.path, 'r');
  try {
    const { buffer } = await handle.read(Buffer.alloc(12), 0, 12, 0);
    const header = buffer.toString('hex');
    const asciiHeader = buffer.toString('ascii');

    if (ext === '.pdf') {
      return asciiHeader.startsWith('%PDF-');
    }
    if (ext === '.docx' || ext === '.xlsx') {
      return asciiHeader.startsWith('PK');
    }
    if (ext === '.doc' || ext === '.xls') {
      return header.startsWith('d0cf11e0');
    }
    if (ext === '.webp') {
      return asciiHeader.startsWith('RIFF') && buffer.length >= 12 && buffer.toString('ascii', 8, 12) === 'WEBP';
    }
    if (IMAGE_EXTENSIONS.has(ext)) {
      return matchesImageSignature(buffer, asciiHeader);
    }
    if (ext === '.rtf') {
      return asciiHeader.startsWith('{\\rtf');
    }
    if (['.txt', '.md', '.csv'].includes(ext)) {
      return !header.startsWith('4d5a') && !header.startsWith('7f454c46');
    }
    return true;
  } finally {
    await handle.close();
  }
}

export { ALLOWED_EXTENSIONS, getExtension, IMAGE_EXTENSIONS, SPREADSHEET_EXTENSIONS };
