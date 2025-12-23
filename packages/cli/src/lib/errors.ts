import { CLIError } from '@oclif/core/errors';

/**
 * CLI-specific error for when a config file is not found. Wraps the core ConfigNotFoundError with
 * CLI-friendly messaging and exit codes.
 */
export class ConfigNotFoundError extends CLIError {
   constructor(searchPath?: string) {
      super(
         searchPath
            ? `Config file not found at: ${searchPath}`
            : 'No ai.json found in current directory or parents',
         { exit: 1 },
      );
   }
}

/**
 * CLI-specific error for config validation failures.
 */
export class ConfigValidationError extends CLIError {
   constructor(errors: Array<{ path: string; message: string }>) {
      const message = [
         'Invalid ai.json configuration:',
         ...errors.map((e) => `  - ${e.path}: ${e.message}`),
      ].join('\n');

      super(message, { exit: 1 });
   }
}

/**
 * CLI-specific error for when a skill is not found.
 */
export class SkillNotFoundError extends CLIError {
   constructor(skillName: string) {
      super(`Skill not found: ${skillName}`, { exit: 1 });
   }
}

/**
 * CLI-specific error for MCP server issues.
 */
export class McpServerError extends CLIError {
   constructor(serverName: string, reason: string) {
      super(`MCP server "${serverName}" error: ${reason}`, { exit: 1 });
   }
}
