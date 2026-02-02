import React from 'react';
import { Box, Text } from 'ink';

type Status = 'input' | 'loading' | 'ready' | 'error';

interface StatusBarProps {
  status: Status;
  url: string | null;
  error: string | null;
  docCount: number;
  mdSupported: boolean;
}

export function StatusBar({ status, url, error, docCount, mdSupported }: StatusBarProps) {
  const getStatusDisplay = () => {
    switch (status) {
      case 'input':
        return <Text color="yellow">Press Enter or 'a' to add a documentation site</Text>;
      case 'loading':
        return <Text color="cyan">Loading sitemap...</Text>;
      case 'ready':
        return (
          <Text>
            <Text color="green">Ready</Text>
            <Text dimColor> | </Text>
            <Text>{docCount} docs</Text>
            <Text dimColor> | </Text>
            <Text color={mdSupported ? 'green' : 'yellow'}>
              MD: {mdSupported ? 'Yes' : 'No'}
            </Text>
          </Text>
        );
      case 'error':
        return <Text color="red">Error: {error}</Text>;
    }
  };

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      height={3}
      justifyContent="space-between"
    >
      <Box>
        {getStatusDisplay()}
      </Box>
      {url && status === 'ready' && (
        <Box>
          <Text dimColor>{url.length > 40 ? url.slice(0, 37) + '...' : url}</Text>
        </Box>
      )}
      <Box>
        <Text dimColor>ESC: quit | TAB: switch | a: add | d: delete</Text>
      </Box>
    </Box>
  );
}
