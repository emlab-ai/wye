import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadScope } from '@/lib/scope';
import { REPO_ROOT } from '@/lib/products';
import { docRoute, documentTree, pageBySlug } from '@/lib/doc';
import { writeAtomic, withFileLock, rebuild } from '@/lib/write';
import { embedInDefinition, readPrDoc } from '@/lib/pr-docs';
import { claimWrite } from '@/lib/changes';
import { recordArtifact } from '@/lib/artifacts';
import { parseCard, placeCard } from '@/lib/propose-card';

// op:api.propose (req:exec.wye-proposes, decision:exec.definition-home-fallback) — POST { card, pr, doc? } → one
// proposed block (a yaml card with `- id: kind:slug`, checked by parseCard) added to the document where that kind lives,
// embedded on the request's Definition; without `doc` the card is written on the request itself under Definition — a
// block defined there has no home yet, which the page shows by where it sits. A request page's own cards always go
// under its Definition, never after Result (placeCard).
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const raw = (await req.json()) as { card?: string; pr?: string; plan?: string; doc?: string; by?: string };
  const body = { ...raw, pr: raw.pr ?? raw.plan }; // `plan` is the old name of the request ref
  const parsed = parseCard(body.card ?? '');
  if ('error' in parsed) return NextResponse.json({ error: 'invalid', message: parsed.error }, { status: 422 });
  const { id, block } = parsed;
  if (scope.idx.byId.get(id)?.defined) return NextResponse.json({ error: 'conflict', message: `${id} already exists — refine it with wf node set, do not add a second one` }, { status: 409 });
  const session = req.headers.get('x-wf-session') ?? undefined;
  const pr = body.pr ? await readPrDoc(product, body.pr) : null;
  if (body.pr && !pr) return NextResponse.json({ error: 'not_found', message: `request ${body.pr} not found` }, { status: 404 });
  let file: string;
  if (body.doc) {
    const d = body.doc.split('/'); const target = pageBySlug(documentTree(scope.graph).byFile.values(), d[1], d[2]);
    if (!target) return NextResponse.json({ error: 'not_found', message: `document ${body.doc} not found` }, { status: 404 });
    file = path.join(REPO_ROOT, target.file);
    claimWrite(target.file, { session, by: body.by ?? (session ? undefined : 'agent:wye') });
    await withFileLock(file, async () => { const md = await readFile(file, 'utf8'); await writeAtomic(file, placeCard(md, `\`\`\`yaml\n${block}\n\`\`\``)); });
    await rebuild(scope.product.dir);
    if (pr) await embedInDefinition(scope.product.dir, product, body.pr!, [id]);
  } else if (pr) {
    // no home yet: defined on the request under Definition, the person moves it later (the id stays)
    file = pr.file;
    claimWrite(path.relative(REPO_ROOT, file), { session });
    await withFileLock(file, async () => { const md = await readFile(file, 'utf8'); await writeAtomic(file, placeCard(md.match(/^## Definition/m) ? md : `${md.replace(/\s+$/, '')}\n\n## Definition\n`, `\`\`\`yaml\n${block}\n\`\`\``)); });
    await rebuild(scope.product.dir);
  } else return NextResponse.json({ error: 'invalid', message: 'doc or pr required' }, { status: 422 });
  if (session) recordArtifact(scope.product.dir, session, { node: id }).catch(() => {});
  return NextResponse.json({ ok: true, id, file: path.relative(REPO_ROOT, file), pr: body.pr ?? null }, { status: 201 });
}
