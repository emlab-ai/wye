import { describe, it, expect } from 'vitest';
import { stepText, refsFromToolUse, refsFromToolResult } from './refs';

const roots = { code: '/REPO', product: '/REPO/data/products/p' };
describe('deep-lane refs', () => {
  it('describes what a tool call does', () => {
    expect(stepText('Bash', { command: 'wye ask-search "invite email" --source code' })).toBe('Searching “invite email” in code');
    expect(stepText('Bash', { command: 'wye node req:a' })).toBe('Reading req:a');
    expect(stepText('Bash', { command: 'wye neighbors req:a' })).toBe('Following the links of req:a');
    expect(stepText('Read', { file_path: '/REPO/lib/x.ts' }, roots)).toBe('Reading lib/x.ts');
    expect(stepText('Grep', { pattern: 'sendInvite' })).toBe('Searching the code for “sendInvite”');
  });
  it('turns a Read into a code ref with lines, and a document read into a doc-file ref', () => {
    expect(refsFromToolUse('Read', { file_path: '/REPO/lib/x.ts', offset: 10, limit: 20 }, roots)).toEqual(['lib/x.ts:10-29']);
    expect(refsFromToolUse('Read', { file_path: '/REPO/lib/x.ts' }, roots)).toEqual(['lib/x.ts:1-60']);
    expect(refsFromToolUse('Read', { file_path: '/REPO/data/products/p/projects/v2/docs/m.md' }, roots)).toEqual(['doc-file:v2/m']);
    expect(refsFromToolUse('Read', { file_path: '/elsewhere/x.ts' }, roots)).toEqual([]);
    expect(refsFromToolUse('Bash', { command: 'wye node req:a' }, roots)).toEqual(['req:a']);
  });
  it('finds chunk ids in ask-search JSON and known node ids in text', () => {
    const known = (id: string) => id === 'req:a' || id === 'decision:b';
    expect(refsFromToolResult('{"hits":[{"id":"node:req:a"},{"id":"code:lib/x.ts:1-9"}]}', known)).toEqual(['node:req:a', 'code:lib/x.ts:1-9']);
    expect(refsFromToolResult('## req:a [shipped]\n  decision:b — x\n  req:zzz', known)).toEqual(['req:a', 'decision:b']);
  });
});
