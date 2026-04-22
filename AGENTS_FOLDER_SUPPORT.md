# .agents support across aix editors

Research date: 2026-04-22

This covers the editors currently supported by aix: Claude Code, Cursor, GitHub Copilot, Windsurf, Codex, Gemini, and Zed.

I treated ".agents folder standard" as the shared Agent Skills convention, mainly `.agents/skills/<skill-name>/SKILL.md`. `AGENTS.md` is related, but it is a Markdown instruction file, not a subfolder of `.agents`.

## Baseline standards

Agent Skills are directories with a required `SKILL.md` file. The public Agent Skills spec defines optional `scripts/`, `references/`, and `assets/` directories, plus required `name` and `description` frontmatter fields. It also documents optional `license`, `compatibility`, `metadata`, and experimental `allowed-tools` fields. [Source][agent-skills-spec]

`AGENTS.md` is a separate open format for repo instructions. The public site describes it as a predictable place for coding-agent instructions, recommends putting it at the repo root, and also describes nested `AGENTS.md` files for monorepos. [Source][agents-md]

## Summary

| Editor         | `.agents/` folder support | `AGENTS.md` support | Evidence                                                                                                                                                                                                                                                                                                                                                                           |
| -------------- | ------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex          | Yes                       | Yes                 | Codex reads `.agents/skills` from repo, user, admin, and system locations, and has official `AGENTS.md` discovery docs. [Skills][codex-skills] [AGENTS.md][codex-agents-md]                                                                                                                                                                                                        |
| Gemini         | Yes                       | Yes                 | Gemini CLI supports `.agents/skills` as an alias for `.gemini/skills`. `AGENTS.md` can be used through `context.fileName`, though `GEMINI.md` remains the default. [Skills][gemini-skills] [Config][gemini-config]                                                                                                                                                                 |
| GitHub Copilot | Yes                       | Yes                 | Copilot lists `.agents/skills` as a project and personal skill location, and its repo instructions docs support one or more `AGENTS.md` files. [Skills][copilot-skills] [Instructions][copilot-repo-instructions]                                                                                                                                                                  |
| Windsurf       | Yes                       | Yes                 | Windsurf discovers `.agents/skills`, and its Cascade docs describe native `AGENTS.md` discovery and directory scoping. [Skills][windsurf-skills] [AGENTS.md][windsurf-agents-md]                                                                                                                                                                                                   |
| Cursor         | Yes                       | Yes                 | Cursor's blog says it supports the Agent Skills open standard. Its rules docs support root-level `AGENTS.md`. The `.agents/skills` directory list is visible in Cursor forum excerpts of the docs, but I could not fetch a canonical Cursor docs page for that path through the search tool. [Blog][cursor-skills-blog] [Rules][cursor-rules] [Forum excerpt][cursor-forum-skills] |
| Claude Code    | No                        | No                  | Claude Code supports Agent Skills, but the documented paths are `.claude/skills`, `~/.claude/skills`, plugin skills, and managed skills. Its instruction file is `CLAUDE.md`, not `AGENTS.md`. [Skills][claude-skills]                                                                                                                                                             |
| Zed            | No                        | Yes                 | Zed supports `AGENTS.md` as one of several compatible rules filenames. Its docs do not document Agent Skills or `.agents/skills`. [Rules][zed-rules]                                                                                                                                                                                                                               |

## Editor details

### Codex

Status: yes for `.agents/`, yes for `AGENTS.md`.

Codex reads skills from repository, user, admin, and bundled system locations. For repositories, it scans `.agents/skills` from the current working directory up to the repo root. It also reads `$HOME/.agents/skills`, `/etc/codex/skills`, and bundled OpenAI system skills. [Source][codex-skills]

Supported skill contents:

- `SKILL.md` with `name` and `description`
- optional `scripts/`
- optional `references/`
- optional `assets/`
- optional `agents/openai.yaml` for Codex app metadata, invocation policy, and tool dependencies

Codex can activate a skill explicitly through `/skills` or `$skill-name`, or implicitly when the task matches the skill description. [Source][codex-skills]

