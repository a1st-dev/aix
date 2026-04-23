/**
 * Check if the current environment is a CI environment.
 * Uses the is-in-ci package for reliable detection across CI providers.
 */
import { getRuntimeAdapter } from '../runtime/index.js';

export async function isCI(): Promise<boolean> {
   try {
      const { default: isInCI } = await import('is-in-ci');

      return isInCI;
   } catch {
      const { env } = getRuntimeAdapter().process;

      // Fallback to basic CI detection if package not available
      return Boolean(
         env.CI ||
            env.CONTINUOUS_INTEGRATION ||
            env.GITHUB_ACTIONS ||
            env.GITLAB_CI ||
            env.CIRCLECI ||
            env.TRAVIS ||
            env.JENKINS_URL ||
            env.BUILDKITE,
      );
   }
}
