import type { MarketplaceValue, PluginsConfig } from '@a1st/aix-schema';

interface DeclarativeMarketplaceSource {
   source: string;
   [key: string]: unknown;
}

export interface DeclarativeMarketplaceEntry {
   source: DeclarativeMarketplaceSource;
}

export function formatImportedMarketplaceSource(source: DeclarativeMarketplaceSource): MarketplaceValue {
   const git = source.source === 'github' && typeof source.repo === 'string' ? `github:${source.repo}` : source.url;

   if ((source.source === 'github' || source.source === 'git') && typeof git === 'string' && typeof source.ref === 'string') {
      return { source: { git, ref: source.ref } };
   }

   if (source.source === 'github' && typeof source.repo === 'string') {
      return `github:${source.repo}`;
   }

   if (source.source === 'directory' && typeof source.path === 'string') {
      return source.path;
   }

   if (source.source === 'git' && typeof source.url === 'string') {
      return source.url;
   }

   return JSON.stringify(source);
}

function formatGitSource(git: string, ref?: string): DeclarativeMarketplaceSource {
   const githubMatch = git.match(/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?(?:[#?].*)?$/),
         pin = ref === undefined ? {} : { ref };

   if (git.startsWith('github:')) {
      return { source: 'github', repo: git.slice(7), ...pin };
   }
   if (githubMatch) {
      return { source: 'github', repo: `${githubMatch[1]}/${githubMatch[2]}`, ...pin };
   }
   return { source: 'git', url: git, ...pin };
}

export function parseDeclarativeMarketplaceSource(value: MarketplaceValue | false | undefined): DeclarativeMarketplaceSource | null {
   if (!value) {
      return null;
   }

   let rawSource: unknown = value;

   if (typeof value === 'object' && value !== null && 'source' in value) {
      if (value.enabled === false) {
         return null;
      }
      rawSource = value.source;
   }

   if (typeof rawSource === 'string') {
      if (rawSource.startsWith('.') || rawSource.startsWith('/') || rawSource.startsWith('~')) {
         return { source: 'directory', path: rawSource };
      }

      return formatGitSource(rawSource);
   }

   if (typeof rawSource === 'object' && rawSource !== null) {
      const sourceObj = rawSource as Record<string, unknown>;

      if (typeof sourceObj.git === 'string') {
         const ref = typeof sourceObj.ref === 'string' ? sourceObj.ref : undefined;

         return formatGitSource(sourceObj.git, ref);
      }

      if (typeof sourceObj.path === 'string') {
         return { source: 'directory', path: sourceObj.path };
      }

      if (typeof sourceObj.source === 'string') {
         return sourceObj as DeclarativeMarketplaceSource;
      }
   }

   return null;
}

export function getEnabledPlugins(plugins: PluginsConfig): Record<string, boolean> {
   const enabledPlugins: Record<string, boolean> = {};

   for (const [ key, value ] of Object.entries(plugins)) {
      if (value === false) {
         enabledPlugins[key] = false;
      } else if (value === true || typeof value === 'string') {
         enabledPlugins[key] = true;
      } else if (typeof value === 'object' && value !== null) {
         const pluginKey = !key.includes('@') && value.marketplace
            ? `${key}@${value.marketplace}`
            : key;

         enabledPlugins[pluginKey] = value.enabled !== false;
      }
   }

   return enabledPlugins;
}
