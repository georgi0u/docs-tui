import { getMdUrl } from './sitemap.js';

export async function fetchMarkdown(url: string): Promise<string> {
  // Try the .md version first
  const mdUrl = getMdUrl(url);

  try {
    const response = await fetch(mdUrl);
    if (response.ok) {
      const text = await response.text();
      // Basic validation that it looks like markdown
      if (text.includes('#') || text.includes('*') || text.includes('[')) {
        return text;
      }
    }
  } catch {
    // Fall through to try original URL
  }

  // Try the original URL
  try {
    const response = await fetch(url);
    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('text/markdown') || contentType.includes('text/plain')) {
        return await response.text();
      }

      // If it's HTML, we could try to extract content, but for now just return a message
      if (contentType.includes('text/html')) {
        return `# Unable to fetch markdown\n\nThe URL returned HTML content. Markdown source may not be available for this page.\n\nURL: ${url}`;
      }

      return await response.text();
    }
  } catch (error) {
    throw new Error(`Failed to fetch document: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  throw new Error(`Failed to fetch document from ${url}`);
}

export type LineStyle = 'heading1' | 'heading2' | 'heading3' | 'code' | 'codeBlock' | 'bold' | 'italic' | 'link' | 'listItem' | 'blockquote' | 'normal' | 'tableHeader' | 'tableSeparator' | 'tableRow';

export type TableAlignment = 'left' | 'center' | 'right';

export interface TableCell {
  content: string;
  width: number;
  alignment: TableAlignment;
}

export interface RenderedLine {
  text: string;
  style?: LineStyle;
  indent?: number;
  // Table-specific data
  tableCells?: TableCell[];
  isTableHeader?: boolean;
}

// Helper to check if a line is a table row
function isTableRow(line: string): boolean {
  return line.trim().startsWith('|') && line.trim().endsWith('|');
}

// Helper to check if a line is a table separator (|---|---|)
function isTableSeparator(line: string): boolean {
  if (!isTableRow(line)) return false;
  const content = line.trim().slice(1, -1); // Remove outer pipes
  return /^[\s|:\-]+$/.test(content) && content.includes('-');
}

// Parse alignment from separator row
function parseAlignments(separatorLine: string): TableAlignment[] {
  const cells = separatorLine.trim().slice(1, -1).split('|');
  return cells.map(cell => {
    const trimmed = cell.trim();
    const leftColon = trimmed.startsWith(':');
    const rightColon = trimmed.endsWith(':');
    if (leftColon && rightColon) return 'center';
    if (rightColon) return 'right';
    return 'left';
  });
}

// Parse cells from a table row
function parseTableCells(line: string): string[] {
  // Remove outer pipes and split
  const content = line.trim().slice(1, -1);
  return content.split('|').map(cell => cell.trim());
}

// Strip inline markdown formatting
function stripInlineFormatting(text: string): string {
  let result = text;
  result = result.replace(/`([^`]+)`/g, '$1');
  result = result.replace(/\*\*([^*]+)\*\*/g, '$1');
  result = result.replace(/__([^_]+)__/g, '$1');
  result = result.replace(/\*([^*]+)\*/g, '$1');
  result = result.replace(/_([^_]+)_/g, '$1');
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, '[img]');
  return result;
}

// Maximum width for any column
const MAX_COLUMN_WIDTH = 25;
const MIN_COLUMN_WIDTH = 3;

// Wrap text to fit within a given width, breaking at word boundaries when possible
function wrapText(text: string, width: number): string[] {
  if (text.length <= width) return [text];

  const lines: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= width) {
      lines.push(remaining);
      break;
    }

    // Try to break at a space
    let breakPoint = remaining.lastIndexOf(' ', width);
    if (breakPoint <= 0) {
      // No space found, force break at width
      breakPoint = width;
    }

    lines.push(remaining.slice(0, breakPoint).trimEnd());
    remaining = remaining.slice(breakPoint).trimStart();
  }

  return lines;
}

