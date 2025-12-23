#!/bin/bash
# QA Sandbox - Isolated CLI testing environment
#
# Creates a temporary directory for testing the aix CLI without affecting
# your real config files or editor settings.
#
# Usage:
#   ./scripts/qa-sandbox.sh           # Start interactive sandbox
#   ./scripts/qa-sandbox.sh --clean   # Remove all sandbox directories

set -e

SANDBOX_BASE="${TMPDIR:-/tmp}/aix-qa-sandbox"
SANDBOX_DIR="$SANDBOX_BASE/$(date +%Y%m%d-%H%M%S)-$$"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  aix CLI QA Sandbox${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

cleanup_all() {
    echo -e "${YELLOW}Cleaning up all sandbox directories...${NC}"
    if [ -d "$SANDBOX_BASE" ]; then
        rm -rf "$SANDBOX_BASE"
        echo -e "${GREEN}✓ Removed $SANDBOX_BASE${NC}"
    else
        echo -e "${YELLOW}No sandbox directories found${NC}"
    fi
    exit 0
}

# Handle --clean flag
if [ "$1" = "--clean" ]; then
    cleanup_all
fi

# Create sandbox directory
mkdir -p "$SANDBOX_DIR"

print_header
echo ""
echo -e "${GREEN}✓ Created sandbox:${NC} $SANDBOX_DIR"
echo ""

# Create helper script inside sandbox
cat > "$SANDBOX_DIR/aix" << 'SCRIPT'
#!/bin/bash
# Wrapper to run aix CLI from sandbox
# Uses NODE_PATH to find modules while staying in sandbox directory

export NODE_PATH="$AIX_PROJECT_ROOT/node_modules:$AIX_PROJECT_ROOT/packages/cli/node_modules"
node "$AIX_PROJECT_ROOT/packages/cli/bin/dev.js" "$@"
SCRIPT
chmod +x "$SANDBOX_DIR/aix"

# Create a sample project structure for testing
mkdir -p "$SANDBOX_DIR/sample-project/src"
mkdir -p "$SANDBOX_DIR/sample-project/packages/frontend"
mkdir -p "$SANDBOX_DIR/sample-project/packages/backend"

cat > "$SANDBOX_DIR/sample-project/package.json" << 'EOF'
{
  "name": "sample-project",
  "version": "1.0.0",
  "private": true
}
EOF

# Create test fixtures directory
mkdir -p "$SANDBOX_DIR/fixtures"

# Create some test config files
cat > "$SANDBOX_DIR/fixtures/valid-config.json" << 'EOF'
{
  "$schema": "https://x.a1st.dev/schemas/v1/ai.json",
  "skills": {
    "typescript": "^5.0.0",
    "react": "^18.0.0"
  },
  "mcp": {},
  "rules": {
    "project": ["Use TypeScript strict mode"]
  }
}
EOF

cat > "$SANDBOX_DIR/fixtures/invalid-config.json" << 'EOF'
{
  "skills": {
    "INVALID_NAME": "not-semver"
  }
}
EOF

cat > "$SANDBOX_DIR/fixtures/base-config.json" << 'EOF'
{
  "skills": {
    "typescript": "^5.0.0"
  },
  "rules": {
    "project": ["Base rule"]
  }
}
EOF

cat > "$SANDBOX_DIR/fixtures/extends-config.json" << 'EOF'
{
  "extends": "./base-config.json",
  "skills": {
    "react": "^18.0.0"
  }
}
EOF

# Create README in sandbox
cat > "$SANDBOX_DIR/README.md" << 'EOF'
# aix QA Sandbox

This is an isolated testing environment for the aix CLI.

## Quick Start

```bash
# Initialize a new config
./aix init --yes

# Validate a config
./aix validate

# Validate a specific file
./aix validate --config fixtures/valid-config.json
```

## Directory Structure

- `sample-project/` - A mock project for testing
- `fixtures/` - Pre-made test config files
  - `valid-config.json` - A valid ai.json
  - `invalid-config.json` - An invalid config for error testing
  - `base-config.json` - Base config for inheritance testing
  - `extends-config.json` - Config that extends base

## Test Scenarios

### Init Command
```bash
cd sample-project
../aix init --yes
cat ai.json
```

### Validation
```bash
./aix validate --config fixtures/valid-config.json
./aix validate --config fixtures/invalid-config.json
```

### Inheritance
```bash
cd fixtures
../aix validate --config extends-config.json
```

### JSON Output
```bash
./aix validate --config fixtures/valid-config.json --json
```

## Cleanup

This entire directory can be safely deleted:
```bash
rm -rf "$(pwd)"
```

Or use the cleanup script:
```bash
$AIX_PROJECT_ROOT/scripts/qa-sandbox.sh --clean
```
EOF

# Print instructions
echo -e "${YELLOW}Available commands:${NC}"
echo "  ./aix init           Initialize ai.json"
echo "  ./aix validate       Validate config"
echo "  ./aix --help         Show help"
echo ""
echo -e "${YELLOW}Test fixtures:${NC}"
echo "  fixtures/valid-config.json    - Valid config"
echo "  fixtures/invalid-config.json  - Invalid config"
echo "  fixtures/base-config.json     - Base for inheritance"
echo "  fixtures/extends-config.json  - Extends base"
echo ""
echo -e "${YELLOW}Sample project:${NC}"
echo "  sample-project/               - Mock project directory"
echo ""
echo -e "${RED}To cleanup:${NC}"
echo "  rm -rf $SANDBOX_DIR"
echo "  # Or cleanup all: $PROJECT_ROOT/scripts/qa-sandbox.sh --clean"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Export project root for the aix wrapper
export AIX_PROJECT_ROOT="$PROJECT_ROOT"

# Change to sandbox and start subshell
cd "$SANDBOX_DIR"
echo -e "${GREEN}Entering sandbox shell. Type 'exit' to leave.${NC}"
echo ""

# Start a subshell with custom prompt
PS1="[aix-sandbox] \w \$ " AIX_PROJECT_ROOT="$PROJECT_ROOT" bash --norc
