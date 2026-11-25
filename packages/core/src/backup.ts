import { basename, dirname, isAbsolute, join, relative, resolve } from 'pathe';
import { getRuntimeAdapter } from './runtime/index.js';

export interface BackupOptions {
   /** How many backups of one file to keep. Older ones are deleted. */
   maxBackups?: number;
}

export interface BackupInfo {
   path: string;
   timestamp: Date;
}

export interface StoredBackup extends BackupInfo {
   /** The file this is a backup of, when the store's layout records it. */
   originalPath?: string;
   size: number;
}

export interface PruneBackupsResult {
   deletedPaths: string[];
   freedBytes: number;
}

const DEFAULT_MAX_BACKUPS = 5,
      BACKUP_EXTENSION = '.backup',
      // Files under the home directory are keyed relative to it, so the store still describes
      // them correctly when the home directory is relocated. Everything else is keyed by its
      // absolute path.
      HOME_KEY = 'home',
      ROOT_KEY = 'root',
      TIMESTAMP_PATTERN = /\.(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.backup$/,
      MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The one directory that holds every backup aix makes. It sits beside aix's other user-level
 * state, outside any cache, so clearing a cache or cleaning a project never removes a backup.
 */
export function getBackupStoreDir(): string {
   return join(getRuntimeAdapter().os.homedir(), '.aix', 'backups');
}

function isInside(directory: string, path: string): boolean {
   const relativePath = relative(directory, path);

   return relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath);
}

/** Path inside the store, without a timestamp, under which the backups of one file are kept. */
function getStoreEntryPath(absolutePath: string): string {
   const home = resolve(getRuntimeAdapter().os.homedir()),
         storeDir = getBackupStoreDir();

   if (isInside(home, absolutePath)) {
      return join(storeDir, HOME_KEY, relative(home, absolutePath));
   }

   // A Windows drive letter becomes a plain path segment.
   return join(storeDir, ROOT_KEY, absolutePath.replace(/^([A-Za-z]):/, '$1').replace(/^\/+/, ''));
}

/** Reverse of {@link getStoreEntryPath} for a backup file found in the store. */
function getOriginalPath(backupPath: string): string | undefined {
   const [ area, ...segments ] = relative(getBackupStoreDir(), backupPath).replace(TIMESTAMP_PATTERN, '').split('/');

   if (segments.length === 0) {
      return undefined;
   }
   if (area === HOME_KEY) {
      return join(getRuntimeAdapter().os.homedir(), ...segments);
   }
   if (area !== ROOT_KEY) {
      return undefined;
   }

   const [ first = '', ...rest ] = segments;

   return getRuntimeAdapter().os.platform() === 'win32' ? join(`${first}:/`, ...rest) : join('/', ...segments);
}

function formatTimestamp(date: Date): string {
   return date.toISOString().replace(/[:.]/g, '-');
}

function parseTimestamp(fileName: string): Date | undefined {
   const match = fileName.match(TIMESTAMP_PATTERN);

   if (!match) {
      return undefined;
   }

   const [ , day, hours, minutes, seconds, milliseconds ] = match;

   return new Date(`${day}T${hours}:${minutes}:${seconds}.${milliseconds}Z`);
}

async function listBackupFiles(directory: string): Promise<string[]> {
   const { fs } = getRuntimeAdapter();

   if (!fs.existsSync(directory)) {
      return [];
   }

   const entries = await fs.readdir(directory, { withFileTypes: true }),
         nested = await Promise.all(entries.map(async (entry) => {
            const path = join(directory, entry.name);

            if (entry.isDirectory()) {
               return listBackupFiles(path);
            }
            return entry.name.endsWith(BACKUP_EXTENSION) ? [ path ] : [];
         }));

   return nested.flat();
}

function newestFirst<T extends BackupInfo>(backups: T[]): T[] {
   return backups.toSorted((a, b) => {
      return b.timestamp.getTime() - a.timestamp.getTime();
   });
}

