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
import { isModelAvailable } from './ollamaModelHelper.js';
import Tesseract from 'tesseract.js';

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'moondream';
const OCR_MIN_CHARS = parseInt(process.env.OCR_MIN_CHARS || '40', 10);
const OCR_TIMEOUT_MS = parseInt(process.env.OCR_TIMEOUT_MS || '180000', 10);
const VISION_TIMEOUT_MS = parseInt(process.env.VISION_TIMEOUT_MS || '120000', 10);

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    }),
  ]);
}

async function runTesseract(buffer) {
  const result = await withTimeout(
    Tesseract.recognize(buffer, 'eng', {
      logger: () => {},
      tessedit_pageseg_mode: Tesseract.PSM?.SINGLE_BLOCK ?? '6',
    }),
    OCR_TIMEOUT_MS,
    'Image OCR (Tesseract)'
  );
  return (result.data?.text || '').trim();
}

async function parseImageWithOllama(buffer) {
  if (!(await isModelAvailable(OLLAMA_VISION_MODEL))) {
    throw new Error(`Vision model "${OLLAMA_VISION_MODEL}" is not installed`);
  }

  const base64 = buffer.toString('base64');

  const response = await withTimeout(
    fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_VISION_MODEL,
        stream: false,
        messages: [
          {
            role: 'user',
            content:
              'Extract all readable text from this construction document or Bill of Quantities (BOQ) image. ' +
              'Return plain text only — preserve line breaks, item numbers, quantities, and units. No commentary.',
            images: [base64],
          },
        ],
      }),
    }),
    VISION_TIMEOUT_MS,
    'Image OCR (Ollama vision)'
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      `Ollama vision (${OLLAMA_VISION_MODEL}) failed (${response.status}): ${errText || response.statusText}`
    );
  }

  const data = await response.json();
  return (data.message?.content || '').trim();
}

async function parseImage(filePath) {
  console.log(`[docParser] OCR image: ${filePath}`);
  const buffer = await fs.readFile(filePath);
  let text = '';

  try {
    text = await runTesseract(buffer);
    console.log(`[docParser] Tesseract extracted ${text.length} characters`);
  } catch (error) {
    console.warn(`[docParser] Tesseract failed: ${error.message}`);
  }

  if (text.length < OCR_MIN_CHARS) {
    console.log(`[docParser] Trying Ollama vision fallback (${OLLAMA_VISION_MODEL})…`);
    try {
      const visionText = await parseImageWithOllama(buffer);
      if (visionText.length > text.length) {
        text = visionText;
        console.log(`[docParser] Vision extracted ${text.length} characters`);
      }
    } catch (visionErr) {
      if (!text) {
        throw new Error(
          `Image text extraction failed. Tesseract and Ollama vision could not read this file. ` +
          `${visionErr.message}. For scanned BOQ images, run: ollama pull ${OLLAMA_VISION_MODEL}`
        );
      }
      console.warn(`[docParser] Vision fallback failed, using Tesseract output: ${visionErr.message}`);
    }
  }

  if (!text) {
    throw new Error(
      'No text could be extracted from this image. Try a clearer scan, higher resolution, or a PDF export.'
    );
  }

  return text;
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
 * Extracts plain text from QS document formats including images via OCR + Ollama vision.
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
