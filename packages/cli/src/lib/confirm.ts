import { confirm } from '@inquirer/prompts';

type Fail = (message: string) => never;

/**
 * Stop before a prompt that nobody can answer. Without an interactive terminal the prompt
 * library exits with a stack trace, so fail with the non-interactive way to make the choice.
 */
export function assertInteractive(fail: Fail, alternative: string): void {
   if (!process.stdin.isTTY) {
      fail(`This command needs an answer, and there is no interactive terminal to ask on. ${alternative}`);
   }
}

/** Ask a yes/no question that defaults to no. */
export async function confirmAction(message: string, fail: Fail): Promise<boolean> {
   assertInteractive(fail, 'Pass --yes to confirm.');

   return confirm({ message, default: false });
}
