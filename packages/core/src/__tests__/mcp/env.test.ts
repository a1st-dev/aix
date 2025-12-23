import { describe, it, expect } from 'vitest';
import {
   resolveEnvVars,
   resolveEnvObject,
   hasUnresolvedEnvVars,
   extractEnvVarNames,
   validateEnvVars,
} from '../../mcp/env.js';

describe('resolveEnvVars', () => {
   it('resolves single env var', () => {
      const result = resolveEnvVars('${FOO}', { env: { FOO: 'bar' } });

      expect(result).toBe('bar');
   });

   it('resolves multiple env vars', () => {
      const result = resolveEnvVars('${FOO}-${BAR}', { env: { FOO: 'hello', BAR: 'world' } });

      expect(result).toBe('hello-world');
   });

   it('leaves unresolved vars when throwOnMissing is false', () => {
      const result = resolveEnvVars('${MISSING}', { env: {} });

      expect(result).toBe('${MISSING}');
   });

   it('throws when throwOnMissing is true and var is missing', () => {
      expect(() => resolveEnvVars('${MISSING}', { env: {}, throwOnMissing: true })).toThrow(
         'Environment variable not found: MISSING',
      );
   });

   it('handles mixed resolved and unresolved vars', () => {
      const result = resolveEnvVars('${FOO}-${MISSING}', { env: { FOO: 'bar' } });

      expect(result).toBe('bar-${MISSING}');
   });

   it('handles string with no env vars', () => {
      const result = resolveEnvVars('no vars here', { env: {} });

      expect(result).toBe('no vars here');
   });

   it('handles empty string', () => {
      const result = resolveEnvVars('', { env: {} });

      expect(result).toBe('');
   });
});

describe('resolveEnvObject', () => {
   it('resolves all values in object', () => {
      const result = resolveEnvObject(
         { key1: '${FOO}', key2: '${BAR}' },
         { env: { FOO: 'foo', BAR: 'bar' } },
      );

      expect(result).toEqual({ key1: 'foo', key2: 'bar' });
   });

   it('preserves keys', () => {
      const result = resolveEnvObject({ 'my-key': '${VAL}' }, { env: { VAL: 'value' } });

      expect(result).toEqual({ 'my-key': 'value' });
   });
});

describe('hasUnresolvedEnvVars', () => {
   it('returns true for string with env vars', () => {
      expect(hasUnresolvedEnvVars('${FOO}')).toBe(true);
   });

   it('returns false for string without env vars', () => {
      expect(hasUnresolvedEnvVars('no vars')).toBe(false);
   });

   it('returns true for partial env var syntax', () => {
      expect(hasUnresolvedEnvVars('prefix ${VAR} suffix')).toBe(true);
   });
});

describe('extractEnvVarNames', () => {
   it('extracts single var name', () => {
      expect(extractEnvVarNames('${FOO}')).toEqual(['FOO']);
   });

   it('extracts multiple var names', () => {
      expect(extractEnvVarNames('${FOO} and ${BAR}')).toEqual(['FOO', 'BAR']);
   });

   it('returns empty array for no vars', () => {
      expect(extractEnvVarNames('no vars')).toEqual([]);
   });

   it('handles duplicate var names', () => {
      expect(extractEnvVarNames('${FOO} ${FOO}')).toEqual(['FOO', 'FOO']);
   });
});

describe('validateEnvVars', () => {
   it('returns valid when all vars are defined', () => {
      const result = validateEnvVars('${FOO}', { FOO: 'bar' });

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
   });

   it('returns invalid with missing vars', () => {
      const result = validateEnvVars('${FOO} ${BAR}', { FOO: 'bar' });

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['BAR']);
   });

   it('returns valid for string with no vars', () => {
      const result = validateEnvVars('no vars', {});

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
   });
});
