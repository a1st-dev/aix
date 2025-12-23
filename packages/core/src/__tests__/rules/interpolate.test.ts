import { describe, it, expect } from 'vitest';
import {
   interpolateRule,
   interpolateRules,
   hasUnresolvedVariables,
   extractVariableNames,
} from '../../rules/interpolate.js';

describe('interpolateRule', () => {
   const context = {
      project: {
         name: 'my-project',
         version: '1.0.0',
         description: 'A test project',
      },
      editor: 'windsurf',
      env: {
         NODE_ENV: 'development',
      },
      custom: {
         team: 'frontend',
      },
   };

   it('interpolates project variables', () => {
      const result = interpolateRule('Project: {{project.name}}', context);

      expect(result).toBe('Project: my-project');
   });

   it('interpolates nested variables', () => {
      const result = interpolateRule('Version: {{project.version}}', context);

      expect(result).toBe('Version: 1.0.0');
   });

   it('interpolates editor variable', () => {
      const result = interpolateRule('Editor: {{editor}}', context);

      expect(result).toBe('Editor: windsurf');
   });

   it('interpolates env variables', () => {
      const result = interpolateRule('Env: {{env.NODE_ENV}}', context);

      expect(result).toBe('Env: development');
   });

   it('interpolates custom variables', () => {
      const result = interpolateRule('Team: {{custom.team}}', context);

      expect(result).toBe('Team: frontend');
   });

   it('interpolates multiple variables', () => {
      const result = interpolateRule('{{project.name}} v{{project.version}} for {{editor}}', context);

      expect(result).toBe('my-project v1.0.0 for windsurf');
   });

   it('leaves unknown variables unchanged', () => {
      const result = interpolateRule('Unknown: {{unknown.var}}', context);

      expect(result).toBe('Unknown: {{unknown.var}}');
   });

   it('handles content with no variables', () => {
      const result = interpolateRule('No variables here', context);

      expect(result).toBe('No variables here');
   });
});

describe('interpolateRules', () => {
   const context = {
      project: { name: 'test' },
      editor: 'cursor',
      env: {},
      custom: {},
   };

   it('interpolates multiple rules', () => {
      const rules = ['Project: {{project.name}}', 'Editor: {{editor}}'];
      const results = interpolateRules(rules, context);

      expect(results).toEqual(['Project: test', 'Editor: cursor']);
   });
});

describe('hasUnresolvedVariables', () => {
   it('returns true for content with variables', () => {
      expect(hasUnresolvedVariables('{{project.name}}')).toBe(true);
   });

   it('returns false for content without variables', () => {
      expect(hasUnresolvedVariables('No variables')).toBe(false);
   });

   it('returns true for partial variable syntax', () => {
      expect(hasUnresolvedVariables('prefix {{var}} suffix')).toBe(true);
   });
});

describe('extractVariableNames', () => {
   it('extracts single variable name', () => {
      expect(extractVariableNames('{{project.name}}')).toEqual(['project.name']);
   });

   it('extracts multiple variable names', () => {
      expect(extractVariableNames('{{project.name}} and {{editor}}')).toEqual([
         'project.name',
         'editor',
      ]);
   });

   it('returns empty array for no variables', () => {
      expect(extractVariableNames('no vars')).toEqual([]);
   });
});
