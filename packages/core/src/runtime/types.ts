export type RuntimeEncoding = 'utf-8' | 'utf8';

export interface RuntimeDirent {
   name: string;
   isDirectory(): boolean;
   isFile(): boolean;
   isSymbolicLink(): boolean;
}

export interface RuntimeStats {
   mtime: Date;
   mtimeMs: number;
   size: number;
   isDirectory(): boolean;
   isSymbolicLink(): boolean;
}

export interface RuntimeFileSystemAdapter {
   readonly constants: {
      readonly F_OK: number;
      readonly R_OK: number;
      readonly W_OK: number;
   };
   access(path: string, mode?: number): Promise<void>;
   chmod(path: string, mode: number): Promise<void>;
   copyFile(source: string, destination: string): Promise<void>;
   cp(source: string, destination: string, options?: RuntimeCopyOptions): Promise<void>;
   existsSync(path: string): boolean;
   lstat(path: string): Promise<RuntimeStats>;
   mkdir(path: string, options?: RuntimeMkdirOptions): Promise<void>;
   mkdtemp(prefix: string): Promise<string>;
   readFile(path: string, encoding?: RuntimeEncoding): Promise<string>;
   readFileSync(path: string, encoding?: RuntimeEncoding): string;
   readdir(path: string): Promise<string[]>;
   readdir(path: string, options: RuntimeReaddirOptions): Promise<RuntimeDirent[]>;
   readlink(path: string): Promise<string>;
   rename(source: string, destination: string): Promise<void>;
   rm(path: string, options?: RuntimeRemoveOptions): Promise<void>;
   stat(path: string): Promise<RuntimeStats>;
   symlink(target: string, path: string, type?: RuntimeSymlinkType): Promise<void>;
   unlink(path: string): Promise<void>;
   writeFile(path: string, content: string, encoding?: RuntimeEncoding): Promise<void>;
}

export interface RuntimeOSAdapter {
   homedir(): string;
   platform(): NodeJS.Platform;
   tmpdir(): string;
}

export interface RuntimeProcessAdapter {
   readonly env: Record<string, string | undefined>;
   cwd(): string;
   pid(): number;
}

export interface RuntimeNetworkAdapter {
   createAbortController(): AbortController;
   fetch(input: string, init?: RuntimeFetchInit): Promise<RuntimeFetchResponse>;
}

export interface RuntimeAdapter {
   readonly fs: RuntimeFileSystemAdapter;
   readonly network: RuntimeNetworkAdapter;
   readonly os: RuntimeOSAdapter;
   readonly process: RuntimeProcessAdapter;
}

export interface RuntimeCopyOptions {
   dereference?: boolean;
   errorOnExist?: boolean;
   filter?: (source: string, destination: string) => boolean | Promise<boolean>;
   force?: boolean;
   mode?: number;
   preserveTimestamps?: boolean;
   recursive?: boolean;
   verbatimSymlinks?: boolean;
}

export interface RuntimeFetchInit {
   signal?: AbortSignal;
}

export interface RuntimeFetchResponse {
   readonly ok: boolean;
   readonly status: number;
   readonly statusText: string;
   text(): Promise<string>;
}

export interface RuntimeMkdirOptions {
   recursive?: boolean;
}

export interface RuntimeReaddirOptions {
   withFileTypes: true;
}

export interface RuntimeRemoveOptions {
   force?: boolean;
   maxRetries?: number;
   recursive?: boolean;
   retryDelay?: number;
}

export type RuntimeSymlinkType = 'dir' | 'file' | 'junction';
