// Skills (decision:wf2.hooks-and-skills): an instruction a session follows, kept as a document under the project's
// Skills page — `skill-<slug>.md`, node `skill:<slug>`, type:skill. The shipped prompts (prompts/*.md) are written
// here as skills the first time a product needs them, so a person can read and edit them; the host reads a skill's
// body from the document when present, else the file — the file stays the fallback so nothing breaks without them.
// The Hooks page (hooks.md) lives beside it: one document of hook and template cards per project.
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { REPO_ROOT, type Project } from './products';
import { writeAtomic } from './write';
import { bodyOf } from './write';
import type { Scope } from './scope';

export const skillsPageId = (projectSlug: string) => `module:${projectSlug}-skills`;
export const hooksPageId = (projectSlug: string) => `module:${projectSlug}-hooks`;

export type SkillRole = 'librarian' | 'worker';

// The base skills: which prompt file each comes from and the card that heads its document.
export const BASE_SKILLS: { slug: string; title: string; role: SkillRole; file: string; takes?: string; writes?: string[]; skills?: string[] }[] = [
  { slug: 'refine', title: 'Refine a request', role: 'librarian', file: 'prompts/librarian-system.md', takes: 'pr', writes: ['req', 'decision', 'constraint', 'question', 'task'] },
  { slug: 'build', title: 'Build a request', role: 'worker', file: 'prompts/agent-system.md', takes: 'pr', writes: ['task', 'decision'] },
  { slug: 'describe-module', title: 'Describe a module from its code', role: 'worker', file: 'prompts/describe-module.md', takes: 'module', writes: ['req', 'lib', 'op'] },
  { slug: 'define-tests', title: 'Define how a requirement is tested', role: 'librarian', file: 'prompts/define-tests.md', takes: 'req', writes: ['test', 'ui-test', 'question'] },
  { slug: 'analyse-request', title: 'Analyse a request — changes, code, risks, contradictions', role: 'librarian', file: 'prompts/analyse-request.md', takes: 'pr', writes: ['constraint', 'question'] },
  { slug: 'revisit-request', title: 'Revisit a request with the current approach', role: 'librarian', file: 'prompts/revisit-request.md', takes: 'pr', writes: ['req', 'decision', 'question', 'test'] },
  { slug: 'remember', title: 'Remember what the person pasted', role: 'librarian', file: 'prompts/remember.md', takes: '*', writes: ['fact', 'decision', 'req', 'question', 'task', 'note'] },
  { slug: 'import', title: 'Import a document — extract its types, requirements, facts and decisions', role: 'worker', file: 'prompts/import.md', takes: 'module', writes: ['type', 'req', 'decision', 'constraint', 'entity', 'fact', 'task', 'question'] },
  { slug: 'import-code', title: 'Import a module from its code — requirements, rules, entities, operations, tests', role: 'worker', file: 'prompts/import-code.md', takes: 'module', writes: ['req', 'rule', 'entity', 'state', 'op', 'lib', 'test', 'question'] },
  // the stages of workflow:feature (decision:wf2.workflow-is-a-skill): each one an editable instruction
  { slug: 'research', title: 'Explore an idea', role: 'worker', file: 'prompts/research.md', takes: '*', writes: ['question', 'decision', 'note'] },
  { slug: 'prd', title: 'Write a PRD', role: 'librarian', file: 'prompts/prd.md', takes: 'module', writes: ['req', 'goal', 'question', 'entity'] },
  { slug: 'tech-design', title: 'Write the technical design', role: 'librarian', file: 'prompts/tech-design.md', takes: 'module', writes: ['decision', 'entity', 'op', 'rule', 'state', 'page'] },
  { slug: 'test-design', title: 'Write the test design', role: 'librarian', file: 'prompts/test-design.md', takes: 'module', writes: ['test', 'ui-test', 'question'], skills: ['skill:define-tests'] },
  { slug: 'plan', title: 'Build the implementation plan', role: 'librarian', file: 'prompts/plan.md', takes: 'module', writes: ['task'] },
];

