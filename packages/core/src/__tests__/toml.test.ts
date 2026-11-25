import { describe, expect, it } from 'vitest';
import { parseToml, updateToml } from '../toml.js';

const HAND_WRITTEN = [
   '# My config',
   'model = "gpt-5"          # the model I like',
   '',
   '# Servers I maintain by hand',
   '[mcp_servers.existing]',
   'command = "node"',
   'args = ["existing.js"]   # keep this',
   '',
].join('\n');

describe('updateToml', () => {
   it('appends a new sub-table as its own section and leaves every existing line as it was', () => {
      const value = {
               model: 'gpt-5',
               mcp_servers: {
                  existing: { command: 'node', args: [ 'existing.js' ] },
                  added: { command: 'added-cmd', env: { TOKEN: 'abc' } },
               },
            },
            updated = updateToml(HAND_WRITTEN, value);

      expect(updated.startsWith(HAND_WRITTEN)).toStrictEqual(true);
      expect(updated).toContain('[mcp_servers.added]\ncommand = "added-cmd"');
      expect(updated).toContain('[mcp_servers.added.env]\nTOKEN = "abc"');
      expect(parseToml(updated)).toEqual(value);
   });

   it('returns the document unchanged when the value is unchanged', () => {
      expect(updateToml(HAND_WRITTEN, parseToml(HAND_WRITTEN))).toStrictEqual(HAND_WRITTEN);
   });

   it('changes one value in place and keeps the comment beside it', () => {
      const value = parseToml(HAND_WRITTEN);

      value.model = 'gpt-6';

      expect(updateToml(HAND_WRITTEN, value)).toContain('model = "gpt-6"          # the model I like');
   });

   it('removes a sub-table without disturbing the rest', () => {
      const withTwo = `${HAND_WRITTEN}\n[mcp_servers.other]\ncommand = "other"\n`,
            value = parseToml(withTwo);

      value.mcp_servers = { existing: { command: 'node', args: [ 'existing.js' ] } };

      const updated = updateToml(withTwo, value);

      expect(updated).not.toContain('other');
      expect(updated).toContain('args = ["existing.js"]   # keep this');
   });

   it('adds to a table that is written inline without appending a section that would be invalid', () => {
      const inline = 'mcp_servers = { existing = { command = "node" } }\n',
            value = { mcp_servers: { existing: { command: 'node' }, added: { command: 'added-cmd' } } };

      expect(parseToml(updateToml(inline, value))).toEqual(value);
   });

   it('does not repeat an explicit parent header when appending a section', () => {
      const explicit = '[mcp_servers]\n\n[mcp_servers.existing]\ncommand = "node"\n',
            value = { mcp_servers: { existing: { command: 'node' }, added: { command: 'added-cmd' } } },
            updated = updateToml(explicit, value);

      expect(updated.match(/^\[mcp_servers\]$/gm)).toHaveLength(1);
      expect(parseToml(updated)).toEqual(value);
   });

   it.each([ null, '', '  \n' ])('writes a new document when there is nothing to update (%j)', (existing) => {
      const value = { mcp_servers: { added: { command: 'added-cmd' } } };

      expect(parseToml(updateToml(existing, value))).toEqual(value);
   });
});

describe('parseToml', () => {
   it('reports a syntax error instead of returning a partial document', () => {
      expect(() => {
         return parseToml('args = [ "unfinished"\n');
      }).toThrow();
   });
});
