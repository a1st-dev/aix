# Superpowers Example

A comprehensive `ai.json` configuration based on [obra/superpowers](https://github.com/obra/superpowers), demonstrating skills, prompts, rules, and hooks across multiple editors.

## What's Included

### Skills (14 total)

| Category          | Skill                          | Description                          |
| ----------------- | ------------------------------ | ------------------------------------ |
| **Testing**       | test-driven-development        | RED-GREEN-REFACTOR cycle             |
| **Debugging**     | systematic-debugging           | 4-phase root cause process           |
| **Debugging**     | verification-before-completion | Ensure it's actually fixed           |
| **Collaboration** | brainstorming                  | Socratic design refinement           |
| **Collaboration** | writing-plans                  | Detailed implementation plans        |
| **Collaboration** | executing-plans                | Batch execution with checkpoints     |
| **Collaboration** | dispatching-parallel-agents    | Concurrent subagent workflows        |
| **Collaboration** | requesting-code-review         | Pre-review checklist                 |
| **Collaboration** | receiving-code-review          | Responding to feedback               |
| **Collaboration** | using-git-worktrees            | Parallel development branches        |
| **Collaboration** | finishing-a-development-branch | Merge/PR decision workflow           |
| **Collaboration** | subagent-driven-development    | Fast iteration with two-stage review |
| **Meta**          | writing-skills                 | Create new skills                    |
| **Meta**          | using-superpowers              | Introduction to skills system        |

### Prompts (3 total)

- `/brainstorm` - Start a collaborative brainstorming session
- `/write-plan` - Create a detailed implementation plan
- `/execute-plan` - Execute a plan with checkpoints

### Rules (1 total)

- **using-superpowers** (always active) - Introduction to the skills system

### Hooks

- **session_start** - Announces available skills when a session starts

Hooks are automatically translated to each editor's native format:

- **Claude Code** → `SessionStart` in `.claude/settings.json`
- **Windsurf** → Not supported (session_start event)
- **Cursor** → Not supported (session_start event)

## Installation

```bash
# From the ajson repository
aix install https://raw.githubusercontent.com/a1st-io/ajson/main/examples/ai-json/superpowers/ai.json

# Or copy ai.json to your project and run
aix install
```

## Philosophy

The superpowers approach emphasizes:

1. **Structured methodologies** - Skills provide repeatable processes for common tasks
2. **Explicit activation** - Skills are invoked when relevant, not always active
3. **Collaboration patterns** - Focus on human-AI collaboration workflows
4. **Meta-skills** - Skills for creating and managing other skills

## Customization

Feel free to:

- Remove skills you don't need
- Add your own prompts
- Modify the SessionStart hook
- Extend with additional rules

## Links

- [Original superpowers repo](https://github.com/obra/superpowers)
- [ai.json documentation](https://github.com/a1st-io/ajson)
