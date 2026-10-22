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
import { createRequire } from 'node:module';
import { REPO_ROOT, type Project, cacheDirOf } from './products';
import { isShippedFile } from './doc';
import { writeAtomic } from './write';
import { bodyOf } from './write';
import type { Scope } from './scope';

export const skillsPageId = (projectSlug: string) => `module:${projectSlug}-skills`;
export const hooksPageId = (projectSlug: string) => `module:${projectSlug}-hooks`;

export type SkillRole = 'librarian' | 'worker';

// The base skills and the shipped workflows: the catalog lives in lib/shipped.js, which the build renders into every
// product from the install (decision:waterfall.skills-read-from-install-overrides-on-edit).
type BaseSkill = { slug: string; title: string; role: SkillRole; file: string; takes?: string; writes?: string[]; skills?: string[] };
const shippedLib = createRequire(path.join(REPO_ROOT, 'package.json'))('./lib/shipped.js') as { BASE_SKILLS: BaseSkill[]; BASE_WORKFLOWS: string[] };
export const BASE_SKILLS: BaseSkill[] = shippedLib.BASE_SKILLS;
export const BASE_WORKFLOWS: string[] = shippedLib.BASE_WORKFLOWS;

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
    // the project's own skill pages, then those of the packages it installed (.wye/packages/<pkg>/skill-*.md)
    // and what Wye ships, rendered from the install by the build (lib/shipped) — after the project's own, which win
    const dirs: [string, string][] = [[p.wyeDir, ''], [path.join(cacheDirOf(path.join(p.dir, '../..')), 'shipped', p.slug), '']];
    try { for (const pkg of await readdir(path.join(p.wyeDir, 'packages'))) dirs.splice(1, 0, [path.join(p.wyeDir, 'packages', pkg), `${pkg}.`]); } catch { /* no packages */ }
    for (const [dir, prefix] of dirs) {
      let files: string[] = []; try { files = (await readdir(dir)).filter(f => /^skill-.*\.md$/.test(f)); } catch { continue; }
      for (const f of files) {
        let md = ''; try { md = await readFile(path.join(dir, f), 'utf8'); } catch { continue; }
        const get = (k: string) => md.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1].trim() ?? '';
        if (!get('node').startsWith('skill:') || out.some(o => o.id === get('node'))) continue;
        out.push({ id: get('node'), title: get('title'), role: get('role') || 'librarian', takes: get('takes'), status: get('status'), slug: `~${prefix}${f.slice(0, -3)}`, project: p.slug });
      }
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

// What a skill can be run on (decision:wf2.run-skill-on-a-node): `takes: *` anything; `takes: module` a page; else the
// kinds it names (`takes: project, goal`). A paused skill is not offered.
export function skillTakes(takes: string, kind: string): boolean {
  const t = takes.split(/[,\s]+/).map(x => x.trim()).filter(Boolean);
  return t.includes('*') || t.includes(kind) || (kind === 'module' && t.includes('page'));
}

// Where a page stands against what Wye ships (req:waterfall.global-skills.override): `shipped` — read from the
// install, an edit makes the project's own copy; `own` — the project's copy of a shipped one, `edited` when its text
// changed, `behind` when the install's moved on (its text in `shippedText`). Null for every other page.
export type ShippedStatus = { kind: 'shipped' } | { kind: 'own'; edited: boolean; behind: boolean; shippedText: string };
export async function shippedStatus(productDir: string, file: string): Promise<ShippedStatus | null> {
  const abs = path.resolve(REPO_ROOT, file);
  if (isShippedFile(abs)) return { kind: 'shipped' };
  if (!/\/projects\/[^/]+\/\.wye\/(skill-[^/]+|workflow-[^/]+|shipped-hooks)\.md$/.test(abs)) return null;
  let md = ''; try { md = await readFile(abs, 'utf8'); } catch { return null; }
  const st = (createRequire(path.join(REPO_ROOT, 'package.json'))('./lib/shipped.js') as { copyState(dir: string, md: string): { edited: boolean; behind: boolean; shippedText: string } | null }).copyState(productDir, md);
  return st ? { kind: 'own', edited: st.edited, behind: st.behind, shippedText: st.shippedText } : null;
}
