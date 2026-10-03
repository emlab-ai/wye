// The briefs, the IO part: one input gathered — the ea product's knowledge, the follow scan of every other product
// (read-only), the snapshot of the last brief before the day — then built (ea/briefs) and, with `write`, kept as a page
// under the project's Briefs page (module:ea-briefs, the package's; else a `briefs` page, made when neither exists):
// brief-<date>, weekly-<date>, 1on1-<person>-<date>, in the project's own docs/ — replaced when it exists, one per day
// (test:ea.brief-arrives-once-each-morning). Every written brief leaves a snapshot in <product>/_ea/snapshots/<date>.json,
// what "changed since yesterday" compares with (test:ea.brief-lists-projects-changed-since-yesterday).
import { access, mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadScope, mainProject, type Scope } from '../scope';
import { REPO_ROOT, type Project } from '../products';
import { createDocFromTemplate } from '../doc-create';
import { patchFrontmatter, rebuild, withFileLock, writeAtomic } from '../write';
import { claimWrite } from '../changes';
import { readModel, directorOf } from './read';
import { personNames, today, isDate } from './model';
import { scanProducts } from './follow-run';
import { dailyBrief, weeklyReview, oneOnOne, snapshotOf, type BriefInput, type Snapshot } from './briefs';

export type BriefKind = 'daily' | 'weekly' | '1on1';
export type BriefOpts = { kind: BriefKind; date?: string; person?: string; write?: boolean; project?: string; products?: string[] };
export type BriefResult = { ok: true; markdown: string; title: string; doc?: string; link?: string; skipped: string[] } | { ok: false; status: number; message: string };

const snapDir = (productDir: string) => path.join(productDir, '_ea', 'snapshots');
// The latest snapshot taken before the day — the previous brief's view of things.
export async function previousSnapshot(productDir: string, date: string): Promise<Snapshot | null> {
  let names: string[] = []; try { names = (await readdir(snapDir(productDir))).filter(n => /^\d{4}-\d\d-\d\d\.json$/.test(n) && n.slice(0, 10) < date).sort(); } catch { return null; }
  const last = names.pop(); if (!last) return null;
  try { return JSON.parse(await readFile(path.join(snapDir(productDir), last), 'utf8')); } catch { return null; }
}

export async function gatherBriefInput(scope: Scope, date: string, opts: { products?: string[] } = {}): Promise<BriefInput & { skipped: string[] }> {
  const model = await readModel(scope);
  const director = directorOf(scope);
  const d = model.people.find(p => p.id === director);
  const { items, skipped } = await scanProducts(scope.product.slug, d ? personNames(d) : [], opts);
  return { product: scope.product.slug, director, model, follow: items, previous: await previousSnapshot(scope.product.dir, date), skipped };
}

export async function runBrief(product: string, o: BriefOpts): Promise<BriefResult> {
  const date = o.date ?? today();
  if (!isDate(date)) return { ok: false, status: 422, message: `--date must be YYYY-MM-DD (got ${date})` };
  const scope = await loadScope(product); if (!scope) return { ok: false, status: 404, message: `no product ${product}` };
  const input = await gatherBriefInput(scope, date, { products: o.products });
  let markdown: string, title: string, slug: string;
  if (o.kind === 'daily') { markdown = dailyBrief(input, date); title = `Daily brief — ${date}`; slug = `brief-${date}`; }
  else if (o.kind === 'weekly') { markdown = weeklyReview(input, date); title = `Weekly review — week ending ${date}`; slug = `weekly-${date}`; }
  else if (o.kind === '1on1') {
    const p = input.model.people.find(x => x.id === o.person);
    if (!o.person || !p) return { ok: false, status: 422, message: `--person must name a person of ${product} (got ${o.person ?? 'nothing'})` };
    markdown = oneOnOne(input, p.id, date); title = `1:1 with ${p.name} — ${date}`;
    slug = `1on1-${p.id.slice(p.id.indexOf(':') + 1).replace(/^[a-z0-9-]+\./, '').replace(/[^a-z0-9-]+/g, '-')}-${date}`;
  } else return { ok: false, status: 422, message: 'the brief is daily, weekly or 1on1' };
  if (!o.write) return { ok: true, markdown, title, skipped: input.skipped };

  const project = briefsProject(scope, o.project);
  if (!project) return { ok: false, status: 404, message: `no project ${o.project ?? ''} in ${product}` };
  const parent = await briefsParent(scope, project);
  const file = path.join(project.docsDir, `${slug}.md`);
  if (!(await exists(file))) {
    const r = await createDocFromTemplate(scope, project, { title, template: 'blank', slug });
    if (!r.ok) return { ok: false, status: 422, message: r.message };
  }
  claimWrite(path.relative(REPO_ROOT, file), { by: 'agent:ea' });
  await withFileLock(file, async () => {
    const md = await readFile(file, 'utf8');
    const head = patchFrontmatter(md, { title, status: 'active', 'part-of': parent, 'last-verified': null });
    const fm = (head.error ? md : head.md).match(/^---\n[\s\S]*?\n---\n/)?.[0] ?? '';
    await writeAtomic(file, `${fm}\n# ${title}\n\n${markdown}`);
  });
  await mkdir(snapDir(scope.product.dir), { recursive: true });
  await writeAtomic(path.join(snapDir(scope.product.dir), `${date}.json`), JSON.stringify(snapshotOf(input.model, date), null, 2));
  await rebuild(scope.product.dir);
  return { ok: true, markdown, title, doc: `${product}/${project.slug}/${slug}`, link: `/${product}/${project.slug}/d/${slug}`, skipped: input.skipped };
}

const exists = (f: string) => access(f).then(() => true, () => false);
// the project the Briefs page is in: the one named, else the one holding module:ea-briefs, else the main one
function briefsProject(scope: Scope, slug?: string): Project | undefined {
  if (slug) return scope.projects.find(p => p.slug === slug);
  const at = scope.graph.modules.find(m => m.id === 'module:ea-briefs')?.file.match(/\/projects\/([^/]+)\//)?.[1];
  return scope.projects.find(p => p.slug === at) ?? mainProject(scope);
}
// The Briefs page's id: the package's module:ea-briefs, else the project's `briefs` page, else one made now.
async function briefsParent(scope: Scope, project: Project): Promise<string> {
  if (scope.idx.byId.get('module:ea-briefs')?.defined) return 'module:ea-briefs';
  const own = scope.graph.modules.find(m => m.file.includes(`/projects/${project.slug}/`) && /\/briefs\.md$/.test(m.file));
  if (own) return own.id;
  const r = await createDocFromTemplate(scope, project, { title: 'Briefs', template: 'blank', slug: 'briefs' });
  if (!r.ok) return 'module:briefs';
  const f = path.join(project.docsDir, 'briefs.md');
  const md = await readFile(f, 'utf8');
  await writeAtomic(f, md.replace(/^Write here\..*$/m, 'The daily briefs, weekly reviews and 1:1 preps (`wye ea brief …`), one page each.'));
  return r.node;
}
