import { describe, it, expect } from 'vitest';
import {
   getServerTemplate,
   listServerTemplates,
   createFromTemplate,
} from '../../mcp/templates.js';

describe('getServerTemplate', () => {
   it('returns template for known name', () => {
      const template = getServerTemplate('github');

      expect(template).toBeDefined();
      expect('command' in template! && template.command).toBe('npx');
   });

   it('returns undefined for unknown name', () => {
      expect(getServerTemplate('unknown')).toBeUndefined();
   });
});

describe('listServerTemplates', () => {
   it('returns array of template names', () => {
      const names = listServerTemplates();

      expect(names).toContain('github');
      expect(names).toContain('filesystem');
      expect(names).toContain('postgres');
   });
});

describe('createFromTemplate', () => {
   it('applies overrides', () => {
      const config = createFromTemplate('github', { args: ['--custom'] });

      expect('args' in config && config.args).toEqual(['--custom']);
   });

   it('throws for unknown template', () => {
      expect(() => createFromTemplate('unknown')).toThrow('Unknown server template: unknown');
   });
});
