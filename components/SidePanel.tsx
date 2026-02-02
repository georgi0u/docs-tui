import React from 'react';
import { Box, Text } from 'ink';
import type { TreeNode } from '../lib/sitemap.js';

interface SidePanelProps {
  tree: TreeNode[];
  selectedIndex: number;
  expandedPaths: Set<string>;
  isFocused: boolean;
  height: number;
}

interface FlattenedNode {
  node: TreeNode;
  depth: number;
  isExpanded: boolean;
  hasChildren: boolean;
}

export function flattenTree(
  tree: TreeNode[],
  expandedPaths: Set<string>,
  depth = 0
): FlattenedNode[] {
  const result: FlattenedNode[] = [];

  for (const node of tree) {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedPaths.has(node.path);

    result.push({
      node,
      depth,
      isExpanded,
      hasChildren,
    });

    if (hasChildren && isExpanded) {
      result.push(...flattenTree(node.children, expandedPaths, depth + 1));
    }
  }

  return result;
}

export function SidePanel({
  tree,
  selectedIndex,
  expandedPaths,
  isFocused,
  height,
}: SidePanelProps) {
  const flatNodes = flattenTree(tree, expandedPaths);

  // Calculate visible window
  const maxVisible = height - 4; // Account for borders and padding
  let startIndex = 0;

  if (flatNodes.length > maxVisible) {
    // Keep selected item in view
    const halfVisible = Math.floor(maxVisible / 2);
    startIndex = Math.max(0, Math.min(selectedIndex - halfVisible, flatNodes.length - maxVisible));
  }

  const visibleNodes = flatNodes.slice(startIndex, startIndex + maxVisible);

  return (
    <Box
      width={30}
      flexDirection="column"
      borderStyle="single"
      borderColor={isFocused ? 'cyan' : 'gray'}
      paddingX={1}
    >
      <Text bold color="cyan">
        Navigation
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {tree.length === 0 ? (
          <Text dimColor>No documents loaded</Text>
        ) : (
          visibleNodes.map((item, visibleIndex) => {
            const actualIndex = startIndex + visibleIndex;
            const isSelected = actualIndex === selectedIndex;
            const indent = '  '.repeat(item.depth);
            const prefix = item.hasChildren
              ? item.isExpanded
                ? '[-] '
                : '[+] '
              : '    ';

            const icon = item.node.isFile ? '' : '/';

            return (
              <Text
                key={item.node.path}
                backgroundColor={isSelected && isFocused ? 'blue' : undefined}
                color={isSelected ? 'white' : item.hasChildren ? 'yellow' : undefined}
              >
                {indent}
                {prefix}
                {item.node.name}
                {icon}
              </Text>
            );
          })
        )}
      </Box>
      {flatNodes.length > maxVisible && (
        <Box marginTop={1}>
          <Text dimColor>
            [{startIndex + 1}-{Math.min(startIndex + maxVisible, flatNodes.length)}/{flatNodes.length}]
          </Text>
        </Box>
      )}
    </Box>
  );
}

// Helper to get the node at a specific index in the flattened tree
export function getNodeAtIndex(
  tree: TreeNode[],
  expandedPaths: Set<string>,
  index: number
): TreeNode | null {
  const flatNodes = flattenTree(tree, expandedPaths);
  return flatNodes[index]?.node ?? null;
}

// Get total count of visible nodes
export function getVisibleNodeCount(tree: TreeNode[], expandedPaths: Set<string>): number {
  return flattenTree(tree, expandedPaths).length;
}
