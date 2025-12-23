/**
 * Check if the current environment is a CI environment.
 * Uses the is-in-ci package for reliable detection across CI providers.
 */
export async function isCI(): Promise<boolean> {
   try {
      const { default: isInCI } = await import('is-in-ci');

      return isInCI;
   } catch {
      // Fallback to basic CI detection if package not available
      return Boolean(
         process.env.CI ||
            process.env.CONTINUOUS_INTEGRATION ||
            process.env.GITHUB_ACTIONS ||
            process.env.GITLAB_CI ||
            process.env.CIRCLECI ||
            process.env.TRAVIS ||
            process.env.JENKINS_URL ||
            process.env.BUILDKITE,
      );
   }
}
