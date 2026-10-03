import { describe, it, expect } from 'vitest';
import { parseCard, placeCard } from './propose-card';

describe('parseCard', () => {
  it('takes one card and returns its id and the block as a list item', () => {
    const r = parseCard('id: req:a\ntitle: A thing\nstatus: proposed\naffects:\n  - req:b\ntext: >\n  two lines\n  of prose');
    expect(r).toEqual({ id: 'req:a', block: '- id: req:a\n  title: A thing\n  status: proposed\n  affects:\n    - req:b\n  text: >\n    two lines\n    of prose' });
  });
  it('keeps a title with a colon in it (wye cards are not strict yaml)', () => {
    expect(parseCard('- id: decision:x\n  title: Ontology: a type goes home\n  status: proposed')).toMatchObject({ id: 'decision:x' });
  });
  it('refuses a second card, nested or not', () => {
    expect(parseCard('- id: test:a\n  title: A\n  status: proposed\n  - id: test:b\n    title: B')).toMatchObject({ error: expect.stringMatching(/one card/) });
    expect(parseCard('- id: test:a\n  status: proposed\n- id: test:b\n  status: proposed')).toMatchObject({ error: expect.stringMatching(/one card/) });
  });
  it('refuses a key given twice (the old and the new title of an edited card)', () => {
    expect(parseCard('- id: test:a\n  title: old\n  status: proposed\n  title: new')).toMatchObject({ error: expect.stringMatching(/title.*twice/) });
  });
  it('refuses indentation that drops below the card\'s keys', () => {
    expect(parseCard('- id: test:a\n    title: deep\n    status: proposed\n  text: shallow')).toMatchObject({ error: expect.stringMatching(/indent/) });
  });
  it('still needs an id and a status', () => {
    expect(parseCard('title: no id\nstatus: proposed')).toMatchObject({ error: expect.stringMatching(/id/) });
    expect(parseCard('- id: req:a\n  title: A')).toMatchObject({ error: expect.stringMatching(/status/) });
  });
});

const PR = '# R\n\n## Request\n\nx\n\n## Definition\n\n```yaml\n- id: req:a\n  status: proposed\n```\n\n## Tasks\n\n- [ ] task:t\n\n## Result\n\nsummary\n';
describe('placeCard', () => {
  it('puts a card on a request page at the end of its Definition, never under Result', () => {
    const out = placeCard(PR, '```yaml\n- id: test:b\n  status: proposed\n```');
    expect(out.indexOf('test:b')).toBeGreaterThan(out.indexOf('req:a'));
    expect(out.indexOf('test:b')).toBeLessThan(out.indexOf('## Tasks'));
    expect(out.endsWith('summary\n')).toBe(true);
  });
  it('appends to an ordinary document', () => {
    expect(placeCard('# Tests\n\nsome text\n', '```yaml\n- id: test:b\n```')).toBe('# Tests\n\nsome text\n\n```yaml\n- id: test:b\n```\n');
  });
});
