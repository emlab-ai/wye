// Creating a page in a project from a template — the one path the doc route, a hook and a workflow stage all use
// (rule:page-node-line: a typed page's card is its frontmatter, so the template's own module card is dropped).
import { access, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT, type Project } from './products';
import { instantiate, slugify } from './templates';
import { writeAtomic } from './write';
import { treeFor, type Scope } from './scope';

export type CreatedDoc = { ok: true; slug: string; node: string } | { ok: false; error: 'conflict' | 'invalid'; message: string };

export async function createDocFromTemplate(scope: Scope, project: Project, o: { title: string; template: string; parent?: string; kind?: string }): Promise<CreatedDoc> {
  const title = o.title.trim();
  if (!title) return { ok: false, error: 'invalid', message: 'title required' };
  const kind = (o.kind ?? 'module').trim();
  const type = (scope.graph.types ?? []).find(t => t.slug === kind);
  if (!type) return { ok: false, error: 'invalid', message: `unknown type ${kind}` };
  const tree = treeFor(scope, project.slug);
  const parentDoc = o.parent ? [...tree.byFile.values()].find(x => x.slug === o.parent) : undefined;
  const slug = slugify(title);
  const abs = path.join(project.docsDir, `${slug}.md`);
  try { await access(abs); return { ok: false, error: 'conflict', message: `${slug}.md exists` }; } catch { /* new */ }
  let tpl = '';
  try { tpl = await readFile(path.join(REPO_ROOT, 'templates/docs', `${o.template}.md`), 'utf8'); }
  catch { return { ok: false, error: 'invalid', message: `unknown template ${o.template}` }; }
  let md = instantiate(tpl, { title, slug, parent: parentDoc ? parentDoc.module.id : '', date: new Date().toISOString().slice(0, 10), kind, props: type.props.filter(p => p.required && !['title', 'status'].includes(p.name)).map(p => p.name) });
  if (!parentDoc) md = md.replace(/^part-of: \n/m, '').replace(/\npart-of: $/m, '');
  if (kind !== 'module') md = md.replace(new RegExp('\\n```yaml\\nid: ' + kind + ':' + slug + '\\n[\\s\\S]*?\\n```\\n'), '\n');
  await mkdir(project.docsDir, { recursive: true });
  await writeAtomic(abs, md);
  return { ok: true, slug, node: `${kind}:${slug}` };
}
