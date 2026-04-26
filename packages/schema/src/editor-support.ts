export const supportedEditorNames = [
   'cursor',
   'copilot',
   'claude-code',
   'windsurf',
   'zed',
   'codex',
   'gemini',
   'opencode',
] as const;

export type SupportedEditorName = (typeof supportedEditorNames)[number];

export const editorSupportStatuses = [ 'native', 'shim', 'unsupported' ] as const;

export type EditorSupportStatus = (typeof editorSupportStatuses)[number];

export const editorFeatureKinds = [ 'managed', 'compatibility' ] as const;

export type EditorFeatureKind = (typeof editorFeatureKinds)[number];

export const editorFeatureDefinitions = [
   {
      id: 'rules',
      label: 'Rules',
      kind: 'managed',
      shortDescription: 'Instruction files that shape editor behavior.',
   },
   {
      id: 'prompts',
      label: 'Prompts',
      kind: 'managed',
      shortDescription: 'Slash-command or workflow prompts.',
   },
   {
      id: 'mcp',
      label: 'MCP',
      kind: 'managed',
      shortDescription: 'Model Context Protocol server configuration.',
   },
   {
      id: 'skills',
      label: 'Skills',
      kind: 'managed',
      shortDescription: 'Reusable agent workflows or skill bundles.',
   },
   {
      id: 'hooks',
      label: 'Hooks',
      kind: 'managed',
      shortDescription: 'Lifecycle hooks that run commands around editor events.',
   },
   {
      id: 'agents-md',
      label: 'AGENTS.md',
      kind: 'compatibility',
      shortDescription: 'Compatibility with AGENTS.md-style repository instructions.',
   },
   {
      id: 'agents-dir',
      label: '.agents/skills',
      kind: 'compatibility',
      shortDescription: 'Compatibility with the Agent Skills folder convention.',
   },
] as const satisfies readonly {
   id: string;
   label: string;
   kind: EditorFeatureKind;
   shortDescription: string;
}[];

export type EditorFeatureId = (typeof editorFeatureDefinitions)[number]['id'];

export interface EditorScopeSupport {
   status: EditorSupportStatus;
   path?: string;
   note?: string;
   editorSupported?: boolean;
   editorPath?: string;
   editorNote?: string;
}

export interface EditorFeatureSupport {
   id: EditorFeatureId;
   summary: EditorSupportStatus;
   terminology: string;
   implementation: string;
   project: EditorScopeSupport;
   user: EditorScopeSupport;
   supportedValues?: readonly string[];
   notes?: readonly string[];
}

export interface EditorTerminologyMapping {
   featureId: EditorFeatureId;
   aixTerm: string;
   editorTerm: string;
}

export interface EditorSupportProfile {
   id: SupportedEditorName;
   name: string;
   summary: string;
   migrationPitch: string;
   notes: readonly string[];
   terminology: readonly EditorTerminologyMapping[];
   features: Record<EditorFeatureId, EditorFeatureSupport>;
}

export interface OrderedEditorPair {
   from: SupportedEditorName;
   to: SupportedEditorName;
}

interface ScopeDetails {
   editorSupported?: boolean;
   editorPath?: string;
   editorNote?: string;
}

function nativeScope(path?: string, note?: string, details: ScopeDetails = {}): EditorScopeSupport {
   return {
      status: 'native',
      path,
      note,
      editorSupported: details.editorSupported ?? true,
      editorPath: details.editorPath,
      editorNote: details.editorNote,
   };
}

function shimScope(path?: string, note?: string, details: ScopeDetails = {}): EditorScopeSupport {
   return {
      status: 'shim',
      path,
      note,
      editorSupported: details.editorSupported ?? true,
      editorPath: details.editorPath,
      editorNote: details.editorNote,
   };
}

function unsupportedScope(note?: string, details: ScopeDetails = {}): EditorScopeSupport {
   return {
      status: 'unsupported',
      note,
      editorSupported: details.editorSupported ?? false,
      editorPath: details.editorPath,
      editorNote: details.editorNote,
   };
}

