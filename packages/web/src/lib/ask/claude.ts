// One `claude -p` run as a stream of its JSON lines (decision:memory.model-calls-via-cli). WYE_CLAUDE_BIN replaces the
// binary (a shell command line — the tests point it at a stub). Abort kills the child and ends the stream quietly.
import { spawn } from 'node:child_process';

export async function* spawnClaude(args: string[], stdin: string, opts: { signal: AbortSignal; env?: NodeJS.ProcessEnv; cwd?: string; timeoutMs?: number }): AsyncGenerator<Record<string, unknown>> {
  const bin = process.env.WYE_CLAUDE_BIN || 'claude';
  const quote = (a: string) => `'${a.replace(/'/g, `'\\''`)}'`;
  const child = spawn(`${bin} ${args.map(quote).join(' ')}`, { shell: true, cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const kill = () => { try { child.kill('SIGTERM'); } catch { /* gone */ } };
  opts.signal.addEventListener('abort', kill, { once: true });
  const timer = opts.timeoutMs ? setTimeout(kill, opts.timeoutMs) : null;
  let err = ''; child.stderr.on('data', d => { err += d; });
  const exit = new Promise<number | null>(res => child.on('close', c => res(c)));
  child.stdin.on('error', () => {}); child.stdin.end(stdin);
  let buf = '';
  try {
    for await (const d of child.stdout) {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue; try { yield JSON.parse(line); } catch { /* not json */ } if (opts.signal.aborted) return; }
    }
    const code = await exit;
    if (opts.signal.aborted) return;
    if (code !== 0) throw new Error(`claude exited ${code}: ${err.trim().slice(0, 300)}`);
  } finally { if (timer) clearTimeout(timer); opts.signal.removeEventListener('abort', kill); if (child.exitCode === null) kill(); }
}
