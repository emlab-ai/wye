import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadScope } from '@/lib/scope';
import { REPO_ROOT } from '@/lib/products';
import { docRoute, documentTree } from '@/lib/doc';
import { writeAtomic, withFileLock, rebuild } from '@/lib/write';
import { embedInDefinition, readPlanDoc } from '@/lib/plan-docs';
import { claimWrite } from '@/lib/changes';
import { recordArtifact } from '@/lib/artifacts';

// op:api.propose (req:exec.wye-proposes, decision:exec.definition-home-fallback) — POST { card, plan, doc? } → one
// proposed block (a yaml card with `- id: kind:slug`) appended to the document where that kind lives, embedded on the
// plan's Definition; without `doc` the card is written on the plan itself under Definition, marked as needing a home.
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { card?: string; plan?: string; doc?: string; by?: string };
  const card = (body.card ?? '').replace(/^```ya?ml\s*\n|\n```\s*$/g, '').trim();
  const idm = card.match(/^-?\s*id:\s*([a-z-]+:[A-Za-z0-9_.\-]+)\s*$/m);
  if (!idm) return NextResponse.json({ error: 'invalid', message: 'the card must carry `- id: kind:slug`' }, { status: 422 });
  const id = idm[1];
  if (scope.idx.byId.get(id)?.defined) return NextResponse.json({ error: 'conflict', message: `${id} already exists — refine it with wf node set, do not add a second one` }, { status: 409 });
  if (!/^\s*status:/m.test(card)) return NextResponse.json({ error: 'invalid', message: 'the card needs a status (proposed, or open for a question)' }, { status: 422 });
  const session = req.headers.get('x-wf-session') ?? undefined;
  // the card as a list item: keys two deep, a folded value's lines deeper — relative indentation kept
  const lines = card.split('\n'); if (!/^-\s/.test(lines[0])) lines[0] = `- ${lines[0].trim()}`;
  const rest = lines.slice(1).filter(l => l.trim());
  const base = Math.min(...rest.map(l => l.match(/^\s*/)![0].length), 99);
  const block = [lines[0].replace(/^-\s+/, '- '), ...rest.map(l => `  ${l.slice(Math.min(base, l.match(/^\s*/)![0].length))}`)].join('\n');
  const plan = body.plan ? await readPlanDoc(product, body.plan) : null;
  if (body.plan && !plan) return NextResponse.json({ error: 'not_found', message: `plan ${body.plan} not found` }, { status: 404 });
  let file: string;
  if (body.doc) {
    const d = body.doc.split('/'); const target = [...documentTree(scope.graph).byFile.values()].find(x => x.slug === d[2] && docRoute(x.file)?.project === d[1]);
    if (!target) return NextResponse.json({ error: 'not_found', message: `document ${body.doc} not found` }, { status: 404 });
    file = path.join(REPO_ROOT, target.file);
    claimWrite(target.file, { session, by: body.by ?? (session ? undefined : 'agent:wye') });
    await withFileLock(file, async () => { const md = await readFile(file, 'utf8'); await writeAtomic(file, `${md.replace(/\s+$/, '')}\n\n\`\`\`yaml\n${block}\n\`\`\`\n`); });
    await rebuild(scope.product.dir);
    if (plan) await embedInDefinition(scope.product.dir, product, body.plan!, [id]);
  } else if (plan) {
    // no home yet: defined on the plan under Definition, the person moves it later (the id stays)
    file = plan.file;
    claimWrite(path.relative(REPO_ROOT, file), { session });
    await withFileLock(file, async () => {
      const md = await readFile(file, 'utf8');
      const m = md.match(/^## Definition[^\n]*\n/m); const fence = `\`\`\`yaml\n${block}\n  home: none yet — move this block to the document where its kind lives\n\`\`\``;
      let next: string;
      if (m && m.index !== undefined) { const start = m.index + m[0].length; const rest = md.slice(start); const n = rest.search(/^## /m); const end = n === -1 ? md.length : start + n; next = `${md.slice(0, start)}${md.slice(start, end).replace(/\s+$/, '')}\n\n${fence}\n${n === -1 ? '' : '\n'}${md.slice(end)}`; }
      else next = `${md.replace(/\s+$/, '')}\n\n## Definition\n\n${fence}\n`;
      await writeAtomic(file, next);
    });
    await rebuild(scope.product.dir);
  } else return NextResponse.json({ error: 'invalid', message: 'doc or plan required' }, { status: 422 });
  if (session) recordArtifact(scope.product.dir, session, { node: id }).catch(() => {});
  return NextResponse.json({ ok: true, id, file: path.relative(REPO_ROOT, file), plan: body.plan ?? null }, { status: 201 });
}
