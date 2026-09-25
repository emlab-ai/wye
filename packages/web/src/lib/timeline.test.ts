import { describe, it, expect } from 'vitest';
import { buildTimeline, days, parseTimelineQuery, spanOf, ticksFor, timelineQueryString, type TimelineQuery } from './timeline';
import { indexGraph, type GraphData, type GraphNode } from './graph';

const node = (id: string, body = '', o: Partial<GraphNode> = {}): GraphNode =>
  ({ id, kind: id.split(':')[0], title: o.title ?? id.split(':')[1], status: '', section: '', subsection: '', body, defined: true, file: 'f.md', line: 1, ...o });

describe('when a node happens', () => {
  it('reads the plan, and lets a duration stand in for the missing end', () => {
    expect(spanOf(node('task:a', 'starts: 2026-09-01\nends: 2026-09-10'))).toEqual({ from: '2026-09-01', to: '2026-09-10', point: false });
    expect(spanOf(node('task:b', 'starts: 2026-09-01\nduration: 2w'))).toEqual({ from: '2026-09-01', to: '2026-09-15', point: false });
    expect(spanOf(node('task:c', 'ends: 2026-09-10\nduration: 3d'))).toEqual({ from: '2026-09-07', to: '2026-09-10', point: false });
  });
  it('takes a run\'s own words, and a due date as a point', () => {
    expect(spanOf(node('run:r', 'started: 2026-09-22T10:04:00.000Z\nfinished: 2026-09-24T09:00:00.000Z'))).toEqual({ from: '2026-09-22', to: '2026-09-24', point: false });
    expect(spanOf(node('task:d', 'due: 2026-10-01'))).toEqual({ from: '2026-10-01', to: '2026-10-01', point: true });
    expect(spanOf(node('task:e', 'starts: 2026-09-05'))).toEqual({ from: '2026-09-05', to: '2026-09-05', point: true });
  });
  it('is nothing at all when the node says nothing about time, valid time included', () => {
    expect(spanOf(node('req:x', 'text: something'))).toBeNull();
    expect(spanOf(node('decision:y', 'since: 2026-01-01\nuntil: 2026-06-01'))).toBeNull();   // that is when it held, not when it happens
    expect(spanOf(node('task:z', 'due: soon'))).toBeNull();
  });
  it('reads a duration in days, weeks, months', () => {
    expect([days('3d'), days('2w'), days('1m'), days('5'), days('later')]).toEqual([3, 14, 30, 5, null]);
  });
});

describe('the query line', () => {
  it('round-trips what a page holds', () => {
    const q = parseTimelineQuery('kind=task,goal rows=worker.part-of,worker from=2026-09-01 to=2026-12-31 status=open,in-progress q="log in" owner=ana');
    expect(q.kinds).toEqual(['task', 'goal']);
    expect(q.rows).toEqual(['worker.part-of', 'worker']);
    expect([q.from, q.to, q.q, q.status]).toEqual(['2026-09-01', '2026-12-31', 'log in', ['open', 'in-progress']]);
    expect(q.props).toEqual({ owner: 'ana' });
    expect(parseTimelineQuery(timelineQueryString(q))).toEqual(q);
  });
});

