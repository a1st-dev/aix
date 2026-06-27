import { WindsurfAdapter } from './windsurf.js';

/**
 * Devin Desktop editor adapter. Devin Desktop is the rebranded version of Windsurf.
 * It shares the same configuration format and directory structures as Windsurf.
 */
export class DevinDesktopAdapter extends WindsurfAdapter {
   override readonly name = 'devin-desktop' as const;
}