// Process a complete table and return rendered lines
function processTable(tableLines: string[]): RenderedLine[] {
  const result: RenderedLine[] = [];

  if (tableLines.length < 2) return result;

  // Find separator row
  let separatorIndex = -1;
  for (let i = 0; i < tableLines.length; i++) {
    if (isTableSeparator(tableLines[i])) {
      separatorIndex = i;
      break;
    }
  }

  if (separatorIndex === -1) {
    // No valid separator, treat as regular text
    return tableLines.map(line => ({ text: line, style: 'normal' as LineStyle }));
  }

  // Parse alignments from separator
  const alignments = parseAlignments(tableLines[separatorIndex]);

  // Parse all rows
  const allRows: string[][] = [];
  const rowIsHeader: boolean[] = [];
  for (let i = 0; i < tableLines.length; i++) {
    if (i === separatorIndex) continue;
    const cells = parseTableCells(tableLines[i]).map(stripInlineFormatting);
    allRows.push(cells);
    rowIsHeader.push(i < separatorIndex);
  }

  // Calculate column widths - use natural width up to MAX_COLUMN_WIDTH
  const colWidths: number[] = [];
  for (const row of allRows) {
    for (let i = 0; i < row.length; i++) {
      const naturalWidth = row[i].length;
      colWidths[i] = Math.max(colWidths[i] || 0, Math.min(naturalWidth, MAX_COLUMN_WIDTH));
    }
  }

  // Ensure minimum column width
  for (let i = 0; i < colWidths.length; i++) {
    colWidths[i] = Math.max(colWidths[i] || MIN_COLUMN_WIDTH, MIN_COLUMN_WIDTH);
  }

  // Build table borders
  const topBorder = '┌' + colWidths.map(w => '─'.repeat(w + 2)).join('┬') + '┐';
  const middleBorder = '├' + colWidths.map(w => '─'.repeat(w + 2)).join('┼') + '┤';
  const bottomBorder = '└' + colWidths.map(w => '─'.repeat(w + 2)).join('┴') + '┘';

  // Add top border
  result.push({ text: topBorder, style: 'tableSeparator' });

  let headerDone = false;

  // Process each row with text wrapping
  for (let rowIndex = 0; rowIndex < allRows.length; rowIndex++) {
    const cells = allRows[rowIndex];
    const isHeader = rowIsHeader[rowIndex];

    // Wrap each cell's content
    const wrappedCells: string[][] = cells.map((cell, colIndex) => {
      return wrapText(cell, colWidths[colIndex] || MAX_COLUMN_WIDTH);
    });

    // Find the maximum number of lines needed for this row
    const maxLines = Math.max(...wrappedCells.map(w => w.length), 1);

    // Generate a line for each wrapped line
    for (let lineNum = 0; lineNum < maxLines; lineNum++) {
      const rowText = formatWrappedTableRow(wrappedCells, lineNum, colWidths, alignments);
      const style: LineStyle = isHeader ? 'tableHeader' : 'tableRow';

      result.push({
        text: rowText,
        style,
        isTableHeader: isHeader,
      });
    }

    // Add separator after header rows
    if (isHeader && (rowIndex + 1 >= allRows.length || !rowIsHeader[rowIndex + 1])) {
      if (!headerDone) {
        result.push({ text: middleBorder, style: 'tableSeparator' });
        headerDone = true;
      }
    }
  }

  // Add bottom border
  result.push({ text: bottomBorder, style: 'tableSeparator' });

  return result;
}

// Format a table row from wrapped cell content
function formatWrappedTableRow(
  wrappedCells: string[][],
  lineNum: number,
  widths: number[],
  alignments: TableAlignment[]
): string {
  const formattedCells = wrappedCells.map((cellLines, i) => {
    const content = cellLines[lineNum] || '';
    const width = widths[i] || content.length;
    const align = alignments[i] || 'left';
    return alignText(content, width, align);
  });
  return '│ ' + formattedCells.join(' │ ') + ' │';
}