Codex also has first-party `AGENTS.md` support. It reads global guidance from the Codex home directory, then project guidance from the repo root down to the current working directory. Files closer to the current directory override earlier guidance because they appear later in the combined prompt. [Source][codex-agents-md]

### Gemini

Status: yes for `.agents/`, yes for `AGENTS.md` through configuration.

Gemini CLI supports `.agents/skills` as an alias for `.gemini/skills`.

Supported locations:

- workspace: `.gemini/skills/` or `.agents/skills/`
- user: `~/.gemini/skills/` or `~/.agents/skills/`
- extension skills bundled inside installed extensions

Precedence is Workspace > User > Extension. Within the same tier, `.agents/skills` takes precedence over `.gemini/skills`. [Source][gemini-skills]

Gemini discovers skill metadata at session start. When it decides a skill is relevant, it calls `activate_skill`, asks for consent, then loads the `SKILL.md` body and folder structure into the conversation and grants access to bundled assets. [Source][gemini-skills]

Gemini's default context filename is `GEMINI.md`, but `context.fileName` can be a string or array of strings. That means `AGENTS.md` is supported when configured as a context filename. The AGENTS.md site also shows this configuration pattern for Gemini CLI. [Gemini config][gemini-config] [AGENTS.md FAQ][agents-md]

Gemini extensions can also include `agents/` sub-agent definitions and `policies/` policy files inside the extension root. These are extension features, not `.agents/` folder features. [Source][gemini-extension-reference]

### GitHub Copilot

Status: yes for `.agents/`, yes for `AGENTS.md`.

GitHub Copilot supports Agent Skills in project and personal locations. The documented project paths are `.github/skills`, `.claude/skills`, and `.agents/skills`. The documented personal paths are `~/.copilot/skills`, `~/.claude/skills`, and `~/.agents/skills`. [Source][copilot-skills]

Supported skill contents are described as folders of instructions, scripts, and resources. [Source][copilot-skills]

Copilot coding agent supports one or more `AGENTS.md` files anywhere in the repo. The nearest file in the directory tree takes precedence. A single root `CLAUDE.md` or `GEMINI.md` can also be used instead. [Source][copilot-repo-instructions]

Other Copilot customization paths are not `.agents` paths:

- custom agents: `.github/agents/AGENT-NAME.md`
- hooks: `.github/hooks/*.json`
- prompts: `.github/prompts/*.prompt.md`

Those paths come from GitHub's Copilot customization cheat sheet. [Source][copilot-cheat-sheet]

### Windsurf

Status: yes for `.agents/`, yes for `AGENTS.md`.

Windsurf's native skill locations are `.windsurf/skills/` and `~/.codeium/windsurf/skills/`. For cross-agent compatibility, Windsurf also discovers `.agents/skills/` and `~/.agents/skills/`. [Source][windsurf-skills]

Each skill requires a `SKILL.md` file with YAML frontmatter containing `name` and `description`. Supporting files can live beside `SKILL.md`; Windsurf's examples include checklists, rollback docs, config templates, shell scripts, and CI config files. [Source][windsurf-skills]

Invocation:

- automatic when the request matches the skill description
- manual with `@skill-name`

Windsurf automatically discovers `AGENTS.md` and `agents.md` files in the workspace. A root file becomes an always-on rule, and subdirectory files become scoped rules for that directory tree. [Source][windsurf-agents-md]

### Cursor

Status: yes for `.agents/`, yes for `AGENTS.md`.

Cursor's official blog says Cursor supports the Agent Skills open standard and describes dynamic context loading, scripts, and reusable skills. [Source][cursor-skills-blog]

Cursor's rules docs support `AGENTS.md` as a plain Markdown alternative to `.cursor/rules`, with current limitations: root-level only, no scoping, and a single file. [Source][cursor-rules]

The exact `.agents/skills` path support is harder to cite cleanly. A Cursor forum thread quotes the official docs as listing these skill directories:

- `.agents/skills/` for project-level skills
- `.cursor/skills/` for project-level skills
- `~/.agents/skills/` for user-level skills
- `~/.cursor/skills/` for user-level skills

That same thread is about skill discovery not working as expected, so treat Cursor support as real but still rough in practice. [Source][cursor-forum-skills]

