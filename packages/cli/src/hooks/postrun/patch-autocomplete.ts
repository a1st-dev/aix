import { Hook } from '@oclif/core';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Post-run hook that patches autocomplete scripts to enable file path completion.
 *
 * The @oclif/plugin-autocomplete generates shell completion scripts that handle
 * command and flag completion, but don't properly defer to shell file completion
 * for arguments. This hook patches the generated scripts after the `autocomplete`
 * command runs.
 *
 * Fixes:
 * - Bash: Adds `-o default` to `complete` command to fall back to file completion
 * - Zsh: Already has `_files` fallback (no patch needed)
 *
 * Note: Fish is not currently supported by @oclif/plugin-autocomplete.
 */
const hook: Hook.Postrun = async function (options) {
   // Only run after autocomplete commands
   if (!options.Command?.id?.startsWith('autocomplete')) {
      return;
   }

   const cacheDir = options.config.cacheDir,
         autocompleteDir = join(cacheDir, 'autocomplete'),
         cliBin = options.config.bin;

   // Patch bash completion
   await patchBashCompletion(autocompleteDir, cliBin);
};

/**
 * Patches bash completion script to use `-o default` flag.
 * This tells bash to fall back to default (file) completion when the function
 * returns no results.
 */
async function patchBashCompletion(autocompleteDir: string, cliBin: string): Promise<void> {
   const bashScriptPath = join(autocompleteDir, 'functions', 'bash', `${cliBin}.bash`);

   if (!existsSync(bashScriptPath)) {
      return;
   }

   let content = await readFile(bashScriptPath, 'utf8');

   // Check if already patched
   if (content.includes('-o default')) {
      return;
   }

   // Replace `complete -F _<bin>_autocomplete <bin>` with `complete -o default -F ...`
   // This pattern handles both the main binary and any aliases
   const completePattern = /complete -F (_\w+_autocomplete) (\S+)/g;

   content = content.replace(completePattern, 'complete -o default -F $1 $2');

   await writeFile(bashScriptPath, content, 'utf8');
}

export default hook;
