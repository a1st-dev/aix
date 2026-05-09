import { NoPromptsStrategy } from '../shared/no-prompts.js';

/**
 * Zed prompts strategy. Zed uses a Rules Library UI, not file-based prompts.
 * Prompts are not supported in Zed at this time.
 */
export class ZedPromptsStrategy extends NoPromptsStrategy {}
