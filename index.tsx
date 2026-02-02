import { render, Box, Text, useInput, useApp, useStdout } from 'ink';
import { useState, useCallback } from 'react';
import { SidePanel, getNodeAtIndex, getVisibleNodeCount } from './components/SidePanel.js';
import { MainPanel, getContentLineCount } from './components/MainPanel.js';
import { SitesList, getSiteNameFromUrl, type Site } from './components/SitesList.js';
import { StatusBar } from './components/StatusBar.js';
import { fetchSitemap, buildTree, testMarkdownSupport, type TreeNode } from './lib/sitemap.js';
import { fetchMarkdown } from './lib/markdown.js';

type FocusArea = 'sites' | 'nav' | 'main';

interface SiteData {
  site: Site;
  tree: TreeNode[];
  mdSupported: boolean;
}

interface AppState {
  sites: SiteData[];
  selectedSiteIndex: number;
  isAddingUrl: boolean;
  newUrlInput: string;
  // Navigation state (per-site, but we track current)
  navSelectedIndex: number;
  expandedPaths: Set<string>;
  // Document state
  currentDoc: string | null;
  isLoadingDoc: boolean;
  scrollOffset: number;
}

const App = () => {
  const [state, setState] = useState<AppState>({
    sites: [],
    selectedSiteIndex: -1,
    isAddingUrl: false,
    newUrlInput: '',
    navSelectedIndex: 0,
    expandedPaths: new Set(),
    currentDoc: null,
    isLoadingDoc: false,
    scrollOffset: 0,
  });

  const [focusArea, setFocusArea] = useState<FocusArea>('sites');

  const { exit } = useApp();
  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows ?? 24;
  const mainHeight = terminalHeight - 3; // Account for status bar

  const currentSite = state.selectedSiteIndex >= 0 ? state.sites[state.selectedSiteIndex] : null;

  const addSite = useCallback(async (url: string) => {
    const name = getSiteNameFromUrl(url);
    const newSite: SiteData = {
      site: { url, name, status: 'loading' },
      tree: [],
      mdSupported: false,
    };

    const newIndex = state.sites.length;

    setState(prev => ({
      ...prev,
      sites: [...prev.sites, newSite],
      selectedSiteIndex: newIndex,
      isAddingUrl: false,
      newUrlInput: '',
      navSelectedIndex: 0,
      expandedPaths: new Set(),
      currentDoc: null,
    }));

    try {
      const urls = await fetchSitemap(url);

      if (urls.length === 0) {
        throw new Error('No URLs found in sitemap');
      }

      const { supported } = await testMarkdownSupport(urls);
      const tree = buildTree(urls, url);

      setState(prev => {
        const updatedSites = [...prev.sites];
        const siteIndex = updatedSites.findIndex(s => s.site.url === url);
        if (siteIndex >= 0) {
          updatedSites[siteIndex] = {
            site: { ...updatedSites[siteIndex].site, status: 'ready' },
            tree,
            mdSupported: supported,
          };
        }
        return { ...prev, sites: updatedSites };
      });

      setFocusArea('nav');
    } catch (error) {
      setState(prev => {
        const updatedSites = [...prev.sites];
        const siteIndex = updatedSites.findIndex(s => s.site.url === url);
        if (siteIndex >= 0) {
          updatedSites[siteIndex] = {
            ...updatedSites[siteIndex],
            site: {
              ...updatedSites[siteIndex].site,
              status: 'error',
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          };
        }
        return { ...prev, sites: updatedSites };
      });
    }
  }, [state.sites.length]);

  const loadDocument = useCallback(async (node: TreeNode) => {
    setState(prev => ({ ...prev, isLoadingDoc: true, scrollOffset: 0 }));

    try {
      const content = await fetchMarkdown(node.fullUrl);
      setState(prev => ({ ...prev, currentDoc: content, isLoadingDoc: false }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        currentDoc: `# Error loading document\n\n${error instanceof Error ? error.message : 'Unknown error'}\n\nURL: ${node.fullUrl}`,
        isLoadingDoc: false,
      }));
    }
  }, []);

  const toggleExpanded = useCallback((path: string) => {
    setState(prev => {
      const newExpanded = new Set(prev.expandedPaths);
      if (newExpanded.has(path)) {
        newExpanded.delete(path);
      } else {
        newExpanded.add(path);
      }
      return { ...prev, expandedPaths: newExpanded };
    });
  }, []);

  const selectSite = useCallback((index: number) => {
    setState(prev => ({
      ...prev,
      selectedSiteIndex: index,
      navSelectedIndex: 0,
      expandedPaths: new Set(),
      currentDoc: null,
      scrollOffset: 0,
    }));
  }, []);

  useInput((input, key) => {
    // Global: Escape to quit or cancel
    if (key.escape) {
      if (state.isAddingUrl) {
        setState(prev => ({ ...prev, isAddingUrl: false, newUrlInput: '' }));
        return;
      }
      exit();
      return;
    }

    // Global: Tab to switch focus
    if (key.tab) {
      if (state.isAddingUrl) return; // Don't switch while adding URL

      setFocusArea(prev => {
        if (prev === 'sites') return 'nav';
        if (prev === 'nav') return 'main';
        return 'sites';
      });
      return;
    }

    // Handle sites panel
    if (focusArea === 'sites') {
      if (state.isAddingUrl) {
        // URL input mode
        if (key.backspace || key.delete) {
          setState(prev => ({ ...prev, newUrlInput: prev.newUrlInput.slice(0, -1) }));
          return;
        }

        if (key.return) {
          if (state.newUrlInput.trim()) {
            let url = state.newUrlInput.trim();
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
              url = 'https://' + url;
            }
            addSite(url);
          } else {
            setState(prev => ({ ...prev, isAddingUrl: false, newUrlInput: '' }));
          }
          return;
        }

        if (input && !key.ctrl && !key.meta) {
          setState(prev => ({ ...prev, newUrlInput: prev.newUrlInput + input }));
        }
        return;
      }

      // Normal sites navigation
      if (key.return || input === 'a' || input === 'A') {
        // Start adding a new URL
        setState(prev => ({ ...prev, isAddingUrl: true, newUrlInput: '' }));
        return;
      }

      if (key.upArrow) {
        setState(prev => ({
          ...prev,
          selectedSiteIndex: Math.max(-1, prev.selectedSiteIndex - 1),
        }));
        return;
      }

      if (key.downArrow) {
        setState(prev => ({
          ...prev,
          selectedSiteIndex: Math.min(prev.sites.length - 1, prev.selectedSiteIndex + 1),
        }));
        return;
      }

      if (key.return && state.selectedSiteIndex >= 0) {
        selectSite(state.selectedSiteIndex);
        setFocusArea('nav');
        return;
      }

      // Delete site with 'd' or 'x'
      if ((input === 'd' || input === 'x') && state.selectedSiteIndex >= 0) {
        setState(prev => {
          const newSites = prev.sites.filter((_, i) => i !== prev.selectedSiteIndex);
          const newIndex = Math.min(prev.selectedSiteIndex, newSites.length - 1);
          return {
            ...prev,
            sites: newSites,
            selectedSiteIndex: newIndex,
            currentDoc: newIndex < 0 ? null : prev.currentDoc,
          };
        });
        return;
      }
    }

    // Handle nav panel navigation
    if (focusArea === 'nav' && currentSite && currentSite.site.status === 'ready') {
      const nodeCount = getVisibleNodeCount(currentSite.tree, state.expandedPaths);

      if (key.upArrow) {
        setState(prev => ({
          ...prev,
          navSelectedIndex: Math.max(0, prev.navSelectedIndex - 1),
        }));
        return;
      }

      if (key.downArrow) {
        setState(prev => ({
          ...prev,
          navSelectedIndex: Math.min(nodeCount - 1, prev.navSelectedIndex + 1),
        }));
        return;
      }

      if (key.leftArrow) {
        const node = getNodeAtIndex(currentSite.tree, state.expandedPaths, state.navSelectedIndex);
        if (node && state.expandedPaths.has(node.path)) {
          toggleExpanded(node.path);
        }
        return;
      }

      if (key.rightArrow) {
        const node = getNodeAtIndex(currentSite.tree, state.expandedPaths, state.navSelectedIndex);
        if (node && node.children.length > 0 && !state.expandedPaths.has(node.path)) {
          toggleExpanded(node.path);
        }
        return;
      }

      if (key.return) {
        const node = getNodeAtIndex(currentSite.tree, state.expandedPaths, state.navSelectedIndex);
        if (node) {
          if (node.children.length > 0) {
            toggleExpanded(node.path);
          }
          if (node.isFile) {
            loadDocument(node);
          }
        }
        return;
      }
    }

    // Handle main panel scrolling
    if (focusArea === 'main' && state.currentDoc) {
      const totalLines = getContentLineCount(state.currentDoc);
      const maxScroll = Math.max(0, totalLines - (mainHeight - 4));

      if (key.upArrow) {
        setState(prev => ({
          ...prev,
          scrollOffset: Math.max(0, prev.scrollOffset - 1),
        }));
        return;
      }

      if (key.downArrow) {
        setState(prev => ({
          ...prev,
          scrollOffset: Math.min(maxScroll, prev.scrollOffset + 1),
        }));
        return;
      }

      if (key.pageUp || (key.ctrl && input === 'u')) {
        setState(prev => ({
          ...prev,
          scrollOffset: Math.max(0, prev.scrollOffset - 10),
        }));
        return;
      }

      if (key.pageDown || (key.ctrl && input === 'd')) {
        setState(prev => ({
          ...prev,
          scrollOffset: Math.min(maxScroll, prev.scrollOffset + 10),
        }));
        return;
      }
    }
  });

  // Count documents in tree
  const countDocs = (nodes: TreeNode[]): number => {
    return nodes.reduce((count, node) => {
      return count + (node.isFile ? 1 : 0) + countDocs(node.children);
    }, 0);
  };

  // Get sites for display
  const displaySites: Site[] = state.sites.map(s => s.site);

  return (
    <Box flexDirection="column" height={terminalHeight}>
      {/* Main content area */}
      <Box flexGrow={1} height={mainHeight}>
        {/* Sites list */}
        <SitesList
          sites={displaySites}
          selectedIndex={state.selectedSiteIndex}
          isFocused={focusArea === 'sites'}
          isAddingUrl={state.isAddingUrl}
          newUrlInput={state.newUrlInput}
          height={mainHeight}
        />

        {/* Navigation tree */}
        <SidePanel
          tree={currentSite?.tree ?? []}
          selectedIndex={state.navSelectedIndex}
          expandedPaths={state.expandedPaths}
          isFocused={focusArea === 'nav'}
          height={mainHeight}
        />

        {/* Main document panel */}
        <MainPanel
          content={state.currentDoc}
          isLoading={state.isLoadingDoc}
          scrollOffset={state.scrollOffset}
          isFocused={focusArea === 'main'}
          height={mainHeight}
        />
      </Box>

      {/* Status bar */}
      <StatusBar
        status={currentSite?.site.status === 'ready' ? 'ready' : currentSite?.site.status === 'loading' ? 'loading' : state.sites.length > 0 ? 'error' : 'input'}
        url={currentSite?.site.url ?? null}
        error={currentSite?.site.error ?? null}
        docCount={currentSite ? countDocs(currentSite.tree) : 0}
        mdSupported={currentSite?.mdSupported ?? false}
      />
    </Box>
  );
};

render(<App />);