// The workflows shipped as documents beside the skills (decision:wf2.workflow-is-a-skill): a workflow is a skill that
// declares stages, so it lives under the same page and a person edits the pipeline as they edit a prompt.
export const BASE_WORKFLOWS = ['feature'];

const today = () => new Date().toISOString().slice(0, 10);
const fill = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));

async function exists(file: string): Promise<boolean> { try { await stat(file); return true; } catch { return false; } }

// The Skills / Hooks page of a project, under its main document when it has one. Written when missing; returns the id.
async function ensurePage(project: Project, root: string | null, slug: 'skills' | 'hooks'): Promise<string> {
  const id = slug === 'skills' ? skillsPageId(project.slug) : hooksPageId(project.slug);
  const file = path.join(project.wyeDir, `${slug}.md`);
  if (await exists(file)) return id;
  const tpl = await readFile(path.join(REPO_ROOT, `templates/docs/${slug}.md`), 'utf8');
  await writeAtomic(file, fill(tpl, { id, date: today(), root: root ? `part-of: ${root}\n` : '' }));
  return id;
}
export const ensureSkillsPage = (project: Project, root: string | null) => ensurePage(project, root, 'skills');
export const ensureHooksPage = (project: Project, root: string | null) => ensurePage(project, root, 'hooks');

