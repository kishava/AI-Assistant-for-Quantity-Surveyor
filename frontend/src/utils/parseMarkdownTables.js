/**
 * Split markdown content into text blocks and pipe tables for rich rendering.
 */
export function parseMarkdownBlocks(content) {
  if (!content) return [];

  const lines = content.split('\n');
  const blocks = [];
  let i = 0;
  let textBuffer = [];

  const flushText = () => {
    if (textBuffer.length > 0) {
      blocks.push({ type: 'text', content: textBuffer.join('\n') });
      textBuffer = [];
    }
  };

  const isTableRow = (line) => {
    const t = line.trim();
    return t.startsWith('|') && t.endsWith('|') && t.length > 2;
  };

  const isSeparatorRow = (line) => /^\|[\s\-:|]+\|$/.test(line.trim());

  while (i < lines.length) {
    if (isTableRow(lines[i])) {
      flushText();
      const tableLines = [];
      while (i < lines.length && isTableRow(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      if (tableLines.length >= 1) {
        const headerLine = tableLines[0];
        let dataStart = 1;
        if (tableLines.length > 1 && isSeparatorRow(tableLines[1])) {
          dataStart = 2;
        }
        const parseRow = (line) =>
          line
            .trim()
            .slice(1, -1)
            .split('|')
            .map((c) => c.trim());

        blocks.push({
          type: 'table',
          columns: parseRow(headerLine),
          rows: tableLines.slice(dataStart).map(parseRow),
        });
      }
      continue;
    }
    textBuffer.push(lines[i]);
    i++;
  }

  flushText();
  return blocks;
}
