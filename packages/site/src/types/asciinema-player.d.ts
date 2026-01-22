declare module 'asciinema-player' {
   export interface AsciinemaPlayerOptions {
      autoPlay?: boolean;
      loop?: boolean | number;
      preload?: boolean;
      controls?: boolean | 'auto';
      fit?: 'width' | 'height' | 'both' | false | 'none';
      cols?: number;
      rows?: number;
      terminalFontSize?: string;
      startAt?: number;
      speed?: number;
      idleTimeLimit?: number;
      poster?: string;
      theme?: string;
   }

   export const create: (src: string, element: HTMLElement, options?: AsciinemaPlayerOptions) => unknown;
}
