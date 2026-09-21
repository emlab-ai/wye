import { NextResponse } from 'next/server';
import { claimWrite } from '@/lib/changes';
import path from 'node:path';
import { loadScope, treeFor } from '@/lib/scope';
import { loadMarkdown } from '@/lib/load';
import { REPO_ROOT } from '@/lib/products';
import { docRoute, splitDocument } from '@/lib/doc';
import { recordArtifact } from '@/lib/artifacts';
import { retypeFrontmatter, rewriteId } from '@/lib/retype';
import { readFile } from 'node:fs/promises';
import { appendChunk, bodyOf, hashOf, insertYamlAfterSegment, lint, patchFrontmatter, rebuild, replaceBody, replaceChunk, replaceSegment, writeAtomic, type WriteResult } from '@/lib/write';

type Op =
  | { op: 'replace-segment'; index: number; ifMatch: string; text: string }
  | { op: 'replace-chunk'; segment: number; chunk: number; ifMatch: string; body: string }
  | { op: 'append-chunk'; segment: number; body: string }
  | { op: 'insert-yaml-after-segment'; segment: number; body: string }
  | { op: 'frontmatter'; patch: Record<string, string> }
  | { op: 'replace-body'; ifMatch: string; body: string }
  | { op: 'retype'; type: string };

async function locate(product: string, project: string, slug: string) {
  const scope = await loadScope(product, project); if (!scope) return null;
  const d = [...treeFor(scope, project).byFile.values()].find(x => x.slug === slug && docRoute(x.file)?.project === project);
  return d ? { scope, d } : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ product: string; project: string; slug: string }> }) {
  const { product, project, slug } = await params;
  const hit = await locate(product, project, slug); if (!hit) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const md = await loadMarkdown(REPO_ROOT, hit.d.file); const body = bodyOf(md);
  return NextResponse.json({ file: hit.d.file, body, bodyHash: hashOf(body) });
}

export async function PUT(req: Request, { params }: { params: Promise<{ product: string; project: string; slug: string }> }) {
  const { product, project, slug } = await params;
  const hit = await locate(product, project, slug); if (!hit) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as Op;
  const session = req.headers.get('x-wf-session'); if (session) recordArtifact(hit.scope.product.dir, session, { doc: hit.d.module.id }).catch(() => {});
  claimWrite(hit.d.file, { session: session ?? undefined, by: req.headers.get('x-wf-by') ?? undefined }); // who edits this document (change records, lib/changes)
  // the graph may still list a document whose file was just removed outside the app: a write never recreates it
  // (rule:doc-write-gone, decision:wf2.deleted-outside-drops-edits)
  const md = await loadMarkdown(REPO_ROOT, hit.d.file).catch(() => null);
  if (md === null) return NextResponse.json({ error: 'not_found', message: `${hit.d.file} is no longer on disk` }, { status: 404 });
  if (body.op === 'retype') return retype(hit.scope, hit.d.file, md, body.type);
  let r: WriteResult;
  switch (body.op) {
    case 'replace-segment': r = replaceSegment(md, body.index, body.ifMatch, body.text); break;
    case 'replace-chunk': r = replaceChunk(md, body.segment, body.chunk, body.ifMatch, body.body); break;
    case 'append-chunk': r = appendChunk(md, body.segment, body.body); break;
    case 'insert-yaml-after-segment': r = insertYamlAfterSegment(md, body.segment, body.body); break;
    case 'frontmatter': r = patchFrontmatter(md, body.patch); break;
    case 'replace-body': r = replaceBody(md, body.ifMatch, body.body); break;
    default: return NextResponse.json({ error: 'invalid', message: 'unknown op' }, { status: 422 });
  }
  if (r.error === 'conflict') return NextResponse.json({ error: 'conflict', current: r.current }, { status: 409 });
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.error === 'not_found' ? 404 : 422 });
  await writeAtomic(path.join(REPO_ROOT, hit.d.file), r.md);
  const built = await rebuild(hit.scope.product.dir);
  const checked = await lint(hit.scope.product.dir);
  const errors = checked.output.split('\n').filter(l => /^ERROR/i.test(l)).slice(0, 20);
  // the check is product-wide: an error is this document's when it names the file or a node defined in it; the rest is a count
  const own = new Set(hit.scope.graph.nodes.filter(n => n.defined && n.file === hit.d.file).map(n => n.id));
  const mine = errors.filter(e => e.includes(hit.d.file) || [...own].some(id => e.includes(id)));
  const split = splitDocument(r.md);
  const hashes = split.segments.map(s => s.type === 'markdown' ? hashOf(s.text) : s.type === 'yaml' ? s.chunks.map(c => hashOf(c.raw)) : null);
  return NextResponse.json({ ok: true, rebuilt: built.code === 0, build: built.output.trim(), lintOk: mine.length === 0, lintErrors: mine, lintElsewhere: errors.length - mine.length, hashes, bodyHash: hashOf(bodyOf(r.md)) });
}

// op:doc.retype (rule:doc-retype): the page becomes an instance of `type` — its node line takes the kind and every
// reference to the old id across the product's documents is rewritten in the same operation, one write per file;
// refused when the new id already exists.
async function retype(scope: Awaited<ReturnType<typeof loadScope>> & object, file: string, md: string, type: string) {
  const kind = (type ?? '').trim();
  if (!(scope.graph.types ?? []).some(t => t.slug === kind)) return NextResponse.json({ error: 'invalid', message: `unknown type ${kind}` }, { status: 422 });
  const r = retypeFrontmatter(md, kind); if (!r) return NextResponse.json({ error: 'invalid', message: 'the page has no node line' }, { status: 422 });
  if (r.from === r.to) return NextResponse.json({ ok: true, node: r.to, rewritten: 0, files: 0 });
  if (scope.idx.byId.get(r.to)?.defined) return NextResponse.json({ error: 'conflict', message: `${r.to} already exists` }, { status: 409 });
  let rewritten = 0, files = 0;
  for (const rel of scope.graph.files) {
    const abs = path.join(REPO_ROOT, rel);
    const cur = rel === file ? r.md : await readFile(abs, 'utf8').catch(() => '');
    const w = rewriteId(cur, r.from, r.to);
    if (rel !== file && !w.count) continue;
    await writeAtomic(abs, w.md); rewritten += w.count; files++;
  }
  const built = await rebuild(scope.product.dir);
  return NextResponse.json({ ok: true, node: r.to, from: r.from, rewritten, files, rebuilt: built.code === 0 });
}
