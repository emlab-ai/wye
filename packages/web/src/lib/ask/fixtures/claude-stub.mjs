// A stand-in for `claude -p … --output-format stream-json`: prints the lines of a fixture (one JSON object per line)
// with $STUB_DELAY ms between them. The deep lane (its args carry --allowedTools) reads $STUB_DEEP and exits
// $STUB_EXIT_DEEP; anything else reads $STUB_JSONL and exits $STUB_EXIT (default 0). Reads and ignores stdin.
import { readFileSync } from 'node:fs';
process.stdin.resume(); process.stdin.on('data', () => {});
const deep = process.argv.includes('--allowedTools');
const lines = readFileSync(deep && process.env.STUB_DEEP ? process.env.STUB_DEEP : process.env.STUB_JSONL, 'utf8').split('\n').filter(Boolean);
const exitCode = Number((deep ? process.env.STUB_EXIT_DEEP : undefined) ?? process.env.STUB_EXIT ?? 0);
const delay = Number(process.env.STUB_DELAY || 0);
let i = 0;
const next = () => { if (i < lines.length) { process.stdout.write(lines[i++] + '\n'); setTimeout(next, delay); } else process.exit(exitCode); };
next();
