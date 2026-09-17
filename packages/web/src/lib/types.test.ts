import { describe, it, expect } from 'vitest';
import { typeOf, isA, instancesOf, nodeProps, inverseLabel, type TypeDef } from './types';
import { indexGraph, type GraphData } from './graph';
import { ID_RE, setKinds, idsIn } from './ids';

const node = (id: string, body: string, defined = true) => ({ id, kind: id.split(':')[0], title: id, status: '', section: '', subsection: '', body, defined, file: 'data/products/p/projects/x/docs/people.md', line: 1 });
const types: TypeDef[] = [
  { id: 'type:node', slug: 'node', extends: null, chain: ['type:node'], open: true, purpose: '', home: '', props: [{ name: 'title', from: 'type:node', type: 'string', ref: null, many: false, required: false, inverse: null, enum: null }], file: '', line: 0 },
  { id: 'type:person', slug: 'person', extends: 'type:node', chain: ['type:node', 'type:person'], open: false, purpose: 'a person', home: '', props: [
    { name: 'title', from: 'type:node', type: 'string', ref: null, many: false, required: false, inverse: null, enum: null },
    { name: 'name', from: 'type:person', type: 'string', ref: null, many: false, required: true, inverse: null, enum: null }], file: 'people.md', line: 3 },
  { id: 'type:employee', slug: 'employee', extends: 'type:person', chain: ['type:node', 'type:person', 'type:employee'], open: false, purpose: '', home: '', props: [
    { name: 'title', from: 'type:node', type: 'string', ref: null, many: false, required: false, inverse: null, enum: null },
    { name: 'name', from: 'type:person', type: 'string', ref: null, many: false, required: true, inverse: null, enum: null },
    { name: 'manager', from: 'type:employee', type: 'ref employee', ref: 'employee', many: false, required: true, inverse: 'reports', enum: null }], file: 'people.md', line: 9 },
];
const g: GraphData = {
  generatedAt: '', modules: [], files: [], fieldIndex: {}, kinds: ['req', 'person', 'employee'], types, inverses: { manager: 'reports', reports: 'manager' },
  nodes: [node('person:ana', 'id: person:ana\nname: Ana'), node('employee:bo', 'id: employee:bo\nname: Bo\nmanager: employee:cy'), node('employee:cy', '', false), node('type:person', 'id: type:person')],
  edges: [{ from: 'employee:bo', to: 'employee:cy', verb: 'manager' }, { from: 'employee:cy', to: 'employee:bo', verb: 'reports', generated: true }],
};

describe('types', () => {
  it('typeOf / isA follow the kind prefix and the extends chain', () => {
    expect(typeOf(g, 'employee:bo')?.id).toBe('type:employee');
    expect(isA(g, 'employee:bo', 'person')).toBe(true);
    expect(isA(g, 'person:ana', 'employee')).toBe(false);
    expect(isA(g, 'req:x', 'node')).toBe(true);
  });
  it('instancesOf lists defined nodes of the type and its subtypes', () => {
    expect(instancesOf(g, 'person').map(n => n.id)).toEqual(['employee:bo', 'person:ana']);
    expect(instancesOf(g, 'employee').map(n => n.id)).toEqual(['employee:bo']);
  });
  it('nodeProps merges effective properties with the values the node fills in', () => {
    const p = nodeProps(g, g.nodes[1]);
    expect(p.map(x => [x.name, x.value, x.from])).toEqual([['title', '', 'type:node'], ['name', 'Bo', 'type:person'], ['manager', 'employee:cy', 'type:employee']]);
  });
  it('inverseLabel names an incoming edge from the target side', () => {
    expect(inverseLabel(g, 'manager')).toBe('reports');
    expect(inverseLabel(g, 'refines')).toBe('');
  });
});

describe('open kinds', () => {
  it('setKinds makes instance ids of declared types recognisable', () => {
    expect(idsIn('see person:ana and req:x')).toEqual(['req:x']);
    setKinds(['req', 'person']);
    expect(idsIn('see person:ana and req:x')).toEqual(['person:ana', 'req:x']);
    expect(new RegExp(ID_RE.source).test('person:ana')).toBe(true);
    const idx = indexGraph(g);
    expect((idx.out.get('employee:cy') ?? []).length).toBe(0); // generated edges are not indexed in the web
  });
});
