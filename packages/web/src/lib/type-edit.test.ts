import { describe, it, expect } from 'vitest';
import { setTypeProps, propSpec, type OwnProp } from './type-edit';

const md = `# Ontology

\`\`\`yaml
- id: type:person
  extends: type:node
  purpose: a person
  props:
    name: string
    email: string?
- id: type:team
  extends: type:node
  props:
    members: list of person? -(inverse)-> memberOf
\`\`\`
`;
const props: OwnProp[] = [
  { name: 'name', type: 'string', required: true, inverse: '' },
  { name: 'role', type: 'enum [dev, pm]', required: false, inverse: '' },
  { name: 'manager', type: 'ref employee', required: false, inverse: 'reports' },
];

describe('type-edit', () => {
  it('propSpec writes the property line grammar', () => {
    expect(propSpec(props[0])).toBe('string');
    expect(propSpec(props[1])).toBe('enum [dev, pm]?');
    expect(propSpec(props[2])).toBe('ref employee? -(inverse)-> reports');
  });
  it('replaces the props block of the type card and leaves the rest alone', () => {
    const out = setTypeProps(md, 'type:person', props);
    expect(out.md).toContain('- id: type:person\n  extends: type:node\n  purpose: a person\n  props:\n    name: string\n    role: enum [dev, pm]?\n    manager: ref employee? -(inverse)-> reports\n- id: type:team');
    expect(out.md).toContain('members: list of person? -(inverse)-> memberOf');
  });
  it('adds a props block to a card without one, and removes it when empty', () => {
    const bare = '```yaml\n- id: type:tag\n  purpose: a tag\n```\n';
    expect(setTypeProps(bare, 'type:tag', [props[0]]).md).toBe('```yaml\n- id: type:tag\n  purpose: a tag\n  props:\n    name: string\n```\n');
    expect(setTypeProps(md, 'type:team', []).md).toContain('- id: type:team\n  extends: type:node\n```');
  });
  it('sets scalar keys of the card (purpose, extends, open)', () => {
    const out = setTypeProps(md, 'type:team', null, { purpose: 'a group', open: 'true' });
    expect(out.md).toContain('- id: type:team\n  extends: type:node\n  purpose: a group\n  open: true\n  props:');
  });
  it('reports a missing card', () => { expect(setTypeProps(md, 'type:nope', props).error).toBe('not_found'); });
});
