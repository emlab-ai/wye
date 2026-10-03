import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { skillDocFromPrompt, attachedSkills, skillBody, BASE_SKILLS, followSource } from './skills';
import type { GraphData, GraphNode } from './graph';
import type { Scope } from './scope';
import { indexGraph } from './graph';

// skills (decision:wf2.hooks-and-skills): the prompts become documents; a session carries the skills attached to its PR and its refs' types
const node = (id: string, body = '', file = 'data/products/p/projects/x/docs/a.md'): GraphNode => ({ id, kind: id.split(':')[0], title: id, status: 'active', section: '', subsection: '', file, line: 1, body, defined: true });
const scopeOf = (nodes: GraphNode[]): Scope => { const graph: GraphData = { generatedAt: '', modules: [], files: [], nodes, edges: [], fieldIndex: {} }; return { product: { slug: 'p', dir: '/tmp/p', graphPath: '', meta: { title: 'P', icon: '', description: '', kind: '', status: '', settings: {} } }, projects: [], graph, idx: indexGraph(graph), index: {} }; };

describe('skills', () => {
  it('a prompt file becomes a skill document: the card in the frontmatter, the prompt under the title without its own heading', () => {
    const md = skillDocFromPrompt('# The prompt\n\nDo the thing.\n', BASE_SKILLS[3], 'module:x-skills');
    expect(md).toMatch(/^---\nnode: skill:define-tests\ntype: skill\ntitle: Define how a requirement is tested\n/);
    expect(md).toMatch(/role: librarian\ntakes: req\nwrites: \[test, ui-test, question\]\nsource: prompts\/define-tests\.md\nsource-hash: [0-9a-f]{12}\npart-of: module:x-skills\n---/);
    expect(md).toContain('# Define how a requirement is tested\n\nDo the thing.\n');
    expect(md).not.toContain('# The prompt');
  });
  it('a shipped copy follows its source until a person edits it', () => {
    const v1 = skillDocFromPrompt('# P\n\nOld rules.\n', BASE_SKILLS[3], 'module:x-skills');
    const v2 = skillDocFromPrompt('# P\n\nNew rules.\n', BASE_SKILLS[3], 'module:x-skills');
    const never = () => false;
    const next = followSource(v1, v2, never)!;
    expect(next).toContain('New rules.'); expect(next).not.toContain('Old rules.');
    expect(next.match(/source-hash: (\w+)/)![1]).toBe(v2.match(/source-hash: (\w+)/)![1]);
    expect(followSource(v2, v2, never)).toBeNull();                                  // nothing new
    const edited = v1.replace('Old rules.', 'Old rules, and my own line.');
    expect(followSource(edited, v2, never)).toBeNull();                              // the person's edit wins
    const paused = v1.replace('status: active', 'status: paused');
    expect(followSource(paused, v2, never)).toContain('status: paused');             // their frontmatter stays
  });
  it('a copy from before source-hash follows its source when its text is one Wye shipped', () => {
    const legacy = skillDocFromPrompt('# P\n\nOld rules.\n', BASE_SKILLS[3], 'module:x-skills').replace(/^source-hash: .*\n/m, '');
    const v2 = skillDocFromPrompt('# P\n\nNew rules.\n', BASE_SKILLS[3], 'module:x-skills');
    expect(followSource(legacy, v2, t => t === 'Old rules.')).toContain('New rules.');
    expect(followSource(legacy, v2, () => false)).toBeNull();
  });
  it('every base skill has its prompt file, and the request skills include revisiting an old page', () => {
    for (const s of BASE_SKILLS) expect(existsSync(path.join(__dirname, '../../../..', s.file)), s.file).toBe(true);
    expect(BASE_SKILLS.find(s => s.slug === 'revisit-request')).toMatchObject({ role: 'librarian', takes: 'pr', file: 'prompts/revisit-request.md' });
  });
  it('attached skills come from the PR frontmatter, the refs\' type cards and the extras, once each', () => {
    const scope = scopeOf([node('type:req', 'id: type:req\nskills: [skill:define-tests, skill:a]'), node('type:task', 'id: type:task')]);
    expect(attachedSkills(scope, { prMd: '---\nnode: pr:1\nskills: [skill:a, skill:b]\n---\n', refs: ['req:x', 'task:y'], extra: ['skill:c', 'skill:a'] })).toEqual(['skill:a', 'skill:b', 'skill:define-tests', 'skill:c']);
    expect(attachedSkills(scope, { refs: ['task:y'] })).toEqual([]);
  });
  it('a base skill without a document falls back to its prompt file; an unknown skill has no body', async () => {
    const scope = scopeOf([]);
    expect(await skillBody(scope, 'skill:define-tests')).toMatch(/^You are on a requirement/);
    expect(await skillBody(scope, 'skill:nope')).toBeNull();
  });
});
