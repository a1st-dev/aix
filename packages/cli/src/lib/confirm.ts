import { confirm } from '@inquirer/prompts';

/**
 * Ask a yes/no question that defaults to no. With no interactive terminal there is nobody to
 * answer and the prompt library exits with a stack trace, so fail with the way out instead.
 */
export async function confirmAction(message: string, fail: (message: string) => never): Promise<boolean> {
   if (!process.stdin.isTTY) {
      fail('This command asks for confirmation, and there is no interactive terminal to ask on. Pass --yes to confirm.');
   }

   return confirm({ message, default: false });
}
