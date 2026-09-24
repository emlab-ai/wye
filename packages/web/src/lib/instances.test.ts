import { describe, it, expect } from 'vitest';
import { newInstanceCard, appendCard, pluralTitle, collectionDoc, appendRow, newInstanceRow } from './instances';
import type { TypeDef } from './graph';

const team: TypeDef = { id: 'type:team', slug: 'team', extends: 'type:node', chain: ['type:node', 'type:team'], open: false, purpose: '', home: '', file: 'x.md', line: 1, props: [
  { name: 'title', from: 'type:node', type: 'string', ref: null, many: false, required: false, inverse: null, enum: null },
  { name: 'name', from: 'type:team', type: 'string', ref: null, many: false, required: true, inverse: null, enum: null },
  { name: 'members', from: 'type:team', type: 'list of person', ref: 'person', many: true, required: true, inverse: 'memberOf', enum: null },
  { name: 'size', from: 'type:team', type: 'number', ref: null, many: false, required: false, inverse: null, enum: null }] };

describe('instances', () => {
  it('card has the id, title and required properties as empty keys', () => {
    expect(newInstanceCard(team, 'team:platform', 'Platform')).toBe('- id: team:platform\n  title: Platform\n  name:\n  members: []');
  });
  it('appends into the last yaml fence', () => {
    const md = '# Doc\n\n```yaml\n- id: team:a\n  name: A\n```\n\nText after.\n';
    expect(appendCard(md, '- id: team:b')).toBe('# Doc\n\n```yaml\n- id: team:a\n  name: A\n- id: team:b\n```\n\nText after.\n');
  });
  it('adds a fence when the document has none', () => {
    expect(appendCard('# Doc\n\nText.\n', '- id: team:b')).toBe('# Doc\n\nText.\n\n```yaml\n- id: team:b\n```\n');
  });
});

describe('collection document (decision:ontology.collection-document)', () => {
  it('pluralises the type name in English unless the card says otherwise', () => {
    expect(pluralTitle({ ...team, slug: 'city' })).toBe('Cities');
    expect(pluralTitle({ ...team, slug: 'bug' })).toBe('Bugs');
    expect(pluralTitle({ ...team, slug: 'box' })).toBe('Boxes');
    expect(pluralTitle({ ...team, slug: 'match' })).toBe('Matches');
    expect(pluralTitle({ ...team, slug: 'day' })).toBe('Days');
    expect(pluralTitle({ ...team, slug: 'test-case' })).toBe('Test cases');
    expect(pluralTitle({ ...team, slug: 'person', plural: 'People' })).toBe('People');
  });
  it('the document is the blank page with one table block of the type', () => {
    const md = collectionDoc('---\nnode: module:cities\ntitle: Cities\n---\n\n# Cities\n\nWrite here. Anything.\n', 'city');
    expect(md).toContain('<!-- table:city -->\n<!-- /table:city -->');
    expect(md).not.toContain('Write here.');
    // the collection page carries the one card a blank page does not: it is the home of the type
    expect(md).toContain('```yaml\nid: module:cities\npurpose: every city of the product, one row each — the home of type:city\n```');
    expect(md).toContain('purpose: every city of the product, one row each');
  });
  it('a row goes before the closing marker; a document without the table gets one', () => {
    expect(appendRow('# Cities\n\n<!-- table:city -->\n- city:paris Paris\n<!-- /table:city -->\n', 'city', '- city:london London'))
      .toBe('# Cities\n\n<!-- table:city -->\n- city:paris Paris\n- city:london London\n<!-- /table:city -->\n');
    expect(appendRow('# Bugs\n\nText.\n', 'bug', '- bug:x X')).toBe('# Bugs\n\nText.\n\n<!-- table:bug -->\n- bug:x X\n<!-- /table:bug -->\n');
  });
  it('the row is the id and the title', () => {
    expect(newInstanceRow('city:london', 'London')).toBe('- city:london London');
    expect(newInstanceRow('city:london', '')).toBe('- city:london london');
  });
});
