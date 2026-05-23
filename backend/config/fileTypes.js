/** QS-relevant file types accepted for upload and parsing */

export const ALLOWED_EXTENSIONS = [
  // Documents
  '.pdf', '.docx', '.doc', '.txt', '.md', '.rtf', '.csv',
  // Spreadsheets (BOQ, cost plans)
  '.xlsx', '.xls',
  // Images (site photos, scanned BOQ, drawings)
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tif', '.tiff'
];

export const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tif', '.tiff'
]);

export const SPREADSHEET_EXTENSIONS = new Set(['.xlsx', '.xls']);

export const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv']);

export const ACCEPT_ATTRIBUTE =
  '.pdf,.docx,.doc,.txt,.md,.rtf,.csv,.xlsx,.xls,' +
  '.png,.jpg,.jpeg,.gif,.webp,.bmp,.tif,.tiff,' +
  'image/*';

export const SUPPORTED_FORMATS_LABEL =
  'PDF, Word, Excel, CSV, RTF, TXT, and images (PNG, JPG, WEBP, TIFF, etc.)';

export function isAllowedExtension(filename) {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

export function getExtension(filePath) {
  return filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
}
