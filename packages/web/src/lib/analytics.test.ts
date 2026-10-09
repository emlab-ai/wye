import { describe, it, expect } from 'vitest';
import { analyticsQueryString, bucketOf, buildAnalytics, cellKey, days, facetsOf, nextBucket, parseAnalyticsQuery, spanOf, ticksFor, type AnalyticsQuery } from './analytics';
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

describe('time buckets', () => {
  it('puts a date in its day, week, month, quarter or year, keyed to sort in time', () => {
    expect(bucketOf('2026-09-03', 'day')).toEqual({ key: '2026-09-03', label: '09-03', id: '' });
    expect(bucketOf('2026-09-03', 'week')!.key).toBe('2026-08-31');            // the Monday
    expect(bucketOf('2026-09-03', 'month')).toEqual({ key: '2026-09', label: 'Sep 26', id: '' });
    expect(bucketOf('2026-09-03', 'quarter')).toEqual({ key: '2026-Q3', label: '2026 Q3', id: '' });
    expect(bucketOf('2026-09-03', 'year')!.key).toBe('2026');
    expect(bucketOf('soon', 'month')).toBeNull();
  });
  it('steps to the next bucket, across a year end', () => {
    expect(nextBucket('2026-12', 'month')).toBe('2027-01');
    expect(nextBucket('2026-Q4', 'quarter')).toBe('2027-Q1');
    expect(nextBucket('2026-08-31', 'week')).toBe('2026-09-07');
    expect(nextBucket('2026', 'year')).toBe('2027');
  });
});

describe('the query line', () => {
  it('round-trips what a page holds', () => {
    const q = parseAnalyticsQuery('kind=task,goal y=worker.part-of,worker x=when:month,status from=2026-09-01 to=2026-12-31 status=open,in-progress q="log in" owner=ana');
    expect(q.kinds).toEqual(['task', 'goal']);
    expect(q.y).toEqual([{ key: 'worker.part-of' }, { key: 'worker' }]);
    expect(q.x).toEqual([{ key: 'when', bucket: 'month' }, { key: 'status' }]);
    expect([q.from, q.to, q.q, q.status]).toEqual(['2026-09-01', '2026-12-31', 'log in', ['open', 'in-progress']]);
    expect(q.props).toEqual({ owner: 'ana' });
    expect(parseAnalyticsQuery(analyticsQueryString(q))).toEqual(q);
  });
  it('reads a timeline page\'s rows= as y=, with the track it always had', () => {
    const q = parseAnalyticsQuery('kind=task rows=worker.part-of,worker', { legacyTrack: true });
    expect(q.y.map(d => d.key)).toEqual(['worker.part-of', 'worker']);
    expect(q.x).toEqual([{ key: 'when', bucket: 'span' }]);
    expect(parseAnalyticsQuery('kind=task rows=worker').x).toEqual([]);                        // a new page: no track unless asked
    expect(parseAnalyticsQuery('kind=task rows=worker x=status', { legacyTrack: true }).x).toEqual([{ key: 'status' }]);   // the page said what its columns are
  });
  it('keeps a track as the last column level, and off the rows', () => {
    expect(parseAnalyticsQuery('x=when:span,status').x).toEqual([{ key: 'status' }, { key: 'when', bucket: 'span' }]);
    expect(parseAnalyticsQuery('y=when:span,worker').y).toEqual([{ key: 'worker' }]);
    expect(parseAnalyticsQuery('x=due:never').x).toEqual([{ key: 'due', bucket: 'month' }]);   // an unknown bucket is a month
  });
});

