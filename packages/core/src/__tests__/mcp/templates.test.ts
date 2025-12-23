import { describe, it, expect } from 'vitest';
import {
   serverTemplates,
   getServerTemplate,
   listServerTemplates,
   createFromTemplate,
} from '../../mcp/templates.js';

describe('serverTemplates', () => {
   it('has github template', () => {
      const github = serverTemplates.github;

      expect(github).toBeDefined();
      expect('command' in github! && github.command).toBe('npx');
   });

   it('has filesystem template', () => {
      expect(serverTemplates.filesystem).toBeDefined();
   });

   it('has postgres template', () => {
      const postgres = serverTemplates.postgres;

      expect(postgres).toBeDefined();
      expect('env' in postgres! && postgres.env?.DATABASE_URL).toBe('${DATABASE_URL}');
   });
});

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
   it('creates config from template', () => {
      const config = createFromTemplate('github');

      expect('command' in config && config.command).toBe('npx');
   });

   it('applies overrides', () => {
      const config = createFromTemplate('github', { args: ['--custom'] });

      expect('args' in config && config.args).toEqual(['--custom']);
   });

   it('throws for unknown template', () => {
      expect(() => createFromTemplate('unknown')).toThrow('Unknown server template: unknown');
   });
});