describe('the rows of a chart', () => {
  const g = {
    nodes: [
      node('team:pos', '', { title: 'POS' }),
      node('person:ana', 'part-of: team:pos', { title: 'Ana' }),
      node('person:bo', 'part-of: team:pos', { title: 'Bo' }),
      node('task:a', 'worker: person:ana\nstarts: 2026-09-01\nends: 2026-09-05', { title: 'Wire the till', status: 'open' }),
      node('task:b', 'worker: person:ana\nstarts: 2026-09-08\nduration: 3d', { title: 'Print a receipt', status: 'done' }),
      node('task:c', 'worker: person:bo\ndue: 2026-09-20', { title: 'Cash drawer', status: 'open' }),
      node('task:d', 'starts: 2026-09-02\nends: 2026-09-03', { title: 'Nobody owns me', status: 'open' }),
      node('task:e', 'worker: person:ana', { title: 'No dates at all', status: 'open' }),
      node('goal:fast', 'starts: 2026-09-01\nends: 2026-09-30', { title: 'Fast checkout' }),
    ],
    edges: [
      { from: 'person:ana', verb: 'part-of', to: 'team:pos' },
      { from: 'person:bo', verb: 'part-of', to: 'team:pos' },
      { from: 'task:a', verb: 'worker', to: 'person:ana' },
      { from: 'task:b', verb: 'worker', to: 'person:ana' },
      { from: 'task:c', verb: 'worker', to: 'person:bo' },
      { from: 'task:e', verb: 'worker', to: 'person:ana' },
    ],
  } as unknown as GraphData;
  const idx = indexGraph(g);
  const run = (q: string): ReturnType<typeof buildTimeline> => buildTimeline(g, idx, parseTimelineQuery(q) as TimelineQuery);

  it('groups by a path of links: a person under their team', () => {
    const t = run('kind=task rows=worker.part-of,worker');
    expect(t.rows.map(r => r.labels.join(' ▸ '))).toEqual(['POS ▸ Ana', 'POS ▸ Bo', '— ▸ —']);
    expect(t.rows[0].items.map(i => i.title)).toEqual(['Wire the till', 'Print a receipt']);
    expect(t.rows[0].ids).toEqual(['team:pos', 'person:ana']);
    // a task with no dates is counted, not drawn; the window covers what is drawn
    expect([t.total, t.undated]).toEqual([4, 1]);
    expect([t.from, t.to]).toEqual(['2026-09-01', '2026-09-20']);
  });
  it('stacks what overlaps into lanes, and leaves what does not on one', () => {
    const t = run('kind=task,goal rows=kind');
    const goals = t.rows.find(r => r.labels[0] === 'goal')!;
    expect(goals.lanes).toBe(1);
    const tasks = t.rows.find(r => r.labels[0] === 'task')!;
    expect(tasks.lanes).toBeGreaterThan(1);                       // 09-01→09-05 and 09-02→09-03 cannot share a lane
    expect(tasks.items.find(i => i.id === 'task:a')!.lane).toBe(0);
    expect(tasks.items.find(i => i.id === 'task:d')!.lane).toBe(1);
    expect(tasks.items.find(i => i.id === 'task:b')!.lane).toBe(0); // 09-08 is clear of 09-05, so back to the first lane
  });
  it('groups by a plain property, a kind, or nothing at all', () => {
    expect(run('kind=task rows=status').rows.map(r => r.labels[0]).sort()).toEqual(['done', 'open']);
    expect(run('rows=kind').rows.map(r => r.labels[0]).sort()).toEqual(['goal', 'task']);
    expect(run('kind=task').rows.map(r => r.labels[0])).toEqual(['everything']);
  });
  it('filters by kind, status, a word and a property before it groups', () => {
    expect(run('kind=task status=open rows=worker').rows.flatMap(r => r.items.map(i => i.id)).sort()).toEqual(['task:a', 'task:c', 'task:d']);
    expect(run('kind=task q=receipt').rows.flatMap(r => r.items.map(i => i.id))).toEqual(['task:b']);
    expect(run('kind=task worker=ana').rows.flatMap(r => r.items.map(i => i.id)).sort()).toEqual(['task:a', 'task:b']);
    expect(run('kind=task from=2026-09-06 to=2026-09-30').from).toBe('2026-09-06');   // the window the page asked for
  });
});

describe('the axis', () => {
  it('counts days while the window is short, then weeks, then months', () => {
    expect(ticksFor('2026-09-01', '2026-09-10').map(t => t.label)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']);
    const weeks = ticksFor('2026-09-01', '2026-12-01');
    expect(weeks.length).toBeGreaterThan(10);
    expect(weeks.every(t => /^\d{2}-\d{2}$/.test(t.label))).toBe(true);
    const months = ticksFor('2026-01-01', '2027-06-01');
    expect(months.map(t => t.label).slice(0, 3)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(ticksFor('', '')).toEqual([]);
  });
});
