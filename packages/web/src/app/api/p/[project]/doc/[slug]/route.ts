import { NextResponse } from 'next/server';
import path from 'node:path';
import { getProject } from '@/lib/projects';
import { loadGraph, loadMarkdown } from '@/lib/load';
import { documentTree, splitDocument } from '@/lib/doc';
import { appendChunk, bodyOf, hashOf, insertYamlAfterSegment, lint, patchFrontmatter, rebuild, replaceBody, replaceChunk, replaceSegment, writeAtomic, type WriteResult } from '@/lib/write';

type Op =
  | { op: 'replace-segment'; index: number; ifMatch: string; text: string }
  | { op: 'replace-chunk'; segment: number; chunk: number; ifMatch: string; body: string }
  | { op: 'append-chunk'; segment: number; body: string }
  | { op: 'insert-yaml-after-segment'; segment: number; body: string }
  | { op: 'frontmatter'; patch: Record<string, string> }
  | { op: 'replace-body'; ifMatch: string; body: string };

export async function PUT(req: Request, { params }: { params: Promise<{ project: string; slug: string }> }) {
  const { project, slug } = await params;
  const p = getProject(project); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const g = await loadGraph(p.graphPath);
  const d = [...documentTree(g).byFile.values()].find(x => x.slug === slug);
  if (!d) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as Op;
  const md = await loadMarkdown(p.rootPath, d.file);
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
  await writeAtomic(path.join(p.rootPath, d.file), r.md);
  const built = await rebuild(p.rootPath);
  const checked = await lint(p.rootPath);
  const errors = checked.output.split('\n').filter(l => /^ERROR/i.test(l) || /error\b/.test(l) && !/0 error/.test(l)).slice(0, 20);
  const split = splitDocument(r.md);
  const hashes = split.segments.map(s => s.type === 'markdown' ? hashOf(s.text) : s.type === 'yaml' ? s.chunks.map(c => hashOf(c.raw)) : null);
  return NextResponse.json({ ok: true, rebuilt: built.code === 0, build: built.output.trim(), lintOk: checked.code === 0, lintErrors: errors, hashes, bodyHash: hashOf(bodyOf(r.md)) });
}
