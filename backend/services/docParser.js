import fs from 'fs/promises';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import XLSX from 'xlsx';
import WordExtractor from 'word-extractor';
import {
  getExtension,
  IMAGE_EXTENSIONS,
  SPREADSHEET_EXTENSIONS,
  TEXT_EXTENSIONS
} from '../config/fileTypes.js';

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'llava';


async function parseImage(filePath) {
  const fileBuffer = await fs.readFile(filePath);
  const base64 = fileBuffer.toString('base64');

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_VISION_MODEL,
      prompt:
        'Extract all text visible in this construction or quantity surveying document image. ' +
        'Include numbers, measurements, item descriptions, table rows, labels, and notes. ' +
        'Output plain text only, preserving line structure where possible.',
      images: [base64],
      stream: false
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Image OCR failed (${res.status}). Ensure Ollama is running and "${OLLAMA_VISION_MODEL}" is pulled (ollama pull ${OLLAMA_VISION_MODEL}). ${errText}`
    );
  }

  const data = await res.json();
  return data.response || '';
}

function parseSpreadsheet(fileBuffer) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const parts = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const sheetText = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (sheetText.trim()) {
      parts.push(`--- Sheet: ${sheetName} ---\n${sheetText}`);
    }
  }

  return parts.join('\n\n');
}

function stripRtf(rtf) {
  return rtf
    .replace(/\\par[d]?/gi, '\n')
    .replace(/\\'[0-9a-f]{2}/gi, ' ')
    .replace(/\\[a-z]+\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\s+\n/g, '\n')
    .trim();
}

async function parseLegacyDoc(filePath) {
  const extractor = new WordExtractor();
  const doc = await extractor.extract(filePath);
  return doc.getBody() || '';
}

/**
 * Extracts plain text from QS document formats including images via Ollama vision.
 *
 * @param {string} filePath - Absolute path to the file.
 * @returns {Promise<string>} - Extracted text.
 */
export async function parseDocument(filePath) {
  const ext = getExtension(filePath);

  try {
    const fileBuffer = await fs.readFile(filePath);

    if (ext === '.pdf') {
      const data = await pdfParse(fileBuffer);
      return data.text || '';
    }

    if (ext === '.docx') {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return result.value || '';
    }

    if (ext === '.doc') {
      return await parseLegacyDoc(filePath);
    }

    if (SPREADSHEET_EXTENSIONS.has(ext)) {
      return parseSpreadsheet(fileBuffer);
    }

    if (IMAGE_EXTENSIONS.has(ext)) {
      return await parseImage(filePath);
    }

    if (ext === '.rtf') {
      return stripRtf(fileBuffer.toString('utf-8'));
    }

    if (TEXT_EXTENSIONS.has(ext)) {
      return fileBuffer.toString('utf-8');
    }

    throw new Error(`Unsupported file type: ${ext}`);
  } catch (error) {
    console.error(`Error parsing document at ${filePath}:`, error);
    throw error;
  }
}
