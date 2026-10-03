import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, lstat, access, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installPackage, uninstallPackage, listPackages, readRecord, parseRecord, formatRecord, InstallRefused, linkPath } from './install';
import { docRoute, docSlug, packageOfSlug } from './doc';
import { pageFile } from './products';
import { writeAtomic } from './write';

// A scratch system library (WYE_SYSTEM) with one fixture package, and a scratch data root with the product `acme`
// whose ontology declares type:contact already and holds a contact — so install meets one type that is there and one
// that is not (decision:ea.packages-carry-types).
const PKG = {
  'package.md': '---\nnode: package:helper\ntitle: Helper\ndescription: A fixture package\n---\n\n# Helper\n',
  'docs/skill-greet.md': '---\nnode: skill:greet\ntype: skill\ntitle: Greet the person\nstatus: active\nrole: worker\n---\n\n# Greet the person\n\nSay hello.\n',
  'docs/workflow-intake.md': '---\nnode: workflow:intake\ntype: workflow\ntitle: Intake\nstatus: active\n---\n\n# Intake\n',
  'docs/hooks.md': '---\nnode: module:helper-hooks\ntitle: Helper hooks\n---\n\n# Helper hooks\n\n```yaml\n- id: hook:greet-new-contact\n  title: A new contact is greeted\n  on: contact.created\n  do: run skill:greet\n- id: hook:note-meeting\n  title: A meeting is noted\n  on: meeting.created\n  do: notify "a meeting"\n- id: template:greeting\n  title: Greeting\n  body: Hello {{title}}\n```\n',
  'types.md': '# Helper types\n\n```yaml\n- id: type:contact\n  extends: type:node\n  purpose: a person the package would add\n- id: type:meeting\n  extends: type:node\n  purpose: a meeting with people\n  status: active\n  props:\n    when: string?\n- id: type:standup\n  extends: type:meeting\n  purpose: a short daily meeting\n```\n',
};
const ONTOLOGY = '---\nnode: module:ontology\ntitle: Ontology\n---\n\n# Ontology\n\n```yaml\n- id: type:contact\n  extends: type:node\n  purpose: someone we know — the product\'s own\n```\n';
const PEOPLE = '---\nnode: module:people\ntitle: People\n---\n\n# People\n\n```yaml\n- id: contact:ada\n  title: Ada\n```\n';

let system: string, data: string, productDir: string, project: string;
const gone = async (p: string) => { try { await access(p); return false; } catch { return true; } };
async function write(root: string, files: Record<string, string>) { for (const [f, t] of Object.entries(files)) { await mkdir(path.dirname(path.join(root, f)), { recursive: true }); await writeFile(path.join(root, f), t); } }
const graphOf = async () => JSON.parse(await readFile(path.join(productDir, '_build/graph.json'), 'utf8'));

beforeEach(async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'wf-install-'));
  system = path.join(tmp, 'system'); data = path.join(tmp, 'data');
  await write(path.join(system, 'projects/helper'), PKG);
  productDir = path.join(data, 'products/acme'); project = path.join(productDir, 'projects/main');
  await write(productDir, { '_product.md': '---\ntitle: Acme\n---\n', 'projects/main/_project.md': '---\ntitle: Main\n---\n', 'projects/main/docs/ontology.md': ONTOLOGY, 'projects/main/docs/people.md': PEOPLE, 'projects/other/docs/x.md': '# X\n' });
});
const o = () => ({ dataRoot: data, system });

describe('the system library', () => {
  it('lists a package with its card and what it holds, types from types.md', async () => {
    const [p] = await listPackages(system);
    expect(p.slug).toBe('helper'); expect(p.title).toBe('Helper'); expect(p.description).toBe('A fixture package');
    expect(p.contents.skills.map(s => s.id)).toEqual(['skill:greet']);
    expect(p.contents.workflows.map(s => s.id)).toEqual(['workflow:intake']);
    expect(p.contents.templates.map(s => s.id)).toEqual(['template:greeting']);
    expect(p.contents.types.map(t => t.id)).toEqual(['type:contact', 'type:meeting', 'type:standup']);
  });
});

