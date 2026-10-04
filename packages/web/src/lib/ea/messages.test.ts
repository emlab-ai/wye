import { describe, it, expect } from 'vitest';
import { validateMessages, planMessages } from './messages';

const model = { people: [{ id: 'person:ea.jane', title: 'Jane Roe', name: 'Jane Roe', role: '', aliases: ['JR'], reportsTo: '', status: 'approved' }], projects: [{ id: 'project:ea.atlas', title: 'Atlas' }] } as never;
const msg = { via: 'slack', id: 'C1/1', title: 'Ship this week?', channel: '#safety', from: 'JR', link: 'https://s/1', at: '2026-10-04T09:00:00Z', waiting: 'reply', project: 'Atlas' };

describe('messages pushed through intake', () => {
  it('each field is checked, every problem named', () => {
    const v = validateMessages([{ via: 'fax', id: 'x' }, { via: 'email', title: '', link: 'l', at: 'yesterday' }]);
    expect(v.ok).toBe(false);
    expect((v as { errors: string[] }).errors).toEqual(['messages[0].via must be "slack" or "email"', 'messages[1].id is required', 'messages[1].title is required', 'messages[1].at must be a date (YYYY-MM-DD or an ISO time), got "yesterday"']);
  });
  it('a new thread links who is waiting and the project, keeps the tool id, and is open', () => {
    const v = validateMessages([msg]); if (!v.ok) throw new Error();
    const [p] = planMessages(model, v.messages, 'ea', new Map(), new Set());
    expect(p).toMatchObject({ kind: 'thread', id: 'thread:ea.ship-this-week', status: 'open', exists: false, props: { from: 'person:ea.jane', project: 'project:ea.atlas', channel: '#safety', at: '2026-10-04', 'source-id': 'C1/1', waiting: 'reply' } });
  });
  it('the same tool id pushed again updates that card; answered is done', () => {
    const v = validateMessages([{ ...msg, via: 'email', answered: true }]); if (!v.ok) throw new Error();
    const [p] = planMessages(model, v.messages, 'ea', new Map([['email|C1/1', 'email:ea.old']]), new Set(['email:ea.old']));
    expect(p).toMatchObject({ kind: 'email', id: 'email:ea.old', exists: true, status: 'done' });
    expect(p.props.channel).toBeUndefined();
  });
});
