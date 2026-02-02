import React from 'react';
import { Box, Text } from 'ink';

export interface Site {
  url: string;
  name: string;
  status: 'loading' | 'ready' | 'error';
  error?: string;
}

interface SitesListProps {
  sites: Site[];
  selectedIndex: number;
  isFocused: boolean;
  isAddingUrl: boolean;
  newUrlInput: string;
  height: number;
}

export function SitesList({
  sites,
  selectedIndex,
  isFocused,
  isAddingUrl,
  newUrlInput,
  height,
}: SitesListProps) {
  const maxVisible = height - 6; // Account for borders, title, and add prompt

  // Calculate visible window
  let startIndex = 0;
  if (sites.length > maxVisible) {
    const halfVisible = Math.floor(maxVisible / 2);
    startIndex = Math.max(0, Math.min(selectedIndex - halfVisible, sites.length - maxVisible));
  }

  const visibleSites = sites.slice(startIndex, startIndex + maxVisible);

  return (
    <Box
      width={20}
      flexDirection="column"
      borderStyle="single"
      borderColor={isFocused ? 'cyan' : 'gray'}
      paddingX={1}
    >
      <Text bold color="magenta">
        Sites
      </Text>

      {/* Add URL input/prompt */}
      <Box marginTop={1}>
        {isAddingUrl ? (
          <Box>
            <Text color="green">+ </Text>
            <Text>{newUrlInput}</Text>
            <Text color="cyan">|</Text>
          </Box>
        ) : (
          <Text dimColor={!isFocused} color={isFocused ? 'green' : undefined}>
            [+] Add URL...
          </Text>
        )}
      </Box>

      {/* Sites list */}
      <Box flexDirection="column" marginTop={1}>
        {sites.length === 0 && !isAddingUrl ? (
          <Text dimColor>No sites added</Text>
        ) : (
          visibleSites.map((site, visibleIndex) => {
            const actualIndex = startIndex + visibleIndex;
            const isSelected = actualIndex === selectedIndex && !isAddingUrl;

            let statusIcon = '';
            let statusColor: string | undefined;
            switch (site.status) {
              case 'loading':
                statusIcon = '◌';
                statusColor = 'yellow';
                break;
              case 'ready':
                statusIcon = '●';
                statusColor = 'green';
                break;
              case 'error':
                statusIcon = '✗';
                statusColor = 'red';
                break;
            }

            return (
              <Box key={`site-${actualIndex}-${site.url}`}>
                <Text
                  backgroundColor={isSelected && isFocused ? 'blue' : undefined}
                  color={isSelected ? 'white' : undefined}
                >
                  <Text color={statusColor}>{statusIcon}</Text>
                  {' '}
                  {site.name.length > 14 ? site.name.slice(0, 13) + '…' : site.name}
                </Text>
              </Box>
            );
          })
        )}
      </Box>

      {/* Scroll indicator */}
      {sites.length > maxVisible && (
        <Box marginTop={1}>
          <Text dimColor>
            [{startIndex + 1}-{Math.min(startIndex + maxVisible, sites.length)}/{sites.length}]
          </Text>
        </Box>
      )}
    </Box>
  );
}

// Extract a short name from a URL
export function getSiteNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Use hostname without www
    let name = parsed.hostname.replace(/^www\./, '');
    // If it's a subdomain like docs.example.com, use the subdomain
    const parts = name.split('.');
    if (parts.length > 2) {
      name = parts[0];
    } else if (parts.length === 2) {
      name = parts[0];
    }
    return name;
  } catch {
    return url.slice(0, 15);
  }
}
