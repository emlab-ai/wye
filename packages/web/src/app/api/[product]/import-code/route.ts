import { NextResponse } from 'next/server';
import { access, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { getProduct, REPO_ROOT } from '@/lib/products';
import { loadScope, mainProject, treeFor } from '@/lib/scope';
import { rebuild, writeAtomic } from '@/lib/write';
import { assignTask } from '@/lib/work-io';
import { agentSettings, readSettings } from '@/lib/settings';
import { slugify } from '@/lib/templates';

// op:api.import-code — POST { name, path, parent?, brief?, analyse? } → the module's page under `parent` in the project,
// with one task on it, handed to the default agent with skill:import-code — and the answer at once
// (req:wf2.import.code, decision:wf2.import-code-is-a-session). Nothing is read here: the agent surveys the folder
// and writes the page's definition in its session; the page says `status: importing` until it is done. `path` is a
// folder: absolute, or relative to the product's repo (`repo:` in _product.md).
export async function POST(req: Request, { params }: { params: Promise<{ product: string; project?: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { name?: string; path?: string; project?: string; parent?: string; brief?: string; analyse?: boolean };
  const name = (body.name ?? '').trim(); const given = (body.path ?? '').trim();
  if (!name || !given) return NextResponse.json({ error: 'invalid', message: 'name and path required' }, { status: 422 });
  const repo = p.meta.repo ? path.resolve(p.meta.repo) : REPO_ROOT;
  const abs = path.isAbsolute(given) ? given : path.join(repo, given);
  try { if (!(await stat(abs)).isDirectory()) throw new Error(); } catch { return NextResponse.json({ error: 'invalid', message: `${abs} is not a folder` }, { status: 422 }); }
  // no project named: the product's main project, the one the rail opens (lib/scope#mainProject)
  const scope0 = await loadScope(product, body.project); if (!scope0) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const target = scope0.project ?? mainProject(scope0);
  if (!target) return NextResponse.json({ error: 'not_found', message: body.project ? `no project ${body.project}` : 'the product has no project' }, { status: 404 });
  const project = target.slug;
  const tree = treeFor(scope0, project);
  const parentDoc = body.parent ? [...tree.byFile.values()].find(x => x.slug === body.parent) : undefined;
  if (body.parent && !parentDoc) return NextResponse.json({ error: 'invalid', message: `no document ${body.parent}` }, { status: 422 });
  // the page: <slug>.md, a free slug
  const base = slugify(name) || 'module'; let slug = base;
  for (let n = 2; ; n++) { try { await access(path.join(target.docsDir, `${slug}.md`)); slug = `${base}-${n}`; } catch { break; } }
  const taskId = `task:${slug}.import`;
  const brief = (body.brief ?? '').trim();
  const q = (s: string) => JSON.stringify(s);
  const fm = [`node: module:${slug}`, 'type: module', `title: ${q(name)}`, 'status: importing', 'owner: unassigned', `last-verified: ${new Date().toISOString().slice(0, 10)}`, `source: ${q(`code:${abs}`)}`, ...(brief ? [`brief: ${q(brief.replace(/\s*\n\s*/g, ' '))}`] : []), ...(parentDoc ? [`part-of: ${parentDoc.module.id}`] : [])];
  const md = `---\n${fm.join('\n')}\n---\n\n# ${name}\n\n_Read from \`${abs}\` by an agent: its purpose, requirements, rules, entities, operations and tests land on this page as proposed blocks, for review in the Inbox._\n\n## Tasks\n\n- [ ] ${taskId} Read the code under \`${abs}\` and describe ${name} on this page — purpose, requirements in the person's words mapped to the files that deliver them, rules, entities, operations, tests. #ready\n`;
  await mkdir(target.docsDir, { recursive: true });
  await writeAtomic(path.join(target.docsDir, `${slug}.md`), md);
  const built = await rebuild(p.dir);
  let session: string | undefined; let error: string | undefined;
  if (body.analyse !== false && built.code === 0) {
    const scope = await loadScope(product, project);
    const settings = agentSettings(await readSettings());
    if (scope) {
      const r = await assignTask(scope, taskId, { worker: settings.agent, wfUrl: new URL(req.url).origin, by: 'import', force: true, skills: ['skill:import-code'], note: `The folder is \`${abs}\`; the page is ${product}/${project}/${slug} (module:${slug}).${brief ? `\n\nThe person's brief for this import: ${brief}` : ''}` });
      if (r.ok) session = r.session; else error = r.message;
    }
  }
  return NextResponse.json({ ok: true, project, slug, node: `module:${slug}`, task: taskId, session, error, rebuilt: built.code === 0 });
}
