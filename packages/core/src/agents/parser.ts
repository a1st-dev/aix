import type { AgentObject } from '@a1st/aix-schema';
import { extractFrontmatter, parseAllFrontmatter } from '../frontmatter-utils.js';

export interface ParsedAgentFrontmatter {
   content: string;
   description?: string;
   mode?: 'primary' | 'subagent';
   model?: string;
   tools?: string[];
   permissions?: Record<string, 'allow' | 'ask' | 'deny'>;
   mcp?: AgentObject['mcp'];
   editor?: AgentObject['editor'];
   rawFrontmatter?: Record<string, unknown>;
}

function isAgentMode(value: unknown): value is 'primary' | 'subagent' {
   return value === 'primary' || value === 'subagent';
}

function isPermissionValue(value: unknown): value is 'allow' | 'ask' | 'deny' {
   return value === 'allow' || value === 'ask' || value === 'deny';
}

function listFromValue(value: unknown): string[] | undefined {
   if (Array.isArray(value)) {
      const values = value.filter((item) => typeof item === 'string');

      return values.length === value.length ? values : undefined;
   }

   if (typeof value === 'string') {
      return value
         .split(',')
         .map((item) => item.trim())
         .filter(Boolean);
   }

   return undefined;
}

function permissionsFromValue(value: unknown): Record<string, 'allow' | 'ask' | 'deny'> | undefined {
   if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return undefined;
   }

   const permissions: Record<string, 'allow' | 'ask' | 'deny'> = {};

   for (const [key, permission] of Object.entries(value)) {
      if (isPermissionValue(permission)) {
         permissions[key] = permission;
      }
   }

   return Object.keys(permissions).length > 0 ? permissions : undefined;
}

function recordFromValue<T>(value: unknown): T | undefined {
   if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return undefined;
   }

   return value as T;
}

export function parseAgentFrontmatter(rawContent: string): ParsedAgentFrontmatter {
   const { frontmatter, content, hasFrontmatter } = extractFrontmatter(rawContent);

   if (!hasFrontmatter) {
      return { content: rawContent };
   }

   const parsed = parseAllFrontmatter(frontmatter),
         description = typeof parsed.description === 'string' ? parsed.description : undefined,
         mode = isAgentMode(parsed.mode) ? parsed.mode : undefined,
         model = typeof parsed.model === 'string' ? parsed.model : undefined,
         tools = listFromValue(parsed.tools),
         permissions = permissionsFromValue(parsed.permissions ?? parsed.permission),
         mcp = recordFromValue<AgentObject['mcp']>(parsed.mcp ?? parsed['mcp-servers']),
         editor = recordFromValue<AgentObject['editor']>(parsed.editor);

   return {
      content,
      description,
      mode,
      model,
      tools,
      permissions,
      mcp,
      editor,
      rawFrontmatter: parsed,
   };
}
