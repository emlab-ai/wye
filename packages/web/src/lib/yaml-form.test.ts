import { describe, it, expect } from 'vitest';
import { bodyToFields, fieldsToBody, setBodyField } from './yaml-form';

const body = `id: req:m.a
title: A
when: x happens
then: y follows
status: proposed
satisfied-by: [rule:r1, op:o1]
requires-tests: []
note: >
  a long note
  over two lines
fields:
  alpha: string   # note
  beta: int`;

describe('bodyToFields', () => {
  it('classifies keys and flattens lists and block scalars', () => {
    const { id, fields } = bodyToFields(body);
    expect(id).toBe('req:m.a');
    expect(fields.map(f => [f.key, f.kind])).toEqual([['title', 'text'], ['when', 'prose'], ['then', 'prose'], ['status', 'text'], ['satisfied-by', 'list'], ['requires-tests', 'list'], ['note', 'prose'], ['fields', 'nested']]);
    expect(fields.find(f => f.key === 'satisfied-by')?.value).toBe('rule:r1, op:o1');
    expect(fields.find(f => f.key === 'note')?.value).toBe('a long note over two lines');
    expect(fields.find(f => f.key === 'fields')?.value).toBe('  alpha: string   # note\n  beta: int');
  });
});

describe('fieldsToBody', () => {
  it('round-trips the same keys in order', () => {
    const { id, fields } = bodyToFields(body);
    const out = fieldsToBody(id, fields);
    expect(out).toBe(`id: req:m.a
title: A
when: x happens
then: y follows
status: proposed
satisfied-by: [rule:r1, op:o1]
requires-tests: []
note: a long note over two lines
fields:
  alpha: string   # note
  beta: int`);
    expect(bodyToFields(out).fields.map(f => f.value)).toEqual(fields.map(f => f.value));
  });
  it('drops empty text fields and wraps long prose into a block scalar', () => {
    const out = fieldsToBody('rule:x', [{ key: 'statement', value: 'w '.repeat(70).trim(), kind: 'prose' }, { key: 'source', value: '', kind: 'text' }]);
    expect(out.startsWith('id: rule:x\nstatement: >\n  ')).toBe(true);
    expect(out).not.toContain('source');
  });
});

describe('setBodyField', () => {
  it('adds, replaces and removes a prose field without touching the others', () => {
    const body = 'id: question:x\ntitle: T\nq: Why?\nstatus: open\nrelated-to: [goal:a]';
    expect(setBodyField(body, 'answer', 'Because.')).toBe('id: question:x\ntitle: T\nq: Why?\nanswer: Because.\nstatus: open\nrelated-to: [goal:a]');
    expect(setBodyField(body, 'q', 'Why not?')).toBe('id: question:x\ntitle: T\nq: Why not?\nstatus: open\nrelated-to: [goal:a]');
    expect(setBodyField(setBodyField(body, 'answer', 'x'), 'answer', '')).toBe(body);
  });
  it('keeps a block scalar under any key (a decision\'s alternatives) when another field is edited', () => {
    const long = 'a '.repeat(60).trim();
    const body = `id: decision:x\ntitle: T\ncontext: C\nchoice: X\nalternatives: >\n  ${long}\ndate: 2026-09-18\nstatus: proposed\naffects: [rule:a]`;
    const out = setBodyField(body, 'choice', 'Y');
    expect(out).toContain('choice: Y\nalternatives: >\n  ');
    expect(out).not.toContain(`alternatives: ${long}`);
    expect(out.endsWith('date: 2026-09-18\nstatus: proposed\naffects: [rule:a]')).toBe(true);
  });
});
