import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { agentsAvailable } from './agents-available';

const env = (e: Record<string, string>) => e as NodeJS.ProcessEnv; // Next's types make NODE_ENV required
// the Quick start's agent check: which coding agent binaries are on PATH, without running them
const binDir = async (names: string[], mode = 0o755) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wf-agents-'));
  for (const n of names) { const f = path.join(dir, process.platform === 'win32' ? `${n}.cmd` : n); await writeFile(f, '#!/bin/sh\n'); await chmod(f, mode); }
  return dir;
};

describe('agentsAvailable', () => {
  it('finds claude on PATH and not codex', async () => {
    const dir = await binDir(['claude']);
    expect(await agentsAvailable(env({ PATH: dir }))).toEqual({ claude: true, codex: false });
  });
  it('both, across PATH entries', async () => {
    const a = await binDir(['claude']), b = await binDir(['codex']);
    expect(await agentsAvailable(env({ PATH: [a, b].join(path.delimiter) }))).toEqual({ claude: true, codex: true });
  });
  it('neither: an empty folder, an empty PATH, a missing PATH entry', async () => {
    const dir = await binDir([]);
    expect(await agentsAvailable(env({ PATH: dir }))).toEqual({ claude: false, codex: false });
    expect(await agentsAvailable(env({ PATH: '' }))).toEqual({ claude: false, codex: false });
    expect(await agentsAvailable(env({}))).toEqual({ claude: false, codex: false });
    expect(await agentsAvailable(env({ PATH: path.join(dir, 'no-such') }))).toEqual({ claude: false, codex: false });
  });
  it.skipIf(process.platform === 'win32')('a file that is not executable does not count', async () => {
    const dir = await binDir(['claude'], 0o644);
    expect(await agentsAvailable(env({ PATH: dir }))).toEqual({ claude: false, codex: false });
  });
});
