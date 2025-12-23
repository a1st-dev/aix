import { describe, it, expect } from 'vitest';
import { parseSkillRef } from '../../skills/reference-parser.js';

describe('parseSkillRef', () => {
   describe('local references', () => {
      it('parses relative path starting with ./', () => {
         const ref = parseSkillRef('my-skill', './skills/my-skill');

         expect(ref).toEqual({ type: 'local', path: './skills/my-skill' });
      });

      it('parses relative path starting with ../', () => {
         const ref = parseSkillRef('my-skill', '../shared/skills/my-skill');

         expect(ref).toEqual({ type: 'local', path: '../shared/skills/my-skill' });
      });

      it('parses absolute path', () => {
         const ref = parseSkillRef('my-skill', '/home/user/skills/my-skill');

         expect(ref).toEqual({ type: 'local', path: '/home/user/skills/my-skill' });
      });

      it('parses object with path property', () => {
         const ref = parseSkillRef('my-skill', { path: './local/skill' });

         expect(ref).toEqual({ type: 'local', path: './local/skill' });
      });
   });

   describe('git references', () => {
      it('parses github shorthand', () => {
         const ref = parseSkillRef('typescript', 'github:a1st/aix-skill-typescript');

         expect(ref).toEqual({
            type: 'git',
            url: 'https://github.com/a1st/aix-skill-typescript',
            ref: undefined,
            path: undefined,
         });
      });

      it('parses github shorthand with ref', () => {
         const ref = parseSkillRef('react', 'github:a1st/aix-skill-react#v2.0.0');

         expect(ref).toEqual({
            type: 'git',
            url: 'https://github.com/a1st/aix-skill-react',
            ref: 'v2.0.0',
            path: undefined,
         });
      });

      it('parses github shorthand with subdirectory in repo path', () => {
         const ref = parseSkillRef('vue', 'github:a1st/skills/packages/vue');

         expect(ref).toEqual({
            type: 'git',
            url: 'https://github.com/a1st/skills',
            ref: undefined,
            path: 'packages/vue',
         });
      });

      it('parses github shorthand with ref and path after colon', () => {
         const ref = parseSkillRef(
            'tdd',
            'github:obra/superpowers#main:skills/testing/test-driven-development',
         );

         expect(ref).toEqual({
            type: 'git',
            url: 'https://github.com/obra/superpowers',
            ref: 'main',
            path: 'skills/testing/test-driven-development',
         });
      });

      it('parses gitlab shorthand with ref and path after colon', () => {
         const ref = parseSkillRef('debug', 'gitlab:company/skills#v1.0:debugging/systematic');

         expect(ref).toEqual({
            type: 'git',
            url: 'https://gitlab.com/company/skills',
            ref: 'v1.0',
            path: 'debugging/systematic',
         });
      });

      it('parses gitlab shorthand', () => {
         const ref = parseSkillRef('python', 'gitlab:company/aix-skill-python');

         expect(ref).toEqual({
            type: 'git',
            url: 'https://gitlab.com/company/aix-skill-python',
            ref: undefined,
            path: undefined,
         });
      });

      it('parses git object with url', () => {
         const ref = parseSkillRef('custom', {
            git: 'https://github.com/user/repo',
            ref: 'v1.0.0',
            path: 'skills/ts',
         });

         expect(ref).toEqual({
            type: 'git',
            url: 'https://github.com/user/repo',
            ref: 'v1.0.0',
            path: 'skills/ts',
         });
      });

      it('parses git object without optional fields', () => {
         const ref = parseSkillRef('minimal', {
            git: 'https://gitlab.company.com/team/skill-repo',
         });

         expect(ref).toEqual({
            type: 'git',
            url: 'https://gitlab.company.com/team/skill-repo',
            ref: undefined,
            path: undefined,
         });
      });
   });

   describe('npm references', () => {
      it('parses aix-skill-* package name', () => {
         const ref = parseSkillRef('typescript', 'aix-skill-typescript');

         expect(ref).toEqual({ type: 'npm', packageName: 'aix-skill-typescript' });
      });

      it('parses scoped package name', () => {
         const ref = parseSkillRef('react', '@a1st/aix-skill-react');

         expect(ref).toEqual({ type: 'npm', packageName: '@a1st/aix-skill-react' });
      });

      it('parses npm object with version', () => {
         const ref = parseSkillRef('vue', { npm: 'aix-skill-vue', version: '^2.0.0' });

         expect(ref).toEqual({
            type: 'npm',
            packageName: 'aix-skill-vue',
            version: '^2.0.0',
         });
      });

      it('parses simple package name without aix-skill prefix', () => {
         const ref = parseSkillRef('lodash', 'lodash');

         expect(ref).toEqual({ type: 'npm', packageName: 'lodash' });
      });

      it('parses npm object with path (subpath)', () => {
         const ref = parseSkillRef('tdd', { npm: '@a1st/skills', path: 'skills/tdd' });

         expect(ref).toEqual({
            type: 'npm',
            packageName: '@a1st/skills',
            path: 'skills/tdd',
         });
      });

      it('parses npm object with path and version', () => {
         const ref = parseSkillRef('debug', {
            npm: '@company/tools',
            path: 'skills/debug',
            version: '^1.0.0',
         });

         expect(ref).toEqual({
            type: 'npm',
            packageName: '@company/tools',
            path: 'skills/debug',
            version: '^1.0.0',
         });
      });

      it('parses scoped package with subpath and file extension', () => {
         const ref = parseSkillRef('style', '@company/rules/rules/style.md');

         expect(ref).toEqual({
            type: 'npm',
            packageName: '@company/rules',
            path: 'rules/style.md',
         });
      });

      it('parses unscoped package with subpath and file extension', () => {
         const ref = parseSkillRef('review', 'my-prompts/prompts/review.md');

         expect(ref).toEqual({
            type: 'npm',
            packageName: 'my-prompts',
            path: 'prompts/review.md',
         });
      });

      it('does not parse subpath without file extension as npm with path', () => {
         // Without extension, "pkg/subpath" is ambiguous - could be git shorthand attempt
         // This should fail since it's not a valid git shorthand and not a valid npm with extension
         expect(() => parseSkillRef('ambiguous', 'some-pkg/subpath/dir')).toThrow();
      });
   });

   describe('source wrapper', () => {
      it('unwraps source property', () => {
         const ref = parseSkillRef('wrapped', {
            source: 'github:user/repo',
            enabled: true,
         });

         expect(ref).toEqual({
            type: 'git',
            url: 'https://github.com/user/repo',
            ref: undefined,
            path: undefined,
         });
      });
   });

   describe('error cases', () => {
      it('throws for disabled skill (false)', () => {
         expect(() => parseSkillRef('disabled', false)).toThrow('disabled');
      });

      it('throws for invalid input', () => {
         expect(() => parseSkillRef('invalid', { unknown: 'value' })).toThrow('Invalid skill reference');
      });

      it('throws for null input', () => {
         expect(() => parseSkillRef('null', null)).toThrow('Invalid skill reference');
      });
   });
});