Another Cursor forum thread reports Remote SSH skill-loading failures in Cursor 3.1.15. I would not build critical automation on Cursor skill discovery without testing the exact environment. [Source][cursor-remote-ssh-skills]

### Claude Code

Status: no for `.agents/`, no for `AGENTS.md`.

Claude Code supports Agent Skills, but the documented locations are Claude-specific:

- project: `.claude/skills/<skill-name>/SKILL.md`
- personal: `~/.claude/skills/<skill-name>/SKILL.md`
- plugin: `<plugin>/skills/<skill-name>/SKILL.md`
- enterprise managed skills

The same page documents nested `.claude/skills/` discovery and optional supporting files inside a skill directory. [Source][claude-skills]

Claude Code supports additional skill frontmatter such as `disable-model-invocation`, `user-invocable`, `allowed-tools`, `arguments`, `context: fork`, `agent`, and skill lifecycle hooks. [Source][claude-skills]

Other Claude Code customization paths are also Claude-specific:

- subagents: `.claude/agents/` [Source][claude-subagents]
- slash commands: `.claude/commands/`, which still work but have been merged into skills [Source][claude-slash-commands]
- memory/instructions: `CLAUDE.md` [Source][claude-memory]

I found no first-party Claude Code documentation for native `.agents/skills` or `AGENTS.md` discovery. A compatibility bridge would need to be explicit, such as symlinking `.claude/skills` to `.agents/skills`.

### Zed

Status: no for `.agents/`, yes for `AGENTS.md`.

Zed supports project rules, not Agent Skills. It auto-includes a `.rules` file at the root of a project tree, and it also supports several compatibility filenames. The first matching file in this list is used:

- `.rules`
- `.cursorrules`
- `.windsurfrules`
- `.clinerules`
- `.github/copilot-instructions.md`
- `AGENT.md`
- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`

Zed's docs also describe the Rules Library and `@rule` mentions, but they do not document `.agents/skills` or `SKILL.md` loading. [Source][zed-rules]

## Implications for aix

Editors where aix can target `.agents/skills` without losing native skill behavior:

- Codex
- Gemini
- GitHub Copilot
- Windsurf
- Cursor, after testing the specific Cursor version and environment

Editors where aix should keep using native or compatibility-specific paths:

- Claude Code: keep `.claude/skills`, or make a deliberate symlink bridge to `.agents/skills`
- Zed: keep pointer rules or generated `.rules` content; there is no native Agent Skills target

[agent-skills-spec]: https://agentskills.io/specification
[agents-md]: https://agents.md/
[codex-skills]: https://developers.openai.com/codex/skills
[codex-agents-md]: https://developers.openai.com/codex/guides/agents-md
[gemini-skills]: https://geminicli.com/docs/cli/skills/
[gemini-config]: https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md
[gemini-extension-reference]: https://geminicli.com/docs/extensions/reference/
[copilot-skills]: https://docs.github.com/en/copilot/concepts/agents/about-agent-skills
[copilot-repo-instructions]: https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions
[copilot-cheat-sheet]: https://docs.github.com/en/copilot/reference/customization-cheat-sheet
[windsurf-skills]: https://docs.windsurf.com/windsurf/cascade/skills
[windsurf-agents-md]: https://docs.windsurf.com/windsurf/cascade/agents-md
[cursor-skills-blog]: https://cursor.com/blog/dynamic-context-discovery
[cursor-rules]: https://docs.cursor.com/context/rules-for-ai
[cursor-forum-skills]: https://forum.cursor.com/t/why-agents-can-not-see-my-skills-in-cursor-skills-folder/158131
[cursor-remote-ssh-skills]: https://forum.cursor.com/t/remote-ssh-to-windows-host-all-agent-skills-fail-to-load-including-built-in-create-skill-cursor-3-1-15-macos-windows/158377
[claude-skills]: https://code.claude.com/docs/en/skills
[claude-memory]: https://docs.anthropic.com/en/docs/claude-code/memory
[claude-subagents]: https://docs.anthropic.com/en/docs/claude-code/sub-agents
[claude-slash-commands]: https://docs.anthropic.com/en/docs/claude-code/slash-commands
[zed-rules]: https://zed.dev/docs/ai/rules
