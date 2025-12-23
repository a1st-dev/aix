export class ConfigError extends Error {
   constructor(
      message: string,
      public readonly code: string,
   ) {
      super(message);
      this.name = 'ConfigError';
   }
}

export class ConfigNotFoundError extends ConfigError {
   constructor(searchPath?: string) {
      super(
         searchPath
            ? `Config file not found at: ${searchPath}`
            : 'No ai.json found in current directory or parents',
         'CONFIG_NOT_FOUND',
      );
   }
}

export class ConfigValidationError extends ConfigError {
   constructor(public readonly errors: Array<{ path: string; message: string }>) {
      const message = [
         'Invalid ai.json configuration:',
         ...errors.map((e) => `  - ${e.path}: ${e.message}`),
      ].join('\n');

      super(message, 'CONFIG_VALIDATION_ERROR');
   }
}

export class CircularDependencyError extends ConfigError {
   constructor(public readonly path: string[]) {
      super(`Circular dependency detected: ${path.join(' -> ')}`, 'CIRCULAR_DEPENDENCY');
   }
}

export interface ConfigParseIssue {
   path: string;
   message: string;
}

export class ConfigParseError extends ConfigError {
   constructor(
      message: string,
      public readonly filePath: string,
      public readonly issues?: ConfigParseIssue[],
   ) {
      super(`Failed to parse ${filePath}: ${message}`, 'CONFIG_PARSE_ERROR');
   }
}

export class EmbeddedConfigUpdateError extends ConfigError {
   constructor(public readonly packageJsonPath: string) {
      super(
         `Cannot update config embedded in package.json (${packageJsonPath}). ` +
            'Extract the "ai" field to a separate ai.json file first, or use ' +
            '"ai": "./ai.json" in package.json to reference an external file.',
         'EMBEDDED_CONFIG_UPDATE',
      );
   }
}

export class RemoteFetchError extends ConfigError {
   constructor(
      public readonly url: string,
      public readonly cause: string,
   ) {
      super(`Failed to fetch remote config from ${url}: ${cause}`, 'REMOTE_FETCH_ERROR');
   }
}

export class UnsupportedUrlError extends ConfigError {
   constructor(public readonly url: string) {
      super(
         `Unsupported URL format: ${url}. Use HTTPS URLs or git shorthand (github:, gitlab:, bitbucket:).`,
         'UNSUPPORTED_URL',
      );
   }
}