// The prompt file as a skill document: the card in the frontmatter, the prompt's own body under the title (its
// first heading dropped — the document's title replaces it). Returns the markdown.
export function skillDocFromPrompt(prompt: string, s: { slug: string; title: string; role: SkillRole; file: string; takes?: string; writes?: string[]; skills?: string[] }, parent: string): string {
  const body = prompt.replace(/^# .*\n+/, '').trim();
  const fm = [`node: skill:${s.slug}`, 'type: skill', `title: ${s.title}`, 'status: active', 'owner: unassigned', `last-verified: ${today()}`, `role: ${s.role}`, ...(s.takes ? [`takes: ${s.takes}`] : []), ...(s.writes ? [`writes: [${s.writes.join(', ')}]`] : []), ...(s.skills ? [`skills: [${s.skills.join(', ')}]`] : []), `source: ${s.file}`, `source-hash: ${textHash(body)}`, `part-of: ${parent}`];
  return `---\n${fm.join('\n')}\n---\n\n# ${s.title}\n\n${body}\n`;
}

// A shipped copy follows its source until a person edits it (decision:wf2.shipped-copies-follow-source): a skill or
// workflow document written from Wye's own prompt or template records the hash of the text it was written with
// (`source-hash:`); while its text still has that hash nobody changed it, so a newer prompt replaces it — keeping the
// document's frontmatter, which is the person's (its status, title, part-of). A copy from before the hash counts as
// unchanged when its text is one Wye shipped earlier (`shippedBefore`, from the prompt's git history). Returns the new
// document, or null when it stays as it is.
const splitDoc = (md: string) => { const m = md.match(/^---\n([\s\S]*?)\n---\n?/); return { fm: m ? m[1] : '', body: m ? md.slice(m[0].length) : md }; };
const textOf = (body: string) => body.replace(/^\s*# .*\n+/, '').trim();
export const textHash = (text: string) => createHash('sha1').update(text.trim()).digest('hex').slice(0, 12);
export function followSource(current: string, fresh: string, shippedBefore: (text: string) => boolean): string | null {
  const cur = splitDoc(current); const nxt = splitDoc(fresh);
  const curText = textOf(cur.body); const nxtText = textOf(nxt.body);
  const recorded = cur.fm.match(/^source-hash:\s*(\S+)/m)?.[1];
  const untouched = recorded ? textHash(curText) === recorded : shippedBefore(curText);
  if (!untouched) return null;
  const hash = textHash(nxtText);
  if (curText === nxtText && recorded === hash) return null;
  let fm = cur.fm;
  if (recorded) fm = fm.replace(/^source-hash:.*$/m, `source-hash: ${hash}`);
  else if (/^source:/m.test(fm)) fm = fm.replace(/^(source:.*)$/m, `$1\nsource-hash: ${hash}`);
  else fm = `${fm}\nsource-hash: ${hash}`;
  const title = cur.body.match(/^\s*# .*$/m)?.[0].trim() ?? '';
  return `---\n${fm}\n---\n\n${title ? `${title}\n\n` : ''}${nxtText}\n`;
}
// every text a prompt file has had in git, as the copy would hold it — to recognise a copy nobody edited
const history = new Map<string, Promise<Set<string>>>();
export function shippedTexts(file: string, toText: (content: string) => string): Promise<Set<string>> {
  if (!history.has(file)) history.set(file, (async () => {
    const run = promisify(execFile); const out = new Set<string>();
    try {
      const shas = (await run('git', ['log', '--format=%H', '--', file], { cwd: REPO_ROOT })).stdout.split('\n').filter(Boolean);
      for (const sha of shas) { try { out.add(toText((await run('git', ['show', `${sha}:${file}`], { cwd: REPO_ROOT, maxBuffer: 8 << 20 })).stdout)); } catch { /* not there at that commit */ } }
    } catch { /* no git */ }
    return out;
  })());
  return history.get(file)!;
}

// Write the base skills under the Skills page when they are missing, and bring the ones nobody edited up to date with
// their prompt. Returns the slugs written.
export async function ensureBaseSkills(project: Project, root: string | null): Promise<string[]> {
  const parent = await ensureSkillsPage(project, root);
  const written: string[] = [];
  for (const s of BASE_SKILLS) {
    const file = path.join(project.wyeDir, `skill-${s.slug}.md`);
    let prompt = ''; try { prompt = await readFile(path.join(REPO_ROOT, s.file), 'utf8'); } catch { continue; }
    const fresh = skillDocFromPrompt(prompt, s, parent);
    if (await exists(file)) {
      const cur = await readFile(file, 'utf8');
      const legacy = !/^source-hash:/m.test(splitDoc(cur).fm) ? await shippedTexts(s.file, p => p.replace(/^# .*\n+/, '').trim()) : new Set<string>();
      const next = followSource(cur, fresh, t => legacy.has(t));
      if (next) { await writeAtomic(file, next); written.push(s.slug); }
      continue;
    }
    await writeAtomic(file, fresh);
    written.push(s.slug);
  }
  return written;
}

// The shipped workflows under the Skills page, written when missing and kept up to date while nobody edited them
// (decision:wf2.workflow-is-a-skill, decision:wf2.shipped-copies-follow-source). Returns the slugs written. `{{title}}` and the produced-document names in the stage cards are left for the engine to fill.
export async function ensureBaseWorkflows(project: Project, root: string | null): Promise<string[]> {
  const parent = await ensureSkillsPage(project, root);
  const written: string[] = [];
  for (const slug of BASE_WORKFLOWS) {
    const file = path.join(project.wyeDir, `workflow-${slug}.md`); const src = `templates/docs/workflow-${slug}.md`;
    let tpl = ''; try { tpl = await readFile(path.join(REPO_ROOT, src), 'utf8'); } catch { continue; }
    const filled = fill(tpl, { slug, date: today(), parent });
    const { fm, body } = splitDoc(filled);
    const fresh = `---\n${fm}\nsource: ${src}\nsource-hash: ${textHash(textOf(body))}\n---\n${body}`;
    if (await exists(file)) {
      const cur = await readFile(file, 'utf8');
      const legacy = !/^source-hash:/m.test(splitDoc(cur).fm) ? await shippedTexts(src, t => textOf(splitDoc(fill(t, { slug, date: '', parent: '' })).body)) : new Set<string>();
      const next = followSource(cur, fresh, t => legacy.has(t));
      if (next) { await writeAtomic(file, next); written.push(slug); }
      continue;
    }
    await writeAtomic(file, fresh);
    written.push(slug);
  }
  return written;
}

// A new, empty skill from the template ("+ skill" on the folder). Returns the document slug.
export async function createSkillDoc(project: Project, root: string | null, title: string, role: SkillRole = 'librarian'): Promise<string> {
  const parent = await ensureSkillsPage(project, root);
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'skill';
  let slug = base; let n = 2;
  while (await exists(path.join(project.wyeDir, `skill-${slug}.md`))) slug = `${base}-${n++}`;
  const tpl = await readFile(path.join(REPO_ROOT, 'templates/docs/skill.md'), 'utf8');
  await writeAtomic(path.join(project.wyeDir, `skill-${slug}.md`), fill(tpl, { slug, title, role, date: today(), parent }));
  return `~skill-${slug}`;  // a system page's slug (lib/doc SYSTEM_MARK)
}

// A skill's instruction: the document's body after its title when the product has the skill as a document, else the
// prompt file it came from (the base skills), else nothing.
export async function skillBody(scope: Scope, id: string): Promise<string | null> {
  const slug = id.replace(/^skill:/, '');
  const m = scope.graph.modules.find(x => x.id === `skill:${slug}`) ?? scope.graph.nodes.find(n => n.id === `skill:${slug}` && n.file);
  if (m?.file) {
    try { const md = await readFile(path.join(REPO_ROOT, m.file), 'utf8'); return bodyOf(md).replace(/^\s*# .*\n+/, '').trim(); } catch { /* fall through */ }
  }
  const base = BASE_SKILLS.find(s => s.slug === slug);
  if (base) { try { return (await readFile(path.join(REPO_ROOT, base.file), 'utf8')).replace(/^# .*\n+/, '').trim(); } catch { return null; } }
  return null;
}

// The skills a session carries (spec §1): the PR's `skills:`, the type card's `skills:` of every ref's kind, the
// hook's. Ids, deduplicated, in that order.
export function attachedSkills(scope: Scope, opts: { prMd?: string; refs?: string[]; extra?: string[] }): string[] {
  const out: string[] = [];
  const add = (v?: string) => { for (const id of (v ?? '').match(/skill:[A-Za-z0-9_.\-]+/g) ?? []) if (!out.includes(id)) out.push(id); };
  if (opts.prMd) { const m = opts.prMd.match(/^skills:\s*(.+)$/m); add(m?.[1]); }
  for (const ref of opts.refs ?? []) {
    const kind = ref.split(':')[0];
    const t = scope.graph.nodes.find(n => n.id === `type:${kind}`);
    if (t?.body) { const m = t.body.match(/^skills:\s*(.+)$/m); add(m?.[1]); }
  }
  for (const id of opts.extra ?? []) add(id);
  return out;
}

// The "## Skills" section of a first message: each skill's body under its title; a skill with no body is named.
export async function skillsSection(scope: Scope, ids: string[], heading = 'Skills'): Promise<string> {
  if (!ids.length) return '';
  const parts: string[] = [];
  for (const id of ids) {
    const body = await skillBody(scope, id);
    const title = scope.graph.nodes.find(n => n.id === id)?.title || id;
    parts.push(`### ${title} (${id})\n${body ?? '_no body — the skill document is empty or missing_'}`);
  }
  return `\n## ${heading}\nFollow these in this session; they are the product's own instructions (\`wye skill <id>\` prints one).\n\n${parts.join('\n\n')}`;
}

// The skills of a product, for `wye skills` and the folder: id, title, role, takes, document slug and project.
export async function listSkills(scope: Scope): Promise<{ id: string; title: string; role: string; takes: string; status: string; slug: string; project: string }[]> {
  const out: { id: string; title: string; role: string; takes: string; status: string; slug: string; project: string }[] = [];
  for (const p of scope.projects) {
    let files: string[] = []; try { files = (await readdir(p.wyeDir)).filter(f => /^skill-.*\.md$/.test(f)); } catch { continue; }
    for (const f of files) {
      let md = ''; try { md = await readFile(path.join(p.wyeDir, f), 'utf8'); } catch { continue; }
      const get = (k: string) => md.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1].trim() ?? '';
      if (!get('node').startsWith('skill:')) continue;
      out.push({ id: get('node'), title: get('title'), role: get('role') || 'librarian', takes: get('takes'), status: get('status'), slug: `~${f.slice(0, -3)}`, project: p.slug });
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}
