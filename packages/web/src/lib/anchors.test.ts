import { describe, it, expect } from 'vitest';
import { blockHash, hashableBlocks, parseAnchor, anchorFor } from './anchors';

describe('anchors', () => {
  it('hashes text independent of markdown decoration and whitespace', () => {
    expect(blockHash('The **outbox** accepts   only\noperational kinds.')).toBe(blockHash('the outbox accepts only operational kinds.'));
    expect(blockHash('a')).not.toBe(blockHash('b'));
  });
  it('lists paragraphs and list items with their line numbers', () => {
    const b = hashableBlocks('Intro line\nwrapped.\n\n- one\n- [ ] task:x two\n\n```\ncode\n```\n');
    expect(b.map(x => x.line)).toEqual([1, 4, 5, 4, 7]);
    expect(b.find(x => x.line === 5)?.hash).toBe(blockHash('task:x two'));
  });
  it('parses and forms anchors', () => {
    expect(parseAnchor('#n-task%3Ax')).toEqual({ kind: 'node', id: 'task:x' });
    expect(parseAnchor('b-deadbeef')).toEqual({ kind: 'block', hash: 'deadbeef' });
    expect(parseAnchor('#goals')).toEqual({ kind: 'heading', slug: 'goals' });
    expect(anchorFor({ kind: 'node', id: 'req:a.b' })).toBe('n-req%3Aa.b');
  });
});
