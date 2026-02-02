import { XMLParser } from 'fast-xml-parser';

export interface TreeNode {
  name: string;
  path: string;
  fullUrl: string;
  children: TreeNode[];
  isFile: boolean;
}

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

interface SitemapData {
  urlset?: {
    url?: SitemapUrl | SitemapUrl[];
  };
  sitemapindex?: {
    sitemap?: { loc: string } | { loc: string }[];
  };
}

export async function fetchSitemap(baseUrl: string): Promise<string[]> {
  // Normalize base URL
  const url = new URL(baseUrl);
  const sitemapUrl = new URL('/sitemap.xml', url.origin).toString();

  const response = await fetch(sitemapUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch sitemap: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  const data: SitemapData = parser.parse(xml);

  // Handle sitemap index (multiple sitemaps)
  if (data.sitemapindex?.sitemap) {
    const sitemaps = Array.isArray(data.sitemapindex.sitemap)
      ? data.sitemapindex.sitemap
      : [data.sitemapindex.sitemap];

    const allUrls: string[] = [];
    for (const sitemap of sitemaps.slice(0, 5)) { // Limit to first 5 sub-sitemaps
      try {
        const subResponse = await fetch(sitemap.loc);
        if (subResponse.ok) {
          const subXml = await subResponse.text();
          const subData: SitemapData = parser.parse(subXml);
          const urls = extractUrls(subData);
          allUrls.push(...urls);
        }
      } catch {
        // Skip failed sub-sitemaps
      }
    }
    return allUrls;
  }

  return extractUrls(data);
}

function extractUrls(data: SitemapData): string[] {
  if (!data.urlset?.url) {
    return [];
  }

  const urls = Array.isArray(data.urlset.url) ? data.urlset.url : [data.urlset.url];
  return urls.map(u => u.loc).filter(Boolean);
}

export async function testMarkdownSupport(urls: string[]): Promise<{ supported: boolean; mdUrls: Map<string, string> }> {
  const testUrls = urls.slice(0, 5);
  const mdUrls = new Map<string, string>();
  let supported = false;

  for (const url of testUrls) {
    // Try appending .md to the URL
    const mdUrl = url.endsWith('/') ? url.slice(0, -1) + '.md' : url + '.md';

    try {
      const response = await fetch(mdUrl, { method: 'HEAD' });
      if (response.ok) {
        supported = true;
        mdUrls.set(url, mdUrl);
      }
    } catch {
      // Ignore errors
    }

    // Also try replacing .html with .md if applicable
    if (url.endsWith('.html')) {
      const mdUrlAlt = url.replace(/\.html$/, '.md');
      try {
        const response = await fetch(mdUrlAlt, { method: 'HEAD' });
        if (response.ok) {
          supported = true;
          mdUrls.set(url, mdUrlAlt);
        }
      } catch {
        // Ignore errors
      }
    }
  }

  return { supported, mdUrls };
}

export function buildTree(urls: string[], baseUrl: string): TreeNode[] {
  const base = new URL(baseUrl);
  const root: TreeNode[] = [];

  // Create a map for quick lookup of existing nodes
  const nodeMap = new Map<string, TreeNode>();

  for (const url of urls) {
    try {
      const parsed = new URL(url);

      // Only include URLs from the same origin
      if (parsed.origin !== base.origin) continue;

      // Get path segments, filtering out empty strings
      let pathParts = parsed.pathname.split('/').filter(Boolean);

      // Remove common prefixes like 'docs', 'documentation' if they appear in all paths
      // and file extensions
      pathParts = pathParts.map(part => {
        // Remove .html extension for display
        return part.replace(/\.html$/, '');
      });

      if (pathParts.length === 0) continue;

      let currentLevel = root;
      let currentPath = '';

      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        currentPath += '/' + part;
        const isLast = i === pathParts.length - 1;

        // Check if this node already exists
        let existingNode = currentLevel.find(n => n.name === part);

        if (!existingNode) {
          const newNode: TreeNode = {
            name: part,
            path: currentPath,
            fullUrl: url,
            children: [],
            isFile: isLast,
          };

          currentLevel.push(newNode);
          nodeMap.set(currentPath, newNode);
          existingNode = newNode;
        } else if (isLast) {
          // Update the URL if this is the actual file
          existingNode.fullUrl = url;
          existingNode.isFile = true;
        }

        currentLevel = existingNode.children;
      }
    } catch {
      // Skip invalid URLs
    }
  }

  // Sort tree alphabetically, directories first
  sortTree(root);

  return root;
}

function sortTree(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    // Directories first
    if (!a.isFile && b.isFile) return -1;
    if (a.isFile && !b.isFile) return 1;
    // Then alphabetically
    return a.name.localeCompare(b.name);
  });

  for (const node of nodes) {
    if (node.children.length > 0) {
      sortTree(node.children);
    }
  }
}

export function getMdUrl(url: string): string {
  // Convert a regular URL to its .md equivalent
  if (url.endsWith('.md')) return url;
  if (url.endsWith('.html')) return url.replace(/\.html$/, '.md');
  if (url.endsWith('/')) return url.slice(0, -1) + '.md';
  return url + '.md';
}
