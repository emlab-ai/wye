#!/usr/bin/env bash
# Links the ctx CLI and the wye skills so any repo (and any Claude Code session) can use them.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BIN="${HOME}/.local/bin"
SKILLS="${HOME}/.claude/skills"
mkdir -p "$BIN" "$SKILLS"
chmod +x "$HERE/bin/ctx.js" "$HERE/bin/wf.js" "$HERE/bin/wye.js"
ln -sfn "$HERE/bin/ctx.js" "$BIN/ctx"
ln -sfn "$HERE/bin/wye.js" "$BIN/wye"
ln -sfn "$HERE/bin/wf.js" "$BIN/wf"     # the old name, an alias
for s in "$HERE"/skills/*/; do
    name="$(basename "$s")"
    ln -sfn "${s%/}" "$SKILLS/$name"
done
echo "wye      → $BIN/wye   (wf → $BIN/wf, the old name)"
echo "ctx      → $BIN/ctx  $(case ":$PATH:" in *":$BIN:"*) echo '(on PATH)';; *) echo "(add $BIN to PATH)";; esac)"
for s in "$HERE"/skills/*/; do echo "skill    → $SKILLS/$(basename "$s")"; done
echo
echo "in a repo:  ctx build && ctx check   (expects docs/context-graph/*.md; override with --root)"
