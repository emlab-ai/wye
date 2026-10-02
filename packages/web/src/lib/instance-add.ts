// A new instance of a type, and where it went (decision:ontology.collection-document, req:ontology.instance-home): a row
// of the type's collection document — the document `home:` on the type card names, else one titled with the type's
// plural, created in the project that declares the type on the first instance and written as `home:` so every later
// path lands there. A type with no `home:` — a base kind (task, req, decision…) among them — gets the same: its
// plural's page in the person's docs/ (tasks.md, reqs.md, goals.md), in the project the caller is on (`home`:
// <project>/<page>), never the page itself — that may be a view, or a system page in .wye/
// (decision:wf2.instances-go-home). A base kind's card is read-only, so its page is found by name each time. The graph
// rebuilds. The types route and a PR without a goal (decision:wf2.pr-has-a-goal) both come here.
import path from 'node:path';
import { access, mkdir, readFile } from 'node:fs/promises';
import type { Scope } from './scope';
import { typeBySlug, isBaseType } from './types';
import { REPO_ROOT } from './products';
import { writeAtomic, withFileLock, rebuild } from './write';
import { newInstanceCard, appendCard, pluralTitle, collectionDoc, appendRow, hasTable, newInstanceRow } from './instances';
import { instantiate, slugify } from './templates';
import { docRoute } from './doc';
import { setTypeProps } from './type-edit';

export type InstanceInput = { slug?: string; title?: string; home?: string; props?: Record<string, string> };
export type AddedInstance = { ok: true; id: string; file: string; doc: { project: string; doc: string; title: string } | null; created: boolean; row: boolean } | { ok: false; status: number; error: string; message: string };

export async function addInstance(scope: Scope, typeSlug: string, body: InstanceInput): Promise<AddedInstance> {
  const t = typeBySlug(scope.graph, typeSlug); if (!t) return { ok: false, status: 404, error: 'not_found', message: 'unknown type' };
  // extra keys the caller wants on the new instance — a list under a goal writes `part-of: goal:x` so the row lands
  // where the list shows it (req:wf2.instances.list-new-line)
  const extra = Object.fromEntries(Object.entries(body.props ?? {}).filter(([k, v]) => /^[a-z][a-z0-9-]*$/i.test(k) && typeof v === 'string' && v.trim()));
  const slug = (body.slug ?? '').trim();
  if (!/^[a-z0-9][a-z0-9_.-]*$/.test(slug)) return { ok: false, status: 422, error: 'invalid', message: 'slug must be lowercase letters, digits, dots or dashes' };
  const id = `${typeSlug}:${slug}`;
  if (scope.idx.byId.get(id)?.defined) return { ok: false, status: 409, error: 'conflict', message: `${id} already exists` };
  const moduleFile = (ref: string) => scope.graph.modules.find(m => m.id === ref || m.file.endsWith('/' + ref.replace(/^[a-z-]+:/, '') + '.md'))?.file ?? '';
  let file = t.home ? moduleFile(t.home) : '';
  let created = false;
  if (!file) {
    // the first instance: the collection document in the declaring project — a base kind's in the caller's (an existing
    // document of that slug is taken as it is), then `home:` on a product type's card
    const base = isBaseType(t);
    const at = base ? body.home?.split('/')[0] : docRoute(t.file)?.project;
    const project = scope.projects.find(p => p.slug === at) ?? scope.projects[0];
    if (!project) return { ok: false, status: 422, error: 'invalid', message: 'the product has no project to hold the collection document' };
    const title = pluralTitle(t), docSlug = slugify(title);
    file = path.posix.join(project.docsRel, `${docSlug}.md`);
    const abs = path.join(REPO_ROOT, file);
    try { await access(abs); } catch {
      const tpl = await readFile(path.join(REPO_ROOT, 'templates/docs/blank.md'), 'utf8');
      const md = instantiate(tpl, { title, slug: docSlug, parent: '', date: new Date().toISOString().slice(0, 10) }).replace(/^part-of: \n/m, '').replace(/\npart-of: $/m, '');
      await mkdir(project.docsDir, { recursive: true });
      await writeAtomic(abs, collectionDoc(md, typeSlug));
      created = true;
    }
    if (!base) {
      const homeId = scope.graph.modules.find(m => m.file === file)?.id ?? `module:${docSlug}`;
      const typeAbs = path.join(REPO_ROOT, t.file);
      await withFileLock(typeAbs, async () => {
        const out = setTypeProps(await readFile(typeAbs, 'utf8'), t.id, null, { home: homeId });
        if (!out.error) await writeAtomic(typeAbs, out.md);
      });
    }
  }
  const abs = path.join(REPO_ROOT, file);
  let row = false;
  await withFileLock(abs, async () => {
    const md = await readFile(abs, 'utf8');
    // a row of the type's table when the document has one (a product type's collection always does), else a card
    row = created || hasTable(md, typeSlug);
    // a task's row is a checkbox line, so it is born open on the Work view
    const line = newInstanceRow(id, body.title ?? '', extra);
    await writeAtomic(abs, row ? appendRow(md, typeSlug, typeSlug === 'task' ? line.replace(/^- /, '- [ ] ') : line) : appendCard(md, newInstanceCard(t, id, body.title ?? '', extra)));
  });
  await rebuild(scope.product.dir);
  const route = docRoute(file);
  const doc = route ? { ...route, title: scope.graph.modules.find(m => m.file === file)?.title || (created ? pluralTitle(t) : route.doc) } : null;
  return { ok: true, id, file, doc, created, row };
}
