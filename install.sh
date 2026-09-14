#!/usr/bin/env bash
# Links the ctx CLI and the waterfall skills so any repo (and any Claude Code session) can use them.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BIN="${HOME}/.local/bin"
SKILLS="${HOME}/.claude/skills"
mkdir -p "$BIN" "$SKILLS"
chmod +x "$HERE/bin/ctx.js"
ln -sfn "$HERE/bin/ctx.js" "$BIN/ctx"
for s in "$HERE"/skills/*/; do
    name="$(basename "$s")"
    ln -sfn "${s%/}" "$SKILLS/$name"
done
echo "ctx      → $BIN/ctx  $(case ":$PATH:" in *":$BIN:"*) echo '(on PATH)';; *) echo "(add $BIN to PATH)";; esac)"
for s in "$HERE"/skills/*/; do echo "skill    → $SKILLS/$(basename "$s")"; done
echo
echo "in a repo:  ctx build && ctx check   (expects docs/context-graph/*.md; override with --root)"
