import { describe, it, expect } from 'vitest';
import { newInstanceCard, appendCard } from './instances';
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
