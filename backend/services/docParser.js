import fs from 'fs/promises';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import path from 'path';

/**
 * Extracts plain text from PDF, DOCX, TXT, or Markdown files.
 * 
 * @param {string} filePath - Absolute path to the file.
 * @returns {Promise<string>} - Extracted text.
 */
export async function parseDocument(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  try {
    const fileBuffer = await fs.readFile(filePath);

    if (ext === '.pdf') {
      const data = await pdfParse(fileBuffer);
      return data.text || '';
    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return result.value || '';
    } else if (ext === '.txt' || ext === '.md') {
      return fileBuffer.toString('utf-8');
    } else {
      throw new Error(`Unsupported file type: ${ext}`);
    }
  } catch (error) {
    console.error(`Error parsing document at ${filePath}:`, error);
    throw error;
  }
}