/** Copy a file into the backup store before it is changed or deleted. */
export async function createBackup(filePath: string, options: BackupOptions = {}): Promise<BackupInfo> {
   const { maxBackups = DEFAULT_MAX_BACKUPS } = options,
         absolutePath = resolve(filePath),
         { fs } = getRuntimeAdapter();

   if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${filePath}`);
   }

   const timestamp = new Date(),
         backupPath = `${getStoreEntryPath(absolutePath)}.${formatTimestamp(timestamp)}${BACKUP_EXTENSION}`;

   await fs.mkdir(dirname(backupPath), { recursive: true });
   await fs.copyFile(absolutePath, backupPath);

   const superseded = (await listBackups(absolutePath)).slice(maxBackups);

   await Promise.all(superseded.map((backup) => {
      return fs.unlink(backup.path);
   }));

   return { path: backupPath, timestamp };
}

/** List the backups of one file, newest first. */
export async function listBackups(filePath: string): Promise<BackupInfo[]> {
   const entryPath = getStoreEntryPath(resolve(filePath)),
         directory = dirname(entryPath),
         { fs } = getRuntimeAdapter();

   if (!fs.existsSync(directory)) {
      return [];
   }

   const backups = (await fs.readdir(directory)).flatMap((fileName): BackupInfo[] => {
      const timestamp = parseTimestamp(fileName),
            isForThisFile = fileName.replace(TIMESTAMP_PATTERN, '') === basename(entryPath);

      return timestamp && isForThisFile ? [ { path: join(directory, fileName), timestamp } ] : [];
   });

   return newestFirst(backups);
}

/** List every backup in the store, newest first. */
export async function listAllBackups(): Promise<StoredBackup[]> {
   const { fs } = getRuntimeAdapter(),
         paths = await listBackupFiles(getBackupStoreDir()),
         backups = await Promise.all(paths.map(async (path): Promise<StoredBackup[]> => {
            const timestamp = parseTimestamp(basename(path));

            if (!timestamp) {
               return [];
            }

            return [ { path, timestamp, originalPath: getOriginalPath(path), size: (await fs.stat(path)).size } ];
         }));

   return newestFirst(backups.flat());
}

/**
 * Copy a backup back over the file it was taken from, or over `targetPath` when given. The
 * file being replaced is backed up first, so a restore can itself be undone.
 */
export async function restoreBackup(backupPath: string, targetPath?: string): Promise<string> {
   const absoluteBackupPath = resolve(backupPath),
         { fs } = getRuntimeAdapter();

   if (!fs.existsSync(absoluteBackupPath)) {
      throw new Error(`Backup not found: ${backupPath}`);
   }

   const destination = targetPath ? resolve(targetPath) : getOriginalPath(absoluteBackupPath);

   if (!destination) {
      throw new Error(`Cannot tell which file ${backupPath} is a backup of. Pass the file to restore it to.`);
   }

   if (fs.existsSync(destination)) {
      await createBackup(destination);
   }
   await fs.mkdir(dirname(destination), { recursive: true });
   await fs.copyFile(absoluteBackupPath, destination);

   return destination;
}

/** Delete every backup older than `maxAgeDays`. */
export async function pruneBackups(options: { maxAgeDays: number }): Promise<PruneBackupsResult> {
   const cutoff = Date.now() - options.maxAgeDays * MILLISECONDS_PER_DAY,
         { fs } = getRuntimeAdapter(),
         expired = (await listAllBackups()).filter((backup) => {
            return backup.timestamp.getTime() < cutoff;
         });

   await Promise.all(expired.map((backup) => {
      return fs.unlink(backup.path);
   }));

   return {
      deletedPaths: expired.map((backup) => {
         return backup.path;
      }),
      freedBytes: expired.reduce((memo, backup) => {
         return memo + backup.size;
      }, 0),
   };
}
