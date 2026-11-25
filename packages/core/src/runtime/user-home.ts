/**
 * Names a directory for aix to use in place of the user's home directory. Every user-scope
 * path (`~/.claude.json`, `~/.codex/config.toml`, `~/.aix/`, ...) resolves under it. Unlike
 * `HOME`, it redirects only aix, so the git and npm processes that aix spawns keep their own
 * home.
 */
export const USER_HOME_ENV_VAR = 'AIX_USER_HOME';
