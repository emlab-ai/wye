import { describe, it, expect } from 'vitest';
import { instanceTable, parseFilters, filterRows, groupRows, sortRows, filtersToQuery, parseViewQuery, viewQuery, type InstanceRow } from './instance-table';
import type { GraphData, GraphNode, TypeDef } from './graph';

const P = (name: string, from: string, type: string, extra: Partial<TypeDef['props'][number]> = {}) => ({ name, from, type, ref: null, many: false, required: false, inverse: null, enum: null, ...extra });
const bug: TypeDef = { id: 'type:bug', slug: 'bug', extends: 'type:node', chain: ['type:node', 'type:bug'], open: false, purpose: '', home: '', file: 'x.md', line: 1, props: [
  P('title', 'type:node', 'string'), P('status', 'type:node', 'string'), P('text', 'type:node', 'text'),
  P('priority', 'type:bug', 'enum [low, high]', { enum: ['low', 'high'] }),
  P('owner', 'type:bug', 'ref person', { ref: 'person' }),
  P('blocking', 'type:bug', 'bool'),
  P('notes', 'type:bug', 'text')] };
const N = (id: string, body: string, status = 'open', file = 'data/products/p/projects/v2/docs/bugs.md'): GraphNode => ({ id, kind: id.split(':')[0], title: id.slice(id.indexOf(':') + 1), status, section: '', subsection: '', body, defined: true, file, line: 1 });
const g: GraphData = { generatedAt: '', modules: [], files: [], fieldIndex: {}, edges: [{ from: 'lib:a', to: 'req:x', verb: 'satisfied-by' }, { from: 'lib:a', to: 'field:y', verb: 'mentions' }], types: [bug], nodes: [
  N('bug:login', 'priority: high\nowner: person:ann\nblocking: true', 'open'),
  N('bug:logo', 'priority: low\nowner: person:bob', 'done', 'data/products/p/projects/v2/docs/ui.md'),
  N('bug:crash', 'priority: high', 'open'),
  N('lib:a', 'purpose: x'), N('req:x', ''), N('person:ann', '')] };

describe('instanceTable', () => {
  it('a declared type: one column per scalar / ref property, long text left out, rows carry the values', () => {
    const t = instanceTable(g, 'bug');
    expect(t.columns.map(c => c.name)).toEqual(['priority', 'owner', 'blocking']);
    expect(t.columns.map(c => c.kind)).toEqual(['enum', 'ref', 'bool']);
    expect(t.columns[0].options).toEqual(['low', 'high']);
    expect(t.rows.map(r => r.id)).toEqual(['bug:crash', 'bug:login', 'bug:logo']);
    expect(t.rows[1].props).toEqual({ priority: 'high', owner: 'person:ann', blocking: 'true' });
    expect(t.rows[1].doc).toBe('v2 / bugs');
    expect(t.statuses).toEqual([['open', 2], ['done', 1]]);
  });
  it('a kind without a type: no property columns, relations on the row', () => {
    const t = instanceTable(g, 'lib');
    expect(t.columns).toEqual([]);
    expect(t.rows.map(r => r.id)).toEqual(['lib:a']);
    expect(t.rows[0].rels).toEqual([{ verb: 'satisfied-by', to: 'req:x' }]);
  });
});

const rows = (): InstanceRow[] => instanceTable(g, 'bug').rows;

describe('filters', () => {
  it('parse from the URL: q, status, group, sort and property values; everything else ignored', () => {
    expect(parseFilters(new URLSearchParams('q=log&status=open&group=priority&sort=-owner&priority=high&x=1'), ['priority', 'owner'])).toEqual({ q: 'log', status: 'open', group: 'priority', sort: '-owner', props: { priority: 'high' } });
    expect(parseFilters(new URLSearchParams(''), [])).toEqual({ q: '', status: '', group: '', sort: '', props: {} });
  });
  it('round-trip to a query string, empty values dropped', () => {
    expect(filtersToQuery({ q: '', status: 'open', group: '', sort: '', props: { priority: 'high', owner: '' } })).toBe('status=open&priority=high');
    expect(filtersToQuery({ q: '', status: '', group: '', sort: '', props: {} })).toBe('');
  });
  it('search matches id, title and property values', () => {
    expect(filterRows(rows(), { q: 'ann', status: '', group: '', sort: '', props: {} }).map(r => r.id)).toEqual(['bug:login']);
    expect(filterRows(rows(), { q: 'LOG', status: '', group: '', sort: '', props: {} }).map(r => r.id)).toEqual(['bug:login', 'bug:logo']);
  });
  it('status and property filters narrow; a ref filter matches the id inside a list', () => {
    expect(filterRows(rows(), { q: '', status: 'done', group: '', sort: '', props: {} }).map(r => r.id)).toEqual(['bug:logo']);
    expect(filterRows(rows(), { q: '', status: '', group: '', sort: '', props: { priority: 'high' } }).map(r => r.id)).toEqual(['bug:crash', 'bug:login']);
    const list = rows().map(r => r.id === 'bug:crash' ? { ...r, props: { ...r.props, owner: '[person:bob, person:ann]' } } : r);
    expect(filterRows(list, { q: '', status: '', group: '', sort: '', props: { owner: 'person:ann' } }).map(r => r.id)).toEqual(['bug:crash', 'bug:login']);
    expect(filterRows(rows(), { q: '', status: '', group: '', sort: '', props: { blocking: 'true' } }).map(r => r.id)).toEqual(['bug:login']);
  });
});

describe('group and sort', () => {
  it('groups by a property, status or document; the empty bucket last', () => {
    expect(groupRows(rows(), 'priority')!.map(([k, rs]) => [k, rs.length])).toEqual([['high', 2], ['low', 1]]);
    expect(groupRows(rows(), 'doc')!.map(([k]) => k)).toEqual(['v2 / bugs', 'v2 / ui']);
    expect(groupRows(rows(), 'owner')!.map(([k]) => k)).toEqual(['person:ann', 'person:bob', '—']);
    expect(groupRows(rows(), '')).toBeNull();
  });
  it('sorts by a column, descending with a leading minus, ties by id', () => {
    expect(sortRows(rows(), 'status').map(r => r.id)).toEqual(['bug:logo', 'bug:crash', 'bug:login']);
    expect(sortRows(rows(), '-priority').map(r => r.id)).toEqual(['bug:logo', 'bug:crash', 'bug:login']);
    expect(sortRows(rows(), '').map(r => r.id)).toEqual(['bug:crash', 'bug:login', 'bug:logo']);
  });
});

describe('view line', () => {
  it('reads key=value pairs, a quoted value may hold spaces', () => {
    expect(parseViewQuery('status=open group=owner q="login page" owner=person:ann', ['owner'])).toEqual({ q: 'login page', status: 'open', group: 'owner', sort: '', props: { owner: 'person:ann' } });
    expect(parseViewQuery('', [])).toEqual({ q: '', status: '', group: '', sort: '', props: {} });
  });
  it('writes the filters back as key=value pairs, empty ones dropped, spaces quoted', () => {
    expect(viewQuery({ q: 'login page', status: 'open', group: '', sort: '-priority', props: { owner: 'person:ann', priority: '' } })).toBe('q="login page" status=open sort=-priority owner=person:ann');
    expect(viewQuery({ q: '', status: '', group: '', sort: '', props: {} })).toBe('');
  });
});
