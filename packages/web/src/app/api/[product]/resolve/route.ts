import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { loadMarkdown } from '@/lib/load';
import { REPO_ROOT } from '@/lib/products';
import { documentTree, docRoute, headingSlug, splitDocument } from '@/lib/doc';
import { bodyOf } from '@/lib/write';
import { hashableBlocks, parseAnchor } from '@/lib/anchors';
import { relations } from '@/lib/graph';

// What a link points at, for agents: GET ?link=<url or path>#<anchor>
// → { product, project, doc, file, title, anchor, node?, block?: { line, text }, section?: { heading, text } }
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const link = new URL(req.url).searchParams.get('link') ?? '';
  let pathPart = link, frag = '';
  try { const u = new URL(link); pathPart = u.pathname; frag = u.hash; } catch { const i = link.indexOf('#'); if (i >= 0) { frag = link.slice(i); pathPart = link.slice(0, i); } }
  // a bare node id is a link too
  if (/^[a-z-]+:[A-Za-z0-9_./#-]+$/.test(link) && !link.includes('/')) { pathPart = ''; frag = '#n-' + encodeURIComponent(link); }
  const m = pathPart.match(new RegExp(`(?:^|/)${product}/([^/]+)/d/([^/#?]+)`));
  const tree = documentTree(scope.graph);
  const anchor = parseAnchor(frag);
  let docNode = m ? [...tree.byFile.values()].find(d => d.slug === m[2] && docRoute(d.file)?.project === m[1]) : undefined;
  if (!docNode && anchor?.kind === 'node') { const n = scope.idx.byId.get(anchor.id); if (n?.file) docNode = tree.byFile.get(n.file); }
  if (!docNode) return NextResponse.json({ error: 'not_found', message: 'no document for that link' }, { status: 404 });
  const route = docRoute(docNode.file)!;
  const md = await loadMarkdown(REPO_ROOT, docNode.file); const body = bodyOf(md);
  const out: Record<string, unknown> = { product, project: route.project, doc: route.doc, file: docNode.file, title: docNode.title, anchor: frag.replace(/^#/, '') };
  if (anchor?.kind === 'node') {
    const n = scope.idx.byId.get(anchor.id);
    if (n) out.node = { id: n.id, kind: n.kind, title: n.title, status: n.status, body: n.body, line: n.line, relations: relations(scope.idx, n.id) };
  } else if (anchor?.kind === 'block') {
    const hit = hashableBlocks(body).find(b => b.hash === anchor.hash);
    out.block = hit ? { line: hit.line, text: hit.text } : null;
    if (!hit) out.note = 'the block text changed since the link was made; the document is the fallback';
  } else if (anchor?.kind === 'heading') {
    const lines = body.split('\n'); let start = -1, level = 0;
    for (let i = 0; i < lines.length; i++) { const h = lines[i].match(/^(#{1,6})\s+(.+)$/); if (h && headingSlug(h[2]) === anchor.slug) { start = i; level = h[1].length; break; } }
    if (start >= 0) { let end = lines.length; for (let i = start + 1; i < lines.length; i++) { const h = lines[i].match(/^(#{1,6})\s/); if (h && h[1].length <= level) { end = i; break; } } out.section = { heading: lines[start].replace(/^#+\s+/, ''), line: start + 1, text: lines.slice(start, end).join('\n') }; }
  }
  if (!anchor) { const sp = splitDocument(md); out.frontmatter = sp.frontmatter; out.length = body.length; }
  return NextResponse.json(out);
}
