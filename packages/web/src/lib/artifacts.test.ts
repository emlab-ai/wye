import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { creditBlockChanges, mergeBlocks } from './artifacts';
import { createSession, getSession } from './sessions';
import type { BlockChange } from './session-types';

const change = (id: string, ch: BlockChange['change'] = 'changed'): BlockChange => ({ id, change: ch, at: '2026-09-22T10:00:00Z', kind: id.split(':')[0], title: id, status: '', file: 'data/products/p/projects/v2/docs/prd.md' } as BlockChange);

describe("a session's artifacts", () => {
  it('credits each session only with the blocks attributed to it, and nobody with the rest', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wf-artifacts-'));
    const a = await createSession(dir, 'p', { agent: 'claude-code', instruction: 'Research the idea' });
    const b = await createSession(dir, 'p', { agent: 'claude-code', instruction: 'Something else' });
    const changes = [
      change('req:mine.one', 'added'),          // a's
      change('decision:mine.two'),              // a's
      change('component:theirs'),               // b's
      change('contradiction:p.abc'),            // the verdict pass — attributed to no session
      change('run:feature-1'),                  // the workflow engine — attributed to no session
    ];
    const owner: Record<string, string> = { 'req:mine.one': a.id, 'decision:mine.two': a.id, 'component:theirs': b.id };
    await creditBlockChanges(dir, changes, id => owner[id]);
    const ids = async (s: string) => ((await getSession(dir, s))?.artifacts?.blocks ?? []).map(x => x.id).sort();
    expect(await ids(a.id)).toEqual(['decision:mine.two', 'req:mine.one']);
    expect(await ids(b.id)).toEqual(['component:theirs']);
    // what the app itself wrote while they ran belongs to neither
    expect((await ids(a.id)).concat(await ids(b.id))).not.toContain('contradiction:p.abc');
    expect((await ids(a.id)).concat(await ids(b.id))).not.toContain('run:feature-1');
  });
  it('merges a block changed twice into one entry, and drops one added then removed', () => {
    expect(mergeBlocks([change('req:a', 'added')], [change('req:a', 'changed')]).map(b => b.change)).toEqual(['added']);
    expect(mergeBlocks([change('req:a', 'added')], [change('req:a', 'removed')])).toEqual([]);
    expect(mergeBlocks([change('req:a', 'changed')], [change('req:b', 'added')]).map(b => b.id)).toEqual(['req:a', 'req:b']);
  });
});
