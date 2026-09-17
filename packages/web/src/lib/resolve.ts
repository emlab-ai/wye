// What a link points at: a document, a node, a hashed block or a heading section. Shared by the resolve API
// (agents via wf resolve) and the agent host (prompts).
import type { Scope } from './scope';
import { loadMarkdown } from './load';
import { REPO_ROOT } from './products';
import { documentTree, docRoute, headingSlug, splitDocument } from './doc';
import { bodyOf } from './write';
import { hashableBlocks, parseAnchor } from './anchors';
import { relations } from './graph';

export type Resolved = { product: string; project: string; doc: string; file: string; title: string; anchor: string; node?: { id: string; kind: string; title: string; status: string; body: string; line: number; relations: { out: [string, string[]][]; inc: [string, string[]][] } }; block?: { line: number; text: string } | null; section?: { heading: string; line: number; text: string }; note?: string; frontmatter?: Record<string, string>; length?: number };

export async function resolveLink(scope: Scope, link: string): Promise<Resolved | null> {
  const product = scope.product.slug;
  let pathPart = link, frag = '';
  try { const u = new URL(link); pathPart = u.pathname; frag = u.hash; } catch { const i = link.indexOf('#'); if (i >= 0) { frag = link.slice(i); pathPart = link.slice(0, i); } }
  if (/^[a-z-]+:[A-Za-z0-9_./#-]+$/.test(link) && !link.includes('/')) { pathPart = ''; frag = '#n-' + encodeURIComponent(link); } // a bare node id
  const m = pathPart.match(new RegExp(`(?:^|/)${product}/([^/]+)/d/([^/#?]+)`));
  const tree = documentTree(scope.graph);
  const anchor = parseAnchor(frag);
  let docNode = m ? [...tree.byFile.values()].find(d => d.slug === m[2] && docRoute(d.file)?.project === m[1]) : undefined;
  if (!docNode && anchor?.kind === 'node') { const n = scope.idx.byId.get(anchor.id); if (n?.file) docNode = tree.byFile.get(n.file); }
  if (!docNode) return null;
  const route = docRoute(docNode.file)!;
  const md = await loadMarkdown(REPO_ROOT, docNode.file); const body = bodyOf(md);
  const out: Resolved = { product, project: route.project, doc: route.doc, file: docNode.file, title: docNode.title, anchor: frag.replace(/^#/, '') };
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
  return out;
}

// A resolved link as prompt text.
export function renderResolved(ref: string, j: Resolved): string {
  const head = `### ${ref}\n${j.title} — ${j.file}`;
  if (j.node) { const r = j.node.relations; return `${head}\n${j.node.body}\n${r.out.map(([v, ids]) => `${v} → ${ids.join(', ')}`).join('\n')}${r.inc.length ? '\n' + r.inc.map(([v, ids]) => `← ${v}: ${ids.join(', ')}`).join('\n') : ''}`; }
  if (j.block) return `${head} (line ${j.block.line})\n${j.block.text}`;
  if (j.section) return `${head}\n${j.section.text.slice(0, 6000)}`;
  return `${head}\n(the whole document, ${j.length} chars — read it with wf doc ${j.product}/${j.project}/${j.doc})`;
}