describe('the grid', () => {
  const g = {
    nodes: [
      node('team:pos', '', { title: 'POS' }),
      node('person:ana', 'part-of: team:pos', { title: 'Ana' }),
      node('person:bo', 'part-of: team:pos', { title: 'Bo' }),
      node('task:a', 'worker: person:ana\nstarts: 2026-09-01\nends: 2026-09-05', { title: 'Wire the till', status: 'open' }),
      node('task:b', 'worker: person:ana\nstarts: 2026-09-08\nduration: 3d', { title: 'Print a receipt', status: 'done' }),
      node('task:c', 'worker: person:bo\ndue: 2026-11-20', { title: 'Cash drawer', status: 'open' }),
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
  const run = (q: string, legacy = false): ReturnType<typeof buildAnalytics> => buildAnalytics(g, idx, parseAnalyticsQuery(q, { legacyTrack: legacy }) as AnalyticsQuery);
  const rowLabels = (a: ReturnType<typeof run>) => a.rows.map(r => r.steps.map(s => s.label).join(' ▸ '));
  const colLabels = (a: ReturnType<typeof run>) => a.cols.map(c => c.steps.map(s => s.label).join(' ▸ '));
  const at = (a: ReturnType<typeof run>, r: number, c: number) => (a.cells[cellKey(a.rows[r], a.cols[c])]?.items ?? []).map(i => i.title);

  it('crosses the rows with the columns: a person\'s work by status', () => {
    const a = run('kind=task y=worker x=status');
    expect(rowLabels(a)).toEqual(['Ana', 'Bo', '—']);
    expect(colLabels(a)).toEqual(['open', 'done']);               // a type's statuses in their order, not the alphabet
    expect(at(a, 0, 0)).toEqual(['Wire the till', 'No dates at all']);
    expect(at(a, 0, 1)).toEqual(['Print a receipt']);
    expect(at(a, 2, 0)).toEqual(['Nobody owns me']);
    expect(a.rows[0].steps[0].id).toBe('person:ana');            // a row that names a node can open it
    expect([a.span, a.total, a.undated]).toEqual([false, 5, 0]);  // off a track, a node with no dates is a card like any other
  });
  it('groups by a path of links: a person under their team', () => {
    const a = run('kind=task y=worker.part-of,worker');
    expect(rowLabels(a)).toEqual(['POS ▸ Ana', 'POS ▸ Bo', '— ▸ —']);
    expect(a.rows[0].steps.map(s => s.id)).toEqual(['team:pos', 'person:ana']);
    expect(colLabels(a)).toEqual(['all']);
  });
  it('buckets time on an axis and fills the months nothing fell in', () => {
    const a = run('kind=task x=when:month');
    expect(colLabels(a)).toEqual(['Sep 26', 'Oct 26', 'Nov 26', '—']);   // October is empty but still a column; the undated last
    expect(at(a, 0, 0)).toEqual(['Wire the till', 'Nobody owns me', 'Print a receipt']);   // in the order they start
    expect(at(a, 0, 1)).toEqual([]);
    expect(at(a, 0, 2)).toEqual(['Cash drawer']);
    expect(at(a, 0, 3)).toEqual(['No dates at all']);
    expect(colLabels(run('kind=task x=when:quarter'))).toEqual(['2026 Q3', '2026 Q4', '—']);
    expect(colLabels(run('kind=task x=due:month'))).toEqual(['Nov 26', '—']);   // a field, not the page's own answer
  });
  it('draws a track on a span column: the old timeline, lanes and window included', () => {
    const a = run('kind=task,goal y=kind', true);
    expect(a.span).toBe(true);
    expect(colLabels(a)).toEqual(['when']);
    expect([a.from, a.to]).toEqual(['2026-09-01', '2026-11-20']);
    expect([a.total, a.undated]).toEqual([5, 1]);                   // a task with no dates is counted, not drawn
    const goals = a.cells[cellKey(a.rows.find(r => r.steps[0].label === 'goal')!, a.cols[0])];
    expect(goals.lanes).toBe(1);
    const tasks = a.cells[cellKey(a.rows.find(r => r.steps[0].label === 'task')!, a.cols[0])];
    expect(tasks.lanes).toBeGreaterThan(1);                          // 09-01→09-05 and 09-02→09-03 cannot share a lane
    expect(tasks.items.find(i => i.id === 'task:a')!.lane).toBe(0);
    expect(tasks.items.find(i => i.id === 'task:d')!.lane).toBe(1);
    expect(tasks.items.find(i => i.id === 'task:b')!.lane).toBe(0);  // 09-08 is clear of 09-05, so back to the first lane
    expect(run('kind=task from=2026-09-06 to=2026-09-30', true).from).toBe('2026-09-06');   // the window the page asked for
  });
  it('splits a track by the column levels before it', () => {
    const a = run('kind=task x=status,when:span');
    expect(colLabels(a)).toEqual(['open', 'done']);
    expect(a.span).toBe(true);
  });
  it('groups by a plain property, a kind, or nothing at all', () => {
    expect(rowLabels(run('kind=task y=status'))).toEqual(['open', 'done']);
    expect(rowLabels(run('kind=task,goal y=kind')).sort()).toEqual(['goal', 'task']);
    expect(rowLabels(run('kind=task'))).toEqual(['everything']);
    expect(colLabels(run('kind=task'))).toEqual(['all']);
  });
  it('filters by any property, by a path, by several values at once, and by nothing at all', () => {
    const ids = (q: string) => Object.values(run(q).cells).flatMap(c => c.items.map(i => i.id)).sort();
    expect(ids('kind=task worker=person:ana')).toEqual(['task:a', 'task:b', 'task:e']);      // by the id it points at
    expect(ids('kind=task worker=Ana')).toEqual(['task:a', 'task:b', 'task:e']);             // or by its title
    expect(ids('kind=task worker=ana,bo')).toEqual(['task:a', 'task:b', 'task:c', 'task:e']); // a comma is "or"
    expect(ids('kind=task worker.part-of=POS')).toEqual(['task:a', 'task:b', 'task:c', 'task:e']);
    expect(ids('kind=task worker=none')).toEqual(['task:d']);                       // the ones that say nothing for it
    expect(ids('kind=task worker=nobody-at-all')).toEqual([]);
  });
  it('filters by kind, status and a word before it groups', () => {
    const ids = (q: string) => Object.values(run(q).cells).flatMap(c => c.items.map(i => i.id)).sort();
    expect(ids('kind=task status=open y=worker')).toEqual(['task:a', 'task:c', 'task:d', 'task:e']);
    expect(ids('kind=task q=receipt')).toEqual(['task:b']);
  });
  it('writes a line under each card: who holds it, when it is due', () => {
    const a = run('kind=task y=worker');
    expect(at(a, 1, 0)).toEqual(['Cash drawer']);
    expect(a.cells[cellKey(a.rows[1], a.cols[0])].items[0].meta).toBe('Bo · due 11-20');
  });
  it('offers the properties and values the drawn nodes carry', () => {
    const f = facetsOf(g.nodes);
    expect(f.map(x => x.name)).toContain('worker');
    expect(f.find(x => x.name === 'worker')!.values).toEqual(['person:ana', 'person:bo']);
    expect(f.map(x => x.name)).not.toContain('starts');   // the dates are an axis, not a filter
  });
});

describe('the axis of a track', () => {
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