describe('installPackage', () => {
  it('previews on a dry run — each hook with its on: and whether it starts a session, each type new or already there — and writes nothing', async () => {
    const before = await readdir(productDir);
    const r = await installPackage('acme', 'main', 'helper', { ...o(), dryRun: true });
    expect(r.installed).toBe(false);
    expect(r.skills.map(s => s.id)).toEqual(['skill:greet']);
    expect(r.hooks).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'hook:greet-new-contact', on: 'contact.created', agent: true }), expect.objectContaining({ id: 'hook:note-meeting', on: 'meeting.created', agent: false })]));
    expect(r.types.map(t => [t.id, t.there])).toEqual([['type:contact', true], ['type:meeting', false], ['type:standup', false]]);
    expect(await readdir(productDir)).toEqual(before);
    expect(await gone(path.join(project, '.wye'))).toBe(true);
    expect(await readFile(path.join(project, 'docs/ontology.md'), 'utf8')).toBe(ONTOLOGY);
  });

  it('declares the new types whole, keeps the one the product has, records only what it added, and links the docs', async () => {
    const r = await installPackage('acme', 'main', 'helper', { ...o(), by: 'alex' });
    expect(r.installed).toBe(true);
    const onto = await readFile(path.join(project, 'docs/ontology.md'), 'utf8');
    expect(onto).toContain("purpose: someone we know — the product's own");
    expect(onto).not.toContain('a person the package would add');
    expect(onto).toContain('- id: type:meeting\n  extends: type:node\n  purpose: a meeting with people\n  status: active\n  props:\n    when: string?');
    expect(onto).toContain('- id: type:standup\n  extends: type:meeting');
    const rec = await readRecord(project);
    expect(rec).toEqual([{ package: 'helper', installed: new Date().toISOString().slice(0, 10), by: 'alex', types: ['type:meeting', 'type:standup'] }]);
    const link = linkPath(project, 'helper');
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    // the build follows the link: the package's skill is a node of project main, its document routed there
    const g = await graphOf();
    const skill = g.nodes.find((n: { id: string }) => n.id === 'skill:greet');
    expect(skill?.defined).toBe(true);
    expect(docRoute(skill.file)).toEqual({ project: 'main', doc: '~helper.skill-greet' });
    expect((g.types as { id: string }[]).map(t => t.id)).toEqual(expect.arrayContaining(['type:meeting', 'type:standup', 'type:contact']));
    // nothing went into the other project
    expect(await gone(path.join(productDir, 'projects/other/.wye'))).toBe(true);
  });

  it('refuses a second install: told so, nothing changes', async () => {
    await installPackage('acme', 'main', 'helper', o());
    const rec = await readFile(path.join(project, '.wye/packages.yaml'), 'utf8'); const onto = await readFile(path.join(project, 'docs/ontology.md'), 'utf8');
    await expect(installPackage('acme', 'main', 'helper', o())).rejects.toMatchObject({ reason: 'already-installed' });
    expect(await readFile(path.join(project, '.wye/packages.yaml'), 'utf8')).toBe(rec);
    expect(await readFile(path.join(project, 'docs/ontology.md'), 'utf8')).toBe(onto);
  });

  it('refuses an unknown package, product or project', async () => {
    await expect(installPackage('acme', 'main', 'nope', o())).rejects.toBeInstanceOf(InstallRefused);
    await expect(installPackage('acme', 'nope', 'helper', o())).rejects.toMatchObject({ reason: 'no-such-project' });
    await expect(installPackage('nope', 'main', 'helper', o())).rejects.toMatchObject({ reason: 'no-such-product' });
  });

  it('makes the product with the project first when asked (--create-product), types into a new ontology', async () => {
    const r = await installPackage('ea', 'assistant', 'helper', { ...o(), createProduct: 'Executive assistant' });
    expect(r.installed).toBe(true);
    const dir = path.join(data, 'products/ea');
    expect(await readFile(path.join(dir, '_product.md'), 'utf8')).toContain('title: Executive assistant');
    expect(await readFile(path.join(dir, 'projects/assistant/_project.md'), 'utf8')).toContain('title: Assistant');
    expect((await readRecord(path.join(dir, 'projects/assistant')))[0].types).toEqual(['type:contact', 'type:meeting', 'type:standup']);
    expect(await readFile(path.join(dir, 'projects/assistant/docs/ontology.md'), 'utf8')).toContain('- id: type:contact');
  });
});

