#!/usr/bin/env bash
# Links the wye command and the Wye skills so any repo (and any Claude Code session) can use them.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BIN="${HOME}/.local/bin"
SKILLS="${HOME}/.claude/skills"
mkdir -p "$BIN" "$SKILLS"
chmod +x "$HERE/bin/wye.js" "$HERE/bin/wye-graph.js"
ln -sfn "$HERE/bin/wye.js" "$BIN/wye"
rm -f "$BIN/wf" "$BIN/ctx"   # the old names, gone: it is `wye` (decision:wf2.cli-is-wye)
for s in "$HERE"/skills/*/; do
    name="$(basename "$s")"
    ln -sfn "${s%/}" "$SKILLS/$name"
done
echo "wye      → $BIN/wye  $(case ":$PATH:" in *":$BIN:"*) echo '(on PATH)';; *) echo "(add $BIN to PATH)";; esac)"
for s in "$HERE"/skills/*/; do echo "skill    → $SKILLS/$(basename "$s")"; done
echo
echo "in a repo:  wye build --root data/products/<product> && wye check --root data/products/<product>"
