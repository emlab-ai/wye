import { describe, it, expect } from 'vitest';
import { cardFromNode, cardPatchToNodePatch } from './embed';

describe('embed: a node from the API as a card, and a card edit as a node patch (component:embed-block)', () => {
  it('a yaml card keeps its body, text key and status', () => {
    const c = cardFromNode({ id: 'req:a', kind: 'req', status: 'proposed', body: 'id: req:a\ntitle: A thing\nwhen: x\nthen: y\nstatus: proposed' });
    expect(c).toMatchObject({ kind: 'req', slug: 'a', status: 'proposed', form: 'yaml', textKey: 'title', extra: '', check: '', row: '' });
    expect(c.body).toContain('when: x');
  });
  it('a prose node gets its text, status and the trailing group as extra; a task gets a checkbox', () => {
    const c = cardFromNode({ id: 'task:t', kind: 'task', status: 'done', body: 'id: task:t\ntext: Do it\nstatus: done\nowner: alex\nsession: abc', form: 'prose' });
    expect(c).toMatchObject({ kind: 'task', slug: 't', status: 'done', form: 'prose', textKey: 'text', extra: 'owner: alex, session: abc', check: 'done' });
  });
  it('a status change is a status patch; a body change patches only the keys that changed', () => {
    const c = cardFromNode({ id: 'decision:d', kind: 'decision', status: 'proposed', body: 'id: decision:d\ntitle: T\ncontext: old\nchoice: c\nstatus: proposed' });
    expect(cardPatchToNodePatch(c, { status: 'approved' })).toEqual({ status: 'approved' });
    expect(cardPatchToNodePatch(c, { body: 'id: decision:d\ntitle: T\ncontext: new\nchoice: c\nstatus: proposed' })).toEqual({ props: { context: 'new' } });
    expect(cardPatchToNodePatch(c, { body: 'id: decision:d\ntitle: T2\nchoice: c\nstatus: shipped' })).toEqual({ status: 'shipped', props: { title: 'T2', context: null } });
  });
  it('a prose node: the text goes as text, the extra group as props, the slug is ignored', () => {
    const c = cardFromNode({ id: 'task:t', kind: 'task', status: 'open', body: 'id: task:t\ntext: Do it\nstatus: open\nowner: alex', form: 'prose' });
    expect(cardPatchToNodePatch(c, { body: 'id: task:t\ntext: Do it now\nstatus: open\nowner: alex' })).toEqual({ text: 'Do it now' });
    expect(cardPatchToNodePatch(c, { extra: 'owner: bob, due: 2026-10' })).toEqual({ props: { owner: 'bob', due: '2026-10' } });
    expect(cardPatchToNodePatch(c, { extra: '' })).toEqual({ props: { owner: null } });
    expect(cardPatchToNodePatch(c, { slug: 'other' })).toEqual({});
    expect(cardPatchToNodePatch(c, { check: 'done', status: 'done' })).toEqual({ status: 'done' });
  });
});