describe('uninstallPackage', () => {
  it('removes the link, the record and only the types this install added, warning for a type still in use', async () => {
    await installPackage('acme', 'main', 'helper', o());
    await write(project, { 'docs/meetings.md': '---\nnode: module:meetings\ntitle: Meetings\n---\n\n# Meetings\n\n```yaml\n- id: meeting:kickoff\n  title: Kickoff\n```\n' });
    const r = await uninstallPackage('acme', 'main', 'helper', o());
    expect(r.removedTypes).toEqual(['type:meeting', 'type:standup']);
    expect(r.warnings).toEqual(['type:meeting removed, but 1 node(s) of the product are still typed by it']);
    expect(await gone(linkPath(project, 'helper'))).toBe(true);
    expect(await gone(path.join(project, '.wye/packages'))).toBe(true);
    expect(await gone(path.join(project, '.wye/packages.yaml'))).toBe(true);
    expect(await readFile(path.join(project, 'docs/ontology.md'), 'utf8')).toBe(ONTOLOGY);
    // the system library is untouched
    expect(await readFile(path.join(system, 'projects/helper/docs/skill-greet.md'), 'utf8')).toBe(PKG['docs/skill-greet.md']);
    expect((await graphOf()).nodes.some((n: { id: string; defined: boolean }) => n.id === 'skill:greet' && n.defined)).toBe(false);
    await expect(uninstallPackage('acme', 'main', 'helper', o())).rejects.toMatchObject({ reason: 'not-installed' });
  });
});

describe('a package document in the app', () => {
  it('routes to its project under a ~<pkg>.<doc> slug, and the slug back to the link path', () => {
    const f = 'data/products/acme/projects/main/.wye/packages/helper/skill-greet.md';
    expect(docRoute(f)).toEqual({ project: 'main', doc: '~helper.skill-greet' });
    expect(docSlug(f)).toBe('~helper.skill-greet');
    expect(packageOfSlug('~helper.skill-greet')).toEqual({ pkg: 'helper', doc: 'skill-greet' });
    expect(packageOfSlug('~goals')).toBeNull();
    expect(pageFile({ docsDir: '/p/docs', wyeDir: '/p/.wye' }, '~helper.skill-greet')).toBe('/p/.wye/packages/helper/skill-greet.md');
    // the system pages keep theirs
    expect(docRoute('data/products/acme/projects/main/.wye/goals.md')).toEqual({ project: 'main', doc: '~goals' });
  });

  it('a save through the link lands in the system file and the link stays a link (rule:install.write-through-link)', async () => {
    await installPackage('acme', 'main', 'helper', o());
    const link = linkPath(project, 'helper');
    await writeAtomic(path.join(link, 'skill-greet.md'), PKG['docs/skill-greet.md'].replace('Say hello.', 'Say hello warmly.'));
    expect(await readFile(path.join(system, 'projects/helper/docs/skill-greet.md'), 'utf8')).toContain('Say hello warmly.');
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect((await lstat(path.join(system, 'projects/helper/docs/skill-greet.md'))).isFile()).toBe(true);
    expect((await readdir(path.join(system, 'projects/helper/docs'))).filter(n => n.includes('.tmp-'))).toEqual([]);
  });
});

describe('the record', () => {
  it('reads what it writes', () => {
    const e = [{ package: 'a', installed: '2026-10-03', by: 'alex', types: ['type:x'] }, { package: 'b', installed: '2026-10-03', by: 'agent:s1', types: [] }];
    expect(parseRecord(formatRecord(e))).toEqual(e);
  });
});
