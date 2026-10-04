import { describe, it, expect } from 'vitest';
import { triage, groupFiles, idIndex, typesSection, laneMessage, laneSystem, type BriefNode, type LaneFile } from './import-brief';

const nodes: BriefNode[] = [
  { id: 'type:person', kind: 'type', title: 'someone', defined: true, body: 'id: type:person\npurpose: someone the director works with\nhome: module:persons\nprops:\n  name: string\n  aliases: list of string?   # other names\n  reports-to: ref person? -(inverse)-> reports\nopen: true' },
  { id: 'type:project', kind: 'type', title: 'a project', defined: true, body: 'id: type:project\npurpose: a body of work' },
  { id: 'person:ea.jane-roe', kind: 'person', title: 'Jane Roe', defined: true, body: 'name: Jane Roe\naliases: [Jane, JR]\nrole: EM' },
  { id: 'project:ea.atlas', kind: 'project', title: 'Atlas', defined: true, body: '' },
  { id: 'task:ea.x', kind: 'task', title: 'do x', defined: true },
  { id: 'meeting:ea.m1', kind: 'meeting', title: 'sync', defined: true },
];
const file = (index: number, from: string, text: string): LaneFile => ({ index, slug: `f${index}`, ref: `ea/assistant/f${index}`, title: `F${index}`, from, text });

describe('the import brief', () => {
  it('lists the types with purpose, home and fields', () => {
    const t = typesSection(nodes);
    expect(t).toContain('`type:person` — someone the director works with · home module:persons · name: string; aliases: list of string?; reports-to: ref person?');
    expect(t).toContain('`type:project` — a body of work');
  });
  it('indexes the things notes mention, with their other names, and leaves out work and statements', () => {
    const i = idIndex(nodes);
    expect(i).toContain('- person:ea.jane-roe Jane Roe (also: Jane, JR) — EM');
    expect(i).toContain('project:ea.atlas Atlas');
    expect(i).not.toContain('task:ea.x'); expect(i).not.toContain('meeting:ea.m1');
  });
  it('the system text is the skill, the lane protocol, the types, the ids and an example page', () => {
    const s = laneSystem({ product: 'ea', skill: '# Import a document', nodes, example: { ref: 'ea/assistant/done', text: '# Done\nbody' } });
    expect(s.indexOf('# Import a document')).toBe(0);
    expect(s).toContain('## This is an import lane'); expect(s).toContain('wye check --root data/products/ea');
    expect(s).toContain('## A page this import already finished (`ea/assistant/done`)');
  });
});

describe('sorting the files', () => {
  it('skips templates, prompt snippets, drawings and near-empty notes; short notes are small, long ones dense', () => {
    expect(triage('Vault/Templates/{{person}}.md', '# T\n' + 'x'.repeat(500))).toBe('skip');
    expect(triage('Vault/copilot-custom-prompts/Emojify.md', 'x'.repeat(500))).toBe('skip');
    expect(triage('Vault/Drawing 1.excalidraw.md', 'x'.repeat(500))).toBe('skip');
    expect(triage('Vault/calm.md', '---\ntitle: Calm\n---\n# Calm\n\n[[link]]\n')).toBe('skip');
    expect(triage('Vault/People/Jane.md', '# Jane\n\nEM on Atlas; weekly 1:1 on Tuesdays, prefers async updates.')).toBe('small');
    expect(triage('Vault/Meetings/sync.md', '# Sync\n\n' + 'decision text '.repeat(300))).toBe('dense');
  });
  it('short notes go up to four in a message, dense ones alone, short ones first', () => {
    const fs = [1, 2, 3, 4, 5].map(i => file(i, `P/${i}.md`, 'short note text '.repeat(10))).concat([file(6, 'M/big.md', 'long '.repeat(1000))]);
    const g = groupFiles(fs, f => triage(f.from, f.text));
    expect(g.map(x => [x.kind, x.files.map(f => f.index)])).toEqual([['small', [1, 2, 3, 4]], ['small', [5]], ['dense', [6]]]);
  });
  it('a message carries each page verbatim in a fence longer than any it contains', () => {
    const m = laneMessage('Import: Vault', [file(1, 'a.md', 'x\n```js\ncode\n```\n')]);
    expect(m).toContain('````markdown\nx\n```js\ncode\n```\n\n````');
    expect(m.startsWith('Import: Vault: the next page.')).toBe(true);
  });
});
