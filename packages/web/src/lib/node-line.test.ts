import { describe, it, expect } from 'vitest';
import { parseNodeLine, formatNodeLine, patchNodeLine } from './node-line';

describe('node lines', () => {
  it('parses and re-forms a task line with checkbox, status override and props', () => {
    const line = '  - [ ] task:a.b Do the thing #blocked (owner: alex, due: 2026-10)';
    const n = parseNodeLine(line)!;
    expect(n).toEqual({ prefix: '  - ', check: 'todo', id: 'task:a.b', text: 'Do the thing', status: 'blocked', extra: 'owner: alex, due: 2026-10' });
    expect(formatNodeLine(n)).toBe(line);
  });
  it('patches status (checkbox follows), text and props without touching the rest', () => {
    expect(patchNodeLine('- [ ] task:a Do it (owner: alex)', { status: 'done' })).toBe('- [x] task:a Do it (owner: alex)');
    expect(patchNodeLine('- [x] tk:a Do it', { status: 'in-progress' })).toBe('- [ ] task:a Do it #in-progress');
    expect(patchNodeLine('goal:g1 Ship it #on-track (target: 2026-10)', { props: { owner: 'bo', target: null }, text: 'Ship it all' })).toBe('goal:g1 Ship it all #on-track (owner: bo)');
    expect(patchNodeLine('1. rule:x Text', { status: 'approved' })).toBe('1. rule:x Text #approved');
    expect(patchNodeLine('plain text', { status: 'x' })).toBeNull();
  });
});