interface FeatureOptions {
   id: EditorFeatureId;
   summary: EditorSupportStatus;
   terminology: string;
   implementation: string;
   project: EditorScopeSupport;
   user: EditorScopeSupport;
   supportedValues?: readonly string[];
   notes?: readonly string[];
}

function feature(
   optionsOrId: FeatureOptions | EditorFeatureId,
   ...rest: unknown[]
): EditorFeatureSupport {
   const options = typeof optionsOrId === 'string'
      ? {
         id: optionsOrId,
         summary: rest[0] as EditorSupportStatus,
         terminology: rest[1] as string,
         implementation: rest[2] as string,
         project: rest[3] as EditorScopeSupport,
         user: rest[4] as EditorScopeSupport,
         supportedValues: (rest[5] as FeatureOptions | undefined)?.supportedValues,
         notes: (rest[5] as FeatureOptions | undefined)?.notes,
      }
      : optionsOrId;

   return {
      id: options.id,
      summary: options.summary,
      terminology: options.terminology,
      implementation: options.implementation,
      project: options.project,
      user: options.user,
      supportedValues: options.supportedValues,
      notes: options.notes,
   };
}

export const editorSupportProfiles = [
   {
      id: 'cursor',
      name: 'Cursor',
      summary: 'Native rules, commands, MCP, skills, and hooks with project-first config files.',
      migrationPitch: 'Cursor keeps most aix features native, but rules stay project-scoped.',
      notes: [
         'Cursor prompt installs use `.cursor/commands/`, not `.cursor/prompts/`.',
         'Cursor hooks map aix event names onto Cursor-specific camelCase hook names.',
      ],
      terminology: [
         { featureId: 'prompts', aixTerm: 'Prompts', editorTerm: 'Commands' },
         { featureId: 'rules', aixTerm: 'Rules', editorTerm: 'Rules' },
      ],
      features: {
         rules: feature({
            id: 'rules',
            summary: 'native',
            terminology: 'Rules',
            implementation: 'Markdown-with-frontmatter rule files.',
            project: nativeScope('.cursor/rules/*.mdc'),
            user: unsupportedScope('aix does not currently write Cursor user rules.', {
               editorSupported: true,
               editorPath: 'Settings UI',
               editorNote: 'Cursor stores user rules in the Settings UI rather than a writable file.',
            }),
            supportedValues: [ 'alwaysApply', 'globs', 'description' ],
            notes: [ 'Cursor also reads AGENTS.md as a compatibility surface.' ],
         }),
         prompts: feature({
            id: 'prompts',
            summary: 'native',
            terminology: 'Commands',
            implementation: 'Plain markdown command files.',
            project: nativeScope('.cursor/commands/*.md'),
            user: nativeScope('~/.cursor/commands/*.md'),
         }),
         mcp: feature({
            id: 'mcp',
            summary: 'native',
            terminology: 'MCP servers',
            implementation: 'JSON `mcpServers` configuration.',
            project: nativeScope('.cursor/mcp.json'),
            user: nativeScope('~/.cursor/mcp.json'),
         }),
         skills: feature({
            id: 'skills',
            summary: 'native',
            terminology: 'Skills',
            implementation: 'Symlinked native skill directories backed by `.aix/skills/`.',
            project: nativeScope('.cursor/skills/{name}/'),
            user: nativeScope('~/.cursor/skills/{name}/'),
            notes: [ 'Cursor also discovers `.agents/skills/` for compatibility.' ],
         }),
         hooks: feature({
            id: 'hooks',
            summary: 'native',
            terminology: 'Hooks',
            implementation: 'JSON hook configuration with event-name translation.',
            project: nativeScope('.cursor/hooks.json'),
            user: nativeScope('~/.cursor/hooks.json'),
            supportedValues: [
               'sessionStart',
               'sessionEnd',
               'preToolUse',
               'postToolUse',
               'beforeReadFile',
               'beforeShellExecution',
               'afterShellExecution',
               'beforeMCPExecution',
               'afterMCPExecution',
               'afterFileEdit',
               'beforeSubmitPrompt',
               'stop',
            ],
         }),
         'agents-md': feature({
            id: 'agents-md',
            summary: 'native',
            terminology: 'AGENTS.md',
            implementation: 'Compatibility with root-level AGENTS.md instructions.',
            project: nativeScope('AGENTS.md'),
            user: unsupportedScope('Cursor does not expose a separate home-scoped AGENTS.md path in aix.'),
         }),
         'agents-dir': feature({
            id: 'agents-dir',
            summary: 'native',
            terminology: '.agents/skills',
            implementation: 'Compatibility with the shared Agent Skills folder convention.',
            project: nativeScope('.agents/skills/{name}/'),
            user: unsupportedScope('Cursor documents project-level compatibility more clearly than home scope.'),
         }),
      },
   },
   {
      id: 'copilot',
      name: 'GitHub Copilot',
      summary: 'Native rules, prompt files, hooks, and MCP with repo-root MCP config.',
      migrationPitch: 'Copilot keeps most features native, but its repo instruction surfaces differ from other editors.',
      notes: [
         'aix writes project MCP config to `.mcp.json` and still imports `.github/mcp.json` as a fallback.',
         'Copilot prompt installs use explicit frontmatter so slash commands keep the configured prompt name.',
      ],
      terminology: [
         { featureId: 'prompts', aixTerm: 'Prompts', editorTerm: 'Prompt files' },
         { featureId: 'rules', aixTerm: 'Rules', editorTerm: 'Instructions' },
      ],
      features: {
         rules: feature(
            'rules',
            'native',
            'Instructions',
            'Markdown instruction files in `.github/instructions/`.',
            nativeScope('.github/instructions/*.instructions.md'),
            unsupportedScope('aix does not yet write user-scope Copilot instructions as separate files.', {
               editorSupported: true,
               editorPath: '~/.copilot/instructions/*.instructions.md',
            }),
         ),
         prompts: feature(
            'prompts',
            'native',
            'Prompt files',
            'Markdown prompt files with YAML frontmatter.',
            nativeScope('.github/prompts/*.prompt.md'),
            nativeScope('VS Code user prompts directory'),
            {
               supportedValues: [ 'name', 'description', 'argument-hint' ],
            },
         ),
         mcp: feature(
            'mcp',
            'native',
            'MCP servers',
            'JSON `mcpServers` configuration.',
            nativeScope('.mcp.json'),
            nativeScope('~/.copilot/mcp-config.json'),
            {
               notes: [ 'Imports also fall back to `.github/mcp.json` when `.mcp.json` is absent.' ],
            },
         ),
         skills: feature(
            'skills',
            'native',
            'Skills',
            'Symlinked native skill directories backed by `.aix/skills/`.',
            nativeScope('.github/skills/{name}/'),
            nativeScope('~/.copilot/skills/{name}/'),
            {
               notes: [ 'Copilot also discovers `.agents/skills/` as a compatibility surface.' ],
            },
         ),
         hooks: feature(
            'hooks',
            'native',
            'Hooks',
            'JSON hooks with matcher-based tool routing.',
            nativeScope('.github/hooks/hooks.json'),
            nativeScope('~/.copilot/hooks/hooks.json'),
            {
               supportedValues: [
                  'preToolUse',
                  'postToolUse',
                  'sessionStart',
                  'sessionEnd',
                  'userPromptSubmitted',
                  'preCompact',
                  'subagentStart',
                  'subagentStop',
                  'stop',
               ],
            },
         ),
         'agents-md': feature(
            'agents-md',
            'native',
            'AGENTS.md',
            'Compatibility with repository AGENTS.md instructions.',
            nativeScope('AGENTS.md in the repository tree'),
            unsupportedScope('Copilot does not expose a dedicated home-scoped AGENTS.md target in aix.'),
         ),
         'agents-dir': feature(
            'agents-dir',
            'native',
            '.agents/skills',
            'Compatibility with the shared Agent Skills folder convention.',
            nativeScope('.agents/skills/{name}/'),
            nativeScope('~/.agents/skills/{name}/'),
         ),
      },
   },
   {
      id: 'claude-code',
      name: 'Claude Code',
      summary: 'Native rules, prompts, skills, MCP, and the broadest hook surface in the matrix.',
      migrationPitch: 'Claude Code is the easiest target when you need native hooks and native prompts together.',
      notes: [
         'Claude Code supports more lifecycle hook events than any other supported editor.',
         'Its native repo instruction file is `CLAUDE.md`, not `AGENTS.md`.',
      ],
      terminology: [
         { featureId: 'prompts', aixTerm: 'Prompts', editorTerm: 'Commands' },
         { featureId: 'rules', aixTerm: 'Rules', editorTerm: 'Rules' },
      ],
      features: {
         rules: feature(
            'rules',
            'native',
            'Rules',
            'Markdown rule files.',
            nativeScope('.claude/rules/*.md'),
            nativeScope('~/.claude/CLAUDE.md'),
            {
               notes: [ 'User scope is a single global memory file instead of per-rule files.' ],
            },
         ),
         prompts: feature(
            'prompts',
            'native',
            'Commands',
            'Markdown command files with YAML frontmatter.',
            nativeScope('.claude/commands/*.md'),
            nativeScope('~/.claude/commands/*.md'),
            {
               supportedValues: [ 'description', 'argument-hint' ],
            },
         ),
         mcp: feature(
            'mcp',
            'native',
            'MCP servers',
            'JSON `mcpServers` configuration.',
            nativeScope('.mcp.json'),
            nativeScope('Claude desktop config file'),
         ),
         skills: feature(
            'skills',
            'native',
            'Skills',
            'Symlinked native skill directories backed by `.aix/skills/`.',
            nativeScope('.claude/skills/{name}/'),
            nativeScope('~/.claude/skills/{name}/'),
         ),
         hooks: feature(
            'hooks',
            'native',
            'Hooks',
            'JSON hooks with PascalCase event names and matcher routing.',
            nativeScope('.claude/settings.json'),
            nativeScope('~/.claude/settings.json'),
            {
               supportedValues: [
                  'SessionStart',
                  'SessionEnd',
                  'PreToolUse',
                  'PostToolUse',
                  'UserPromptSubmit',
                  'PreCompact',
                  'PostCompact',
                  'SubagentStart',
                  'SubagentStop',
                  'TaskCreated',
                  'TaskCompleted',
                  'WorktreeCreate',
                  'Stop',
               ],
            },
         ),
         'agents-md': feature(
            'agents-md',
            'unsupported',
            'CLAUDE.md',
            'Claude Code uses `CLAUDE.md` instead of AGENTS.md.',
            unsupportedScope('Use `CLAUDE.md` for repository instructions.'),
            unsupportedScope('Use `~/.claude/CLAUDE.md` for home-scoped instructions.'),
         ),
         'agents-dir': feature(
            'agents-dir',
            'unsupported',
            '.claude/skills',
            'Claude Code uses native `.claude/skills/` directories instead of `.agents/skills/`.',
            unsupportedScope('Use `.claude/skills/` instead of `.agents/skills/`.'),
            unsupportedScope('Use `~/.claude/skills/` instead of `.agents/skills/`.'),
         ),
      },
   },
   {
      id: 'windsurf',
      name: 'Windsurf',
      summary: 'Native rules, workflows, skills, and hooks, but MCP remains global-only.',
      migrationPitch: 'Windsurf is strongest when project rules matter more than project-scoped MCP.',
      notes: [
         'Windsurf MCP installs are tracked as global state because the editor only supports global MCP today.',
         'Its prompt surface is called workflows, not commands.',
      ],
      terminology: [
         { featureId: 'prompts', aixTerm: 'Prompts', editorTerm: 'Workflows' },
         { featureId: 'rules', aixTerm: 'Rules', editorTerm: 'Rules' },
      ],
      features: {
         rules: feature(
            'rules',
            'native',
            'Rules',
            'Markdown rule files with Windsurf trigger frontmatter.',
            nativeScope('.windsurf/rules/*.md'),
            nativeScope('~/.codeium/windsurf/memories/global_rules.md'),
            {
               supportedValues: [ 'always_on', 'model_decision', 'glob', 'manual' ],
            },
         ),
         prompts: feature(
            'prompts',
            'native',
            'Workflows',
            'Markdown workflow files with YAML frontmatter.',
            nativeScope('.windsurf/workflows/*.md'),
            nativeScope('~/.codeium/windsurf/global_workflows/*.md'),
            {
               supportedValues: [ 'description' ],
            },
         ),
         mcp: feature(
            'mcp',
            'native',
            'MCP servers',
            'Global-only JSON MCP configuration.',
            unsupportedScope('Windsurf does not have a project-scoped MCP config file in aix.'),
            nativeScope('~/.codeium/windsurf/mcp_config.json'),
            {
               notes: [ 'Project-scoped syncs report MCP as a skipped global-only write.' ],
            },
         ),
         skills: feature(
            'skills',
            'native',
            'Skills',
            'Symlinked native skill directories backed by `.aix/skills/`.',
            nativeScope('.windsurf/skills/{name}/'),
            nativeScope('~/.windsurf/skills/{name}/'),
            {
               notes: [ 'Windsurf also discovers `.agents/skills/` for compatibility.' ],
            },
         ),
         hooks: feature(
            'hooks',
            'native',
            'Hooks',
            'JSON hook configuration using snake_case Windsurf event names.',
            nativeScope('.windsurf/hooks.json'),
            nativeScope('~/.windsurf/hooks.json'),
            {
               supportedValues: [
                  'pre_read_code',
                  'post_read_code',
                  'pre_write_code',
                  'post_write_code',
                  'pre_run_command',
                  'post_run_command',
                  'pre_mcp_tool_use',
                  'post_mcp_tool_use',
                  'pre_user_prompt',
                  'post_cascade_response',
                  'post_setup_worktree',
               ],
            },
         ),
         'agents-md': feature(
            'agents-md',
            'native',
            'AGENTS.md',
            'Compatibility with AGENTS.md and agents.md repository files.',
            nativeScope('AGENTS.md or agents.md in the workspace'),
            unsupportedScope('Windsurf documentation focuses on workspace files, not a home-scoped AGENTS.md.'),
         ),
         'agents-dir': feature(
            'agents-dir',
            'native',
            '.agents/skills',
            'Compatibility with the shared Agent Skills folder convention.',
            nativeScope('.agents/skills/{name}/'),
            nativeScope('~/.agents/skills/{name}/'),
         ),
      },
   },
   {
      id: 'zed',
      name: 'Zed',
      summary: 'Native rules and MCP, no native prompts, and skills are exposed through pointer rules.',
      migrationPitch: 'Zed is a good target for rules and MCP, but prompts and native skills need translation.',
      notes: [
         'Zed reads a single `.rules` file, so aix flattens all rules into one file.',
         'Zed skills are emitted as pointer rules because the editor has no native skill directory.',
      ],
      terminology: [
         { featureId: 'mcp', aixTerm: 'MCP', editorTerm: 'Context servers' },
         { featureId: 'skills', aixTerm: 'Skills', editorTerm: 'Pointer rules' },
      ],
      features: {
         rules: feature(
            'rules',
            'native',
            'Rules',
            'A single concatenated `.rules` file.',
            nativeScope('.rules'),
            unsupportedScope('aix does not have a writable user-scope `.rules` target for Zed.'),
            {
               notes: [ 'Zed also auto-detects AGENTS.md, CLAUDE.md, and other compatibility files.' ],
            },
         ),
         prompts: feature(
            'prompts',
            'unsupported',
            'Rules Library prompts',
            'Zed does not expose file-based prompt installs in aix.',
            unsupportedScope('Zed prompt installs are not supported.'),
            unsupportedScope('Zed prompt installs are not supported.'),
            {
               notes: [ 'Zed does support MCP server-side prompts, but not file-based user prompts.' ],
            },
         ),
         mcp: feature(
            'mcp',
            'native',
            'Context servers',
            'JSON `context_servers` configuration.',
            nativeScope('.zed/settings.json'),
            nativeScope('~/.config/zed/settings.json'),
         ),
         skills: feature(
            'skills',
            'shim',
            'Pointer rules',
            'Skill directories plus generated rules that point the agent at `.aix/skills/`.',
            shimScope('.rules', 'aix appends pointer rules that reference `.aix/skills/{name}/`.'),
            unsupportedScope('User-scoped Zed skills require a writable user rules file, which aix does not have.'),
         ),
         hooks: feature(
            'hooks',
            'unsupported',
            'Hooks',
            'Hooks are not supported.',
            unsupportedScope('Zed does not support lifecycle hooks in aix.'),
            unsupportedScope('Zed does not support lifecycle hooks in aix.'),
         ),
         'agents-md': feature(
            'agents-md',
            'native',
            'AGENTS.md',
            'Compatibility with AGENTS.md repository instructions.',
            nativeScope('AGENTS.md'),
            unsupportedScope('Zed compatibility is documented for workspace files, not a home-scoped AGENTS.md.'),
         ),
         'agents-dir': feature(
            'agents-dir',
            'unsupported',
            '.agents/skills',
            'Zed does not document native `.agents/skills/` discovery.',
            unsupportedScope('aix uses pointer rules instead of `.agents/skills/`.'),
            unsupportedScope('aix uses pointer rules instead of `.agents/skills/`.'),
         ),
      },
   },
   {
      id: 'codex',
      name: 'Codex',
      summary: 'Rules and skills are native, prompts become skills, and aix still treats MCP as global-only.',
      migrationPitch: 'Codex is strongest when AGENTS.md and Agent Skills are the destination format you want.',
      notes: [
         'Codex prompts are converted into skills because aix no longer writes native prompt files for Codex.',
         'Codex upstream supports project-scoped MCP config, but aix still manages the global file today.',
      ],
      terminology: [
         { featureId: 'rules', aixTerm: 'Rules', editorTerm: 'AGENTS.md' },
         { featureId: 'prompts', aixTerm: 'Prompts', editorTerm: 'Skills' },
      ],
      features: {
         rules: feature(
            'rules',
            'native',
            'AGENTS.md',
            'Section-managed markdown in project and directory-specific AGENTS.md files.',
            nativeScope('AGENTS.md at the project root and selected subdirectories'),
            nativeScope('~/.codex/AGENTS.md'),
            {
               notes: [ 'Activation modes collapse into plain markdown headings and directory placement.' ],
            },
         ),
         prompts: feature(
            'prompts',
            'shim',
            'Skills',
            'Prompt-to-skill conversion during install.',
            shimScope('.agents/skills/prompt-{name}/', 'Prompts are installed as instruction-only Agent Skills.'),
            shimScope('~/.codex/skills/prompt-{name}/', 'User-scoped prompts are also converted to skills.'),
         ),
         mcp: feature(
            'mcp',
            'native',
            'MCP servers',
            'TOML MCP configuration currently managed as global-only by aix.',
            unsupportedScope('aix does not yet write Codex project MCP config.'),
            nativeScope('~/.codex/config.toml'),
            {
               notes: [ 'Upstream Codex also supports `.codex/config.toml` in trusted projects.' ],
            },
         ),
         skills: feature(
            'skills',
            'native',
            'Skills',
            'Symlinked native skill directories backed by `.aix/skills/`.',
            nativeScope('.agents/skills/{name}/'),
            nativeScope('~/.codex/skills/{name}/'),
         ),
         hooks: feature(
            'hooks',
            'unsupported',
            'Hooks',
            'Hooks are not supported.',
            unsupportedScope('Codex does not support lifecycle hooks in aix.'),
            unsupportedScope('Codex does not support lifecycle hooks in aix.'),
         ),
         'agents-md': feature(
            'agents-md',
            'native',
            'AGENTS.md',
            'Codex natively layers AGENTS.md files through the directory tree.',
            nativeScope('AGENTS.md in the repository tree'),
            nativeScope('~/.codex/AGENTS.md'),
         ),
         'agents-dir': feature(
            'agents-dir',
            'native',
            '.agents/skills',
            'Codex natively discovers Agent Skills directories.',
            nativeScope('.agents/skills/{name}/'),
            nativeScope('~/.agents/skills/{name}/'),
         ),
      },
   },
   {
      id: 'gemini',
      name: 'Gemini',
      summary: 'Native GEMINI.md rules, TOML command prompts, MCP, and skills, but no hooks.',
      migrationPitch: 'Gemini is a strong target for native prompts and MCP when hooks are not required.',
      notes: [
         'Gemini prompts are TOML files, not markdown command files.',
         'Like Codex, Gemini collapses rule activation metadata into managed markdown content.',
      ],
      terminology: [
         { featureId: 'rules', aixTerm: 'Rules', editorTerm: 'GEMINI.md' },
         { featureId: 'prompts', aixTerm: 'Prompts', editorTerm: 'Commands' },
      ],
      features: {
         rules: feature(
            'rules',
            'native',
            'GEMINI.md',
            'Section-managed markdown in `GEMINI.md`.',
            nativeScope('GEMINI.md'),
            nativeScope('~/.gemini/GEMINI.md'),
            {
               notes: [ 'Activation modes are flattened into the managed markdown section.' ],
            },
         ),
         prompts: feature(
            'prompts',
            'native',
            'Commands',
            'TOML command files with `description` and `prompt` fields.',
            nativeScope('.gemini/commands/*.toml'),
            nativeScope('~/.gemini/commands/*.toml'),
         ),
         mcp: feature(
            'mcp',
            'native',
            'MCP servers',
            'JSON settings file with editor-native MCP config.',
            nativeScope('.gemini/settings.json'),
            nativeScope('~/.gemini/settings.json'),
         ),
         skills: feature(
            'skills',
            'native',
            'Skills',
            'Symlinked native skill directories backed by `.aix/skills/`.',
            nativeScope('.gemini/skills/{name}/'),
            nativeScope('~/.gemini/skills/{name}/'),
            {
               notes: [ 'Gemini also supports `.agents/skills/` as an alias and gives it precedence.' ],
            },
         ),
         hooks: feature(
            'hooks',
            'unsupported',
            'Hooks',
            'Hooks are not supported.',
            unsupportedScope('Gemini does not support lifecycle hooks in aix.'),
            unsupportedScope('Gemini does not support lifecycle hooks in aix.'),
         ),
         'agents-md': feature(
            'agents-md',
            'native',
            'AGENTS.md',
            'Compatibility with AGENTS.md through configurable context filename support.',
            nativeScope('AGENTS.md when `context.fileName` is configured'),
            nativeScope('Home-scoped AGENTS.md when `context.fileName` is configured'),
         ),
         'agents-dir': feature(
            'agents-dir',
            'native',
            '.agents/skills',
            'Compatibility with the shared Agent Skills folder convention.',
            nativeScope('.agents/skills/{name}/'),
            nativeScope('~/.agents/skills/{name}/'),
         ),
      },
   },
   {
      id: 'opencode',
      name: 'OpenCode',
      summary: 'Native AGENTS.md rules, markdown commands, MCP, and skills with user-scope support.',
      migrationPitch: 'OpenCode stays close to Claude-style commands and skills while keeping AGENTS.md as the rule surface.',
      notes: [
         'OpenCode uses `opencode.json` with a top-level `mcp` object instead of `mcpServers`.',
         'Rules are written with section-managed markdown so user-owned AGENTS.md content is preserved.',
      ],
      terminology: [
         { featureId: 'rules', aixTerm: 'Rules', editorTerm: 'AGENTS.md' },
         { featureId: 'prompts', aixTerm: 'Prompts', editorTerm: 'Commands' },
      ],
      features: {
         rules: feature(
            'rules',
            'native',
            'AGENTS.md',
            'Section-managed markdown in AGENTS.md.',
            nativeScope('AGENTS.md'),
            nativeScope('~/.config/opencode/AGENTS.md'),
         ),
         prompts: feature(
            'prompts',
            'native',
            'Commands',
            'Markdown command files with optional YAML frontmatter.',
            nativeScope('.opencode/commands/*.md'),
            nativeScope('~/.config/opencode/commands/*.md'),
            {
               supportedValues: [ 'description', 'argument-hint' ],
            },
         ),
         mcp: feature(
            'mcp',
            'native',
            'MCP servers',
            'JSON config with a top-level `mcp` object.',
            nativeScope('opencode.json'),
            nativeScope('~/.config/opencode/opencode.json'),
         ),
         skills: feature(
            'skills',
            'native',
            'Skills',
            'Symlinked native skill directories backed by `.aix/skills/`.',
            nativeScope('.opencode/skills/{name}/'),
            nativeScope('~/.config/opencode/skills/{name}/'),
            {
               notes: [ 'OpenCode also discovers `.agents/skills/` as a compatibility surface.' ],
            },
         ),
         hooks: feature(
            'hooks',
            'unsupported',
            'Hooks',
            'Hooks are not supported.',
            unsupportedScope('OpenCode does not support lifecycle hooks in aix.'),
            unsupportedScope('OpenCode does not support lifecycle hooks in aix.'),
         ),
         'agents-md': feature(
            'agents-md',
            'native',
            'AGENTS.md',
            'OpenCode natively uses AGENTS.md for project and user instructions.',
            nativeScope('AGENTS.md'),
            nativeScope('~/.config/opencode/AGENTS.md'),
         ),
         'agents-dir': feature(
            'agents-dir',
            'native',
            '.agents/skills',
            'Compatibility with the shared Agent Skills folder convention.',
            nativeScope('.agents/skills/{name}/'),
            nativeScope('Compatible home-scoped skill discovery'),
         ),
      },
   },
] as const satisfies readonly EditorSupportProfile[];

