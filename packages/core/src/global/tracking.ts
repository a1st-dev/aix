import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'pathe';

/**
 * A single entry in the global tracking file, representing a global config item that aix manages.
 */
export interface GlobalTrackingEntry {
   /** Type of global config (mcp or prompt) */
   type: 'mcp' | 'prompt';
   /** Editor this entry belongs to */
   editor: string;
   /** Name of the config item (e.g., MCP server name, prompt name) */
   name: string;
   /** Absolute paths of projects that depend on this global config */
   projects: string[];
   /** ISO timestamp when this entry was first added */
   addedAt: string;
}

/**
 * Structure of the global tracking file at ~/.aix/global-tracking.json
 */
export interface GlobalTrackingFile {
   version: 1;
   entries: Record<string, GlobalTrackingEntry>;
}

/**
 * Generate a unique key for a global tracking entry.
 */
export function makeTrackingKey(editor: string, type: 'mcp' | 'prompt', name: string): string {
   return `${editor}:${type}:${name}`;
}

/**
 * Get the path to the global tracking file.
 */
export function getTrackingFilePath(): string {
   return join(homedir(), '.aix', 'global-tracking.json');
}

/**
 * Service for managing the global tracking file. Tracks which aix projects depend on global
 * configuration entries (MCP servers, prompts) that were installed by aix.
 *
 * The tracking file is stored at ~/.aix/global-tracking.json and is used to:
 * 1. Know which projects depend on a global config entry
 * 2. Inform users when they can safely remove a global config (no projects depend on it)
 * 3. Detect orphaned entries (tracking says it exists but no projects use it)
 *
 * **Robustness**: This service does NOT verify that the actual global config still exists.
 * Callers should verify global config existence before trusting tracking data.
 */
export class GlobalTrackingService {
   private readonly filePath: string;

   constructor(filePath?: string) {
      this.filePath = filePath ?? getTrackingFilePath();
   }

   /**
    * Load the tracking file. Creates an empty file if it doesn't exist.
    */
   async load(): Promise<GlobalTrackingFile> {
      if (!existsSync(this.filePath)) {
         return { version: 1, entries: {} };
      }

      try {
         const content = await readFile(this.filePath, 'utf-8'),
               data = JSON.parse(content) as GlobalTrackingFile;

         // Validate version
         if (data.version !== 1) {
            throw new Error(`Unsupported tracking file version: ${data.version}`);
         }

         return data;
      } catch (error) {
         if (error instanceof SyntaxError) {
            // Corrupted file - return empty and let next save fix it
            return { version: 1, entries: {} };
         }
         throw error;
      }
   }

   /**
    * Save the tracking file.
    */
   async save(data: GlobalTrackingFile): Promise<void> {
      await mkdir(dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
   }

   /**
    * Add a project dependency to a global config entry. Creates the entry if it doesn't exist.
    *
    * @param key - Unique key for the entry (use makeTrackingKey)
    * @param entry - Entry metadata (type, editor, name)
    * @param projectPath - Absolute path to the project
    */
   async addProjectDependency(
      key: string,
      entry: Omit<GlobalTrackingEntry, 'projects' | 'addedAt'>,
      projectPath: string,
   ): Promise<void> {
      const data = await this.load(),
            normalizedPath = this.normalizePath(projectPath);

      if (data.entries[key]) {
         // Entry exists - add project if not already present
         if (!data.entries[key].projects.includes(normalizedPath)) {
            data.entries[key].projects.push(normalizedPath);
         }
      } else {
         // Create new entry
         data.entries[key] = {
            ...entry,
            projects: [normalizedPath],
            addedAt: new Date().toISOString(),
         };
      }

      await this.save(data);
   }

   /**
    * Remove a project dependency from a global config entry.
    *
    * @returns The remaining projects that still depend on this entry, or empty array if entry
    *          doesn't exist or was removed.
    */
   async removeProjectDependency(key: string, projectPath: string): Promise<string[]> {
      const data = await this.load(),
            entry = data.entries[key];

      if (!entry) {
         return [];
      }

      const normalizedPath = this.normalizePath(projectPath);

      entry.projects = entry.projects.filter((p) => p !== normalizedPath);

      // If no projects remain, remove the entry entirely
      if (entry.projects.length === 0) {
         delete data.entries[key];
      }

      await this.save(data);
      return entry.projects;
   }

   /**
    * Get a single entry by key.
    */
   async getEntry(key: string): Promise<GlobalTrackingEntry | null> {
      const data = await this.load();

      return data.entries[key] ?? null;
   }

   /**
    * Check if a project is registered as depending on an entry.
    */
   async hasProjectDependency(key: string, projectPath: string): Promise<boolean> {
      const entry = await this.getEntry(key);

      if (!entry) {
         return false;
      }

      const normalizedPath = this.normalizePath(projectPath);

      return entry.projects.includes(normalizedPath);
   }

   /**
    * List all entries in the tracking file.
    */
   async listEntries(): Promise<GlobalTrackingEntry[]> {
      const data = await this.load();

      return Object.values(data.entries);
   }

   /**
    * List entries for a specific editor.
    */
   async listEntriesForEditor(editor: string): Promise<GlobalTrackingEntry[]> {
      const entries = await this.listEntries();

      return entries.filter((e) => e.editor === editor);
   }

   /**
    * Get orphaned entries - entries with no projects depending on them.
    * This can happen if tracking gets out of sync (e.g., project deleted without running aix).
    */
   async getOrphanedEntries(): Promise<GlobalTrackingEntry[]> {
      const entries = await this.listEntries();

      return entries.filter((e) => e.projects.length === 0);
   }

   /**
    * Remove an entry entirely from tracking by its key.
    */
   async removeEntry(key: string): Promise<boolean> {
      const data = await this.load();

      if (!data.entries[key]) {
         return false;
      }

      delete data.entries[key];
      await this.save(data);
      return true;
   }

   /**
    * Get entries for a specific project.
    */
   async getEntriesForProject(projectPath: string): Promise<GlobalTrackingEntry[]> {
      const entries = await this.listEntries(),
            normalizedPath = this.normalizePath(projectPath);

      return entries.filter((e) => e.projects.includes(normalizedPath));
   }

   /**
    * Remove all entries for a project (used when uninstalling aix from a project).
    *
    * @returns Keys of entries that were removed entirely (no other projects depend on them)
    */
   async removeAllForProject(projectPath: string): Promise<string[]> {
      const data = await this.load(),
            normalizedPath = this.normalizePath(projectPath),
            removedKeys: string[] = [];

      for (const [key, entry] of Object.entries(data.entries)) {
         entry.projects = entry.projects.filter((p) => p !== normalizedPath);

         if (entry.projects.length === 0) {
            delete data.entries[key];
            removedKeys.push(key);
         }
      }

      await this.save(data);
      return removedKeys;
   }

   /**
    * Normalize a project path for consistent comparison.
    */
   private normalizePath(projectPath: string): string {
      // Remove trailing slashes and normalize
      return projectPath.replace(/\/+$/, '');
   }
}
