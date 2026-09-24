import { describe, it, expect } from 'vitest';
import { isFallbackClaudeMd } from '../../editors/strategies/claude-code/index.js';

describe('isFallbackClaudeMd', () => {
   it('returns true for bare @AGENTS.md pointer', () => {
      expect(isFallbackClaudeMd('@AGENTS.md')).toStrictEqual(true);
      expect(isFallbackClaudeMd('@./AGENTS.md')).toStrictEqual(true);
   });

   it('returns true for @AGENTS.md with markdown header', () => {
      const content = '# Project Instructions\n\n@AGENTS.md\n';

      expect(isFallbackClaudeMd(content)).toStrictEqual(true);
   });

   it('returns true for CLAUDE.md title with link to AGENTS.md', () => {
      const content = '# CLAUDE.md\n\nRead and apply [AGENTS.md](./AGENTS.md).\n';

      expect(isFallbackClaudeMd(content)).toStrictEqual(true);
   });

   it('returns true for HTML comments wrapping a fallback reference', () => {
      const content = '<!-- Auto-generated -->\n# Instructions\n\nSee AGENTS.md\n<!-- footer -->';

      expect(isFallbackClaudeMd(content)).toStrictEqual(true);
   });

   it('returns false for empty content', () => {
      expect(isFallbackClaudeMd('')).toStrictEqual(false);
      expect(isFallbackClaudeMd('   \n  \n')).toStrictEqual(false);
   });

   it('returns false when other substantive instructions exist', () => {
      const content = '# Project Instructions\n\n@AGENTS.md\n\n## Build & Test\nRun npm test\n';

      expect(isFallbackClaudeMd(content)).toStrictEqual(false);
   });

   it('returns false for files without any AGENTS.md reference', () => {
      const content = '# Instructions\n\nAlways write unit tests.\n';

      expect(isFallbackClaudeMd(content)).toStrictEqual(false);
   });
});