export const editorSupportProfileMap = Object.freeze(
   editorSupportProfiles.reduce<Record<SupportedEditorName, EditorSupportProfile>>((memo, profile) => {
      memo[profile.id] = profile;
      return memo;
   }, {} as Record<SupportedEditorName, EditorSupportProfile>),
);

export const editorFeatureDefinitionMap = Object.freeze(
   editorFeatureDefinitions.reduce<Record<EditorFeatureId, (typeof editorFeatureDefinitions)[number]>>(
      (memo, feature) => {
         memo[feature.id] = feature;
         return memo;
      },
      {} as Record<EditorFeatureId, (typeof editorFeatureDefinitions)[number]>,
   ),
);

export function getEditorSupportProfile(editor: SupportedEditorName): EditorSupportProfile {
   return editorSupportProfileMap[editor];
}

export function getEditorFeatureDefinition(featureId: EditorFeatureId): (typeof editorFeatureDefinitions)[number] {
   return editorFeatureDefinitionMap[featureId];
}

export function listOrderedEditorPairs(): OrderedEditorPair[] {
   const pairs: OrderedEditorPair[] = [];

   for (const from of supportedEditorNames) {
      for (const to of supportedEditorNames) {
         if (from === to) {
            continue;
         }
         pairs.push({ from, to });
      }
   }

   return pairs;
}