// Align text within a given width
function alignText(text: string, width: number, alignment: TableAlignment): string {
  const padding = width - text.length;
  if (padding <= 0) return text.slice(0, width);

  switch (alignment) {
    case 'right':
      return ' '.repeat(padding) + text;
    case 'center':
      const left = Math.floor(padding / 2);
      const right = padding - left;
      return ' '.repeat(left) + text + ' '.repeat(right);
    default:
      return text + ' '.repeat(padding);
  }
}

export function parseMarkdownToLines(markdown: string): RenderedLine[] {
  const lines: RenderedLine[] = [];
  const rawLines = markdown.split('\n');

  let inCodeBlock = false;
  let codeBlockLang = '';
  let tableBuffer: string[] = [];

  for (let lineIndex = 0; lineIndex < rawLines.length; lineIndex++) {
    const line = rawLines[lineIndex];
    // Handle code blocks
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
        if (codeBlockLang) {
          lines.push({ text: `[${codeBlockLang}]`, style: 'codeBlock' });
        }
      } else {
        inCodeBlock = false;
        codeBlockLang = '';
        lines.push({ text: '', style: 'normal' });
      }
      continue;
    }

    if (inCodeBlock) {
      lines.push({ text: '  ' + line, style: 'codeBlock' });
      continue;
    }

    // Handle tables
    if (isTableRow(line)) {
      tableBuffer.push(line);
      continue;
    } else if (tableBuffer.length > 0) {
      // End of table, process the buffer
      const tableLines = processTable(tableBuffer);
      lines.push(...tableLines);
      tableBuffer = [];
    }

    // Handle headings
    if (line.startsWith('# ')) {
      lines.push({ text: line.slice(2), style: 'heading1' });
      continue;
    }
    if (line.startsWith('## ')) {
      lines.push({ text: line.slice(3), style: 'heading2' });
      continue;
    }
    if (line.startsWith('### ')) {
      lines.push({ text: line.slice(4), style: 'heading3' });
      continue;
    }
    if (line.startsWith('#### ')) {
      lines.push({ text: line.slice(5), style: 'heading3' });
      continue;
    }

    // Handle blockquotes
    if (line.startsWith('> ')) {
      lines.push({ text: line.slice(2), style: 'blockquote', indent: 2 });
      continue;
    }

    // Handle list items
    if (line.match(/^[\s]*[-*+]\s/)) {
      const match = line.match(/^([\s]*)[-*+]\s(.*)$/);
      if (match) {
        const indent = Math.floor(match[1].length / 2);
        lines.push({ text: '• ' + match[2], style: 'listItem', indent });
      }
      continue;
    }

    // Handle numbered lists
    if (line.match(/^[\s]*\d+\.\s/)) {
      const match = line.match(/^([\s]*)(\d+)\.\s(.*)$/);
      if (match) {
        const indent = Math.floor(match[1].length / 2);
        lines.push({ text: match[2] + '. ' + match[3], style: 'listItem', indent });
      }
      continue;
    }

    // Handle horizontal rules
    if (line.match(/^[-*_]{3,}$/)) {
      lines.push({ text: '─'.repeat(40), style: 'normal' });
      continue;
    }

    // Regular text - strip inline formatting for terminal display
    let text = line;
    // Remove inline code backticks (keep content)
    text = text.replace(/`([^`]+)`/g, '$1');
    // Remove bold
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    text = text.replace(/__([^_]+)__/g, '$1');
    // Remove italic
    text = text.replace(/\*([^*]+)\*/g, '$1');
    text = text.replace(/_([^_]+)_/g, '$1');
    // Convert links to text [text](url) -> text
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    // Remove images
    text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '[image: $1]');

    lines.push({ text, style: 'normal' });
  }

  // Flush any remaining table buffer
  if (tableBuffer.length > 0) {
    const tableLines = processTable(tableBuffer);
    lines.push(...tableLines);
  }

  return lines;
}
