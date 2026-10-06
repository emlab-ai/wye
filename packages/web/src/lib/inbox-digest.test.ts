import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { addInboxItem, digestInboxItem, listInboxItems } from './inbox';

// a raw request stored in the inbox and digested at once (decision:waterfall.raw-request-to-inbox-then-digest): a
// Remember session starts on the item's words, the item names the session, and a session that fails to start leaves
// the item as it was — stored, waiting
describe('inbox digest', () => {
  it('starts a Remember session on the item and records it', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wf-inbox-digest-'));
    const name = await addInboxItem(dir, { title: 'No hooks', text: 'Alex: the agent must know the rules without hooks.', from: 'claude-code', refs: ['decision:x'] });
    const seen: { instruction: string; refs: string[]; source: Record<string, string> }[] = [];
    const r = await digestInboxItem(dir, name, async o => { seen.push(o); return { id: 'sess-1' }; });
    expect(r).toEqual({ session: 'sess-1' });
    expect(seen).toHaveLength(1);
    expect(seen[0].instruction).toBe('No hooks\n\nAlex: the agent must know the rules without hooks.');
    expect(seen[0].refs).toEqual(['decision:x']);
    expect(seen[0].source).toEqual({ inbox: name, from: 'claude-code' });
    expect(await readFile(path.join(dir, 'inbox', name), 'utf8')).toMatch(/^session: sess-1$/m);
    expect((await listInboxItems(dir)).find(i => i.name === name)!.session).toBe('sess-1');
  });
  it('leaves the item stored when the session cannot start', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wf-inbox-digest-'));
    const name = await addInboxItem(dir, { text: 'a note' });
    const r = await digestInboxItem(dir, name, async () => { throw new Error('no agent'); });
    expect(r).toEqual({ session: null, error: 'no agent' });
    expect(await readFile(path.join(dir, 'inbox', name), 'utf8')).not.toMatch(/^session:/m);
  });
});
