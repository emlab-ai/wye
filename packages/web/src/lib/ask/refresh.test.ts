import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, utimes, rm, rename, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { refresh, getStore } from './refresh';
import { search, state } from './store';
import type { Product } from '../products';
import type { GraphData } from '../graph';

const fakeEmbed = async (t: string[]) => t.map(x => [(x.length % 7) / 7, 1, 0]);
let dir: string; let repo: string; let p: Product; let g: GraphData;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'ask-')); repo = path.join(dir, 'repo');
  await mkdir(path.join(dir, 'projects/v2/docs'), { recursive: true }); await mkdir(path.join(dir, '_sessions')); await mkdir(path.join(repo, 'lib'), { recursive: true });
  await writeFile(path.join(dir, 'projects/v2/docs/m.md'), '# Invites\n\nThe invite email was dropped in favour of links.\n');
  await writeFile(path.join(repo, 'lib/invite.ts'), 'export function sendInvite() {\n  return 1;\n}\n');
  await writeFile(path.join(repo, 'lib/big.bin'), Buffer.from([0, 1, 2]));
  await writeFile(path.join(dir, '_sessions/abc123.json'), JSON.stringify({ id: 'abc123', instruction: 'remove the invite email', log: [], result: 'removed', createdAt: '2026-10-01', status: 'done' }));
  p = { slug: 't', dir, graphPath: '', meta: { title: 'T', icon: '', description: '', kind: '', status: '', repo, settings: {} } } as Product;
  g = { generatedAt: '', modules: [], fieldIndex: {}, edges: [], files: [path.join(dir, 'projects/v2/docs/m.md')],
    nodes: [{ id: 'decision:no-invite-email', kind: 'decision', title: 'No invite email', status: 'approved', section: '', subsection: '', body: 'title: No invite email', defined: true, file: '', line: 1 }] } as unknown as GraphData;
});
const listCode = async () => ['lib/invite.ts', 'lib/big.bin', 'lib/missing.ts'];

describe('refresh', () => {
  it('indexes all four sources and embeds them', async () => {
    const st = await refresh(p, g, { embed: fakeEmbed, listCode });
    expect(st.changed).toEqual({ node: 1, doc: 1, code: 1, session: 2 });
    expect(st.embedded).toBe(5);
    const hits = await search(await getStore(p), 'invite', null, { limit: 10 });
    expect(hits.map(h => h.source).sort()).toEqual(['code', 'doc', 'node', 'session', 'session']);
  });
  it('is incremental: an untouched tree changes nothing; a touched doc re-reads only itself', async () => {
    await refresh(p, g, { embed: fakeEmbed, listCode });
    expect((await refresh(p, g, { embed: fakeEmbed, listCode })).changed).toEqual({ node: 0, doc: 0, code: 0, session: 0 });
    const f = path.join(dir, 'projects/v2/docs/m.md'); await writeFile(f, '# Invites\n\nLinks only now.\n'); await utimes(f, new Date(), new Date(Date.now() + 5000));
    const st = await refresh(p, g, { embed: fakeEmbed, listCode });
    expect(st.changed).toEqual({ node: 0, doc: 1, code: 0, session: 0 });
    expect((await search(await getStore(p), 'favour', null, { limit: 5 })).length).toBe(0);
  });
  it('drops the passages of a file that is gone', async () => {
    await refresh(p, g, { embed: fakeEmbed, listCode });
    await rm(path.join(dir, '_sessions/abc123.json'));
    await refresh(p, g, { embed: fakeEmbed, listCode });
    expect([...(await state(await getStore(p))).keys()].filter(id => id.startsWith('session:'))).toEqual([]);
  });
  it('never indexes the product\'s own knowledge files as code', async () => {
    p.meta.repo = dir;
    const st = await refresh(p, g, { embed: fakeEmbed, listCode: async () => ['projects/v2/docs/m.md', 'repo/lib/invite.ts'] });
    expect(st.changed.code).toBe(1);
  });
  it('keeps a passage whose file moved (same id, new scope)', async () => {
    await refresh(p, g, { embed: fakeEmbed, listCode });
    await rename(path.join(dir, '_sessions/abc123.json'), path.join(dir, '_sessions/moved.json'));
    await refresh(p, g, { embed: fakeEmbed, listCode });
    expect([...(await state(await getStore(p))).keys()].filter(id => id.startsWith('session:')).sort()).toEqual(['session:abc123#0', 'session:abc123#1']);
  });
  it('keeps a doc and a code passage of the same file apart', async () => {
    p.meta.repo = path.join(dir, 'projects/v2');   // a repo that holds a document: never as code, and the doc survives
    await refresh(p, g, { embed: fakeEmbed, listCode: async () => ['docs/m.md'] });
    p.meta.repo = repo;
    await refresh(p, g, { embed: fakeEmbed, listCode });
    expect([...(await state(await getStore(p))).keys()].filter(id => id.startsWith('doc:')).length).toBe(1);
  });
  it('leaves scopes.json alone when nothing changed', async () => {
    await refresh(p, g, { embed: fakeEmbed, listCode });
    const f = path.join(dir, '_build/search.lance/scopes.json'); const before = (await stat(f)).mtimeMs;
    await new Promise(r => setTimeout(r, 20));
    await refresh(p, g, { embed: fakeEmbed, listCode });
    expect((await stat(f)).mtimeMs).toBe(before);
  });
  it('indexes no code for a product that names no repo', async () => {
    delete p.meta.repo;   // bin/wye.js exists in the repo the app runs from: the old fallback would index it
    expect((await refresh(p, g, { embed: fakeEmbed, listCode: async () => ['bin/wye.js'] })).changed.code).toBe(0);
  });
  it('skips code when the product has no repo folder', async () => {
    p.meta.repo = path.join(dir, 'nope');
    expect((await refresh(p, g, { embed: fakeEmbed, listCode })).changed.code).toBe(0);
  });
  it('degrades to text search without an embedder, and embeds what it missed once one is there', async () => {
    expect((await refresh(p, g, { embed: null, listCode })).degraded).toBe('no-vectors');
    expect((await search(await getStore(p), 'invite', null, { limit: 10 })).length).toBe(5);
    expect((await refresh(p, g, { embed: fakeEmbed, listCode })).embedded).toBe(5);
  });
});
