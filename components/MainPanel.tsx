import React from 'react';
import { Box, Text } from 'ink';
import { parseMarkdownToLines, type RenderedLine } from '../lib/markdown.js';

interface MainPanelProps {
  content: string | null;
  isLoading: boolean;
  scrollOffset: number;
  isFocused: boolean;
  height: number;
}

function renderLine(line: RenderedLine, index: number): React.ReactNode {
  const indent = line.indent ? '  '.repeat(line.indent) : '';

  switch (line.style) {
    case 'heading1':
      return (
        <Text key={index} bold color="cyan">
          {'\n'}# {line.text}{'\n'}
        </Text>
      );
    case 'heading2':
      return (
        <Text key={index} bold color="green">
          {'\n'}## {line.text}{'\n'}
        </Text>
      );
    case 'heading3':
      return (
        <Text key={index} bold color="yellow">
          ### {line.text}
        </Text>
      );
    case 'codeBlock':
      return (
        <Text key={index} color="gray">
          {line.text}
        </Text>
      );
    case 'blockquote':
      return (
        <Text key={index} color="magenta">
          {indent}| {line.text}
        </Text>
      );
    case 'listItem':
      return (
        <Text key={index}>
          {indent}{line.text}
        </Text>
      );
    case 'tableHeader':
      return (
        <Text key={index} bold color="cyan">
          {line.text}
        </Text>
      );
    case 'tableSeparator':
      return (
        <Text key={index} dimColor>
          {line.text}
        </Text>
      );
    case 'tableRow':
      return (
        <Text key={index}>
          {line.text}
        </Text>
      );
    default:
      return (
        <Text key={index}>
          {line.text}
        </Text>
      );
  }
}

export function MainPanel({
  content,
  isLoading,
  scrollOffset,
  isFocused,
  height,
}: MainPanelProps) {
  const maxLines = height - 4; // Account for borders and padding

  let lines: RenderedLine[] = [];
  let totalLines = 0;

  if (content) {
    lines = parseMarkdownToLines(content);
    totalLines = lines.length;
    lines = lines.slice(scrollOffset, scrollOffset + maxLines);
  }

  return (
    <Box
      flexGrow={1}
      flexDirection="column"
      borderStyle="single"
      borderColor={isFocused ? 'cyan' : 'gray'}
      paddingX={1}
      overflow="hidden"
    >
      <Box justifyContent="space-between">
        <Text bold color="green">
          Document
        </Text>
        {totalLines > maxLines && (
          <Text dimColor>
            [{scrollOffset + 1}-{Math.min(scrollOffset + maxLines, totalLines)}/{totalLines}]
          </Text>
        )}
      </Box>
      <Box flexDirection="column" marginTop={1} overflow="hidden">
        {isLoading ? (
          <Text color="yellow">Loading document...</Text>
        ) : content ? (
          lines.map((line, index) => renderLine(line, index))
        ) : (
          <Box flexDirection="column">
            <Text dimColor>No document selected</Text>
            <Text dimColor>{'\n'}Use arrow keys to navigate the sidebar</Text>
            <Text dimColor>Press Enter to select a document</Text>
            <Text dimColor>Press Tab to switch between panels</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export function getContentLineCount(content: string | null): number {
  if (!content) return 0;
  return parseMarkdownToLines(content).length;
}
