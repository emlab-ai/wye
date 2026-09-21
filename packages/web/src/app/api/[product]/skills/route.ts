import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { createSkillDoc, listSkills, skillBody } from '@/lib/skills';
import { rebuild } from '@/lib/write';
import { prsPageId } from '@/lib/pr-doc';
import { treeFor } from '@/lib/scope';

// op:api.skills (decision:wf2.hooks-and-skills) — GET → the product's skills (id, title, role, takes, status, document);
// GET ?id=skill:x → one skill with its body (what `wye skill <id>` prints). POST { title, project?, role? } → a new
// skill document from the template under the project's Skills page; returns { slug, project }.
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const id = new URL(req.url).searchParams.get('id');
  if (id) {
    const sid = id.startsWith('skill:') ? id : `skill:${id}`;
    const body = await skillBody(scope, sid);
    if (body === null) return NextResponse.json({ error: 'not_found', message: `${sid} has no document and is not a base skill` }, { status: 404 });
    const meta = (await listSkills(scope)).find(s => s.id === sid);
    return NextResponse.json({ id: sid, title: meta?.title ?? scope.graph.nodes.find(n => n.id === sid)?.title ?? sid, role: meta?.role ?? 'librarian', takes: meta?.takes ?? '', body, doc: meta ? `${product}/${meta.project}/${meta.slug}` : null });
  }
  return NextResponse.json({ skills: await listSkills(scope) });
}

export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const b = await req.json().catch(() => ({})) as { title?: string; project?: string; role?: string };
  if (!b.title?.trim()) return NextResponse.json({ error: 'invalid', message: 'title required' }, { status: 422 });
  const project = (b.project && scope.projects.find(p => p.slug === b.project)) ?? scope.projects.find(p => scope.graph.modules.some(m => m.id === prsPageId(p.slug))) ?? scope.projects[0];
  if (!project) return NextResponse.json({ error: 'invalid', message: 'the product has no project' }, { status: 422 });
  const t = treeFor(scope, project.slug);
  const root = t.main && !['prs', 'skills', 'hooks'].includes(t.main.slug) ? t.main.module.id : null;
  const slug = await createSkillDoc(project, root, b.title.trim(), b.role === 'worker' ? 'worker' : 'librarian');
  await rebuild(scope.product.dir);
  return NextResponse.json({ slug, project: project.slug });
}
