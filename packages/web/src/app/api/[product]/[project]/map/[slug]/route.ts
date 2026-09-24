import { NextResponse } from 'next/server';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { claimWrite } from '@/lib/changes';
import { docRoute, projectTree } from '@/lib/doc';
import { addCard, dropIn, mapGraph, moveIn, parseLayout, withLink, withoutLink, writeLayout } from '@/lib/map';
import { cardText, newInstanceCard, removeCard, replaceCard } from '@/lib/instances';
import { REPO_ROOT } from '@/lib/products';
import { loadScope, type Scope } from '@/lib/scope';
import { slugify } from '@/lib/templates';
import { typeBySlug } from '@/lib/types';
import { rebuild, withFileLock, writeAtomic } from '@/lib/write';

// The map page's one endpoint (decision:map.page-owns-its-nodes): a canvas gesture in, the page rewritten and the
// canvas's next picture out. GET → what to draw; POST { action, … } → one gesture:
//   node   { kind, title?, x, y, parent?, verb? }   a card added to the page, positioned, linked to its parent
//   child  the same with a parent required (decision:map.children-are-linked-nodes)
//   ref    { id, x, y }                             a node from another document put on the canvas
//   link   { from, to, verb? }                      the verb written on the source's card
//   verb   { from, to, verb, was }                  the edge renamed
//   unlink { from, to, verb }                       the edge taken off
//   drop   { id }                                   off the canvas, and out of the page when the page defines it
//   layout { moves: [{ id, x, y }] }                positions only — one silent write, no rebuild (the fast path)
// Every action but `layout` rebuilds the graph, because it changed the knowledge; `layout` changed only where things
// sit, which is the map's own business (decision:map.layout-is-a-fenced-section) and must keep up with a dragging hand.
type Act =
  | { action: 'node' | 'child'; kind: string; title?: string; x?: number; y?: number; parent?: string; verb?: string }
  | { action: 'ref'; id: string; x?: number; y?: number }
  | { action: 'link'; from: string; to: string; verb?: string }
  | { action: 'verb'; from: string; to: string; verb: string; was: string }
  | { action: 'unlink'; from: string; to: string; verb: string }
  | { action: 'drop'; id: string }
  | { action: 'layout'; moves: { id: string; x: number; y: number }[] };

async function locate(product: string, project: string, slug: string) {
  const scope = await loadScope(product, project); if (!scope) return null;
  const d = [...projectTree(scope.graph, project).byFile.values()].find(x => x.slug === slug && docRoute(x.file)?.project === project);
  return d ? { scope, d } : null;
}
const bad = (message: string, status = 422) => NextResponse.json({ error: status === 409 ? 'conflict' : 'invalid', message }, { status });

// What the canvas draws, read fresh: the graph as it is now plus the page's positions.
async function picture(product: string, project: string, slug: string) {
  const hit = await locate(product, project, slug); if (!hit) return null;
  const md = await readFile(path.join(REPO_ROOT, hit.d.file), 'utf8').catch(() => '');
  const spots = parseLayout(md);
  return { ...hit, spots, map: mapGraph(hit.scope.graph, hit.scope.idx, hit.d.file, hit.d.module.id, spots) };
}

export async function GET(_req: Request, { params }: { params: Promise<{ product: string; project: string; slug: string }> }) {
  const { product, project, slug } = await params;
  const p = await picture(product, project, slug); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ file: p.d.file, node: p.d.module.id, ...p.map, spots: p.spots });
}

export async function POST(req: Request, { params }: { params: Promise<{ product: string; project: string; slug: string }> }) {
  const { product, project, slug } = await params;
  const hit = await locate(product, project, slug); if (!hit) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { scope, d } = hit;
  const body = (await req.json()) as Act;
  const who = { session: req.headers.get('x-wf-session') ?? undefined, by: req.headers.get('x-wf-by') ?? undefined };
  const abs = path.join(REPO_ROOT, d.file);
  const num = (v: unknown, dflt = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : dflt);

  // dragging: the whole Layout section rewritten from what the canvas says has moved, under the file's own lock so a
  // drag and a save never interleave. Silent (lib/changes): moving a card is not a change to what the card says.
  if (body.action === 'layout') {
    const moves = (body.moves ?? []).filter(m => m && typeof m.id === 'string');
    if (!moves.length) return NextResponse.json({ ok: true, moved: 0 });
    claimWrite(d.file, { ...who, silent: true });
    const known = new Set(scope.graph.nodes.filter(n => n.defined && n.file === d.file).map(n => n.id));
    await withFileLock(abs, async () => {
      const md = await readFile(abs, 'utf8');
      let spots = parseLayout(md);
      for (const m of moves) spots = moveIn(spots, m.id, num(m.x), num(m.y), !known.has(m.id));
      const out = writeLayout(md, spots);
      if (out !== md) await writeAtomic(abs, out);
    });
    return NextResponse.json({ ok: true, moved: moves.length });
  }

  let created: string | null = null;
  let err: NextResponse | null = null;
  claimWrite(d.file, who);

  if (body.action === 'node' || body.action === 'child') {
    const kind = (body.kind ?? '').trim();
    const t = typeBySlug(scope.graph, kind);
    if (!t) return bad(`unknown kind ${kind || '(none)'} — a node's kind is a type in the ontology`);
    if (body.action === 'child' && !body.parent) return bad('a child needs a parent');
    const parent = (body.parent ?? '').trim();
    if (parent && !scope.idx.byId.get(parent)?.defined) return bad(`${parent} is not a node`, 409);
    const title = (body.title ?? '').trim();
    // the id: the title made a slug, cut short, and numbered when the product already has it
    const base = (slugify(title).slice(0, 48) || kind).replace(/-+$/, '');
    let id = `${kind}:${base}`;
    for (let n = 2; scope.idx.byId.get(id)?.defined; n++) id = `${kind}:${base}-${n}`;
    created = id;
    const verb = (body.verb ?? 'part-of').trim();
    // a node drawn on a canvas is a sketch, not settled knowledge: it is proposed where the type allows that, which also
    // keeps `wye check` quiet about a requirement that has nothing satisfying it yet
    const props: Record<string, string> = (t.statuses ?? []).includes('proposed') ? { status: 'proposed' } : {};
    if (parent) props[verb] = parent;
    await withFileLock(abs, async () => {
      const md = await readFile(abs, 'utf8');
      const card = newInstanceCard(t, id, title, props);
      const spots = moveIn(parseLayout(md), id, num(body.x), num(body.y));
      await writeAtomic(abs, writeLayout(addCard(md, card), spots));
    });
  } else if (body.action === 'ref') {
    const id = (body.id ?? '').trim();
    const n = scope.idx.byId.get(id);
    if (!n?.defined) return bad(`${id} is not a node`, 404);
    if (n.file === d.file) return bad(`${id} is already on this page`, 409);
    await withFileLock(abs, async () => {
      const md = await readFile(abs, 'utf8');
      await writeAtomic(abs, writeLayout(md, moveIn(parseLayout(md), id, num(body.x), num(body.y), true)));
    });
  } else if (body.action === 'link' || body.action === 'verb' || body.action === 'unlink') {
    const from = (body.from ?? '').trim(), to = (body.to ?? '').trim();
    const src = scope.idx.byId.get(from);
    if (!src?.defined || !src.file) return bad(`${from} is not a node`, 404);
    if (!scope.idx.byId.get(to)?.defined) return bad(`${to} is not a node`, 404);
    if (from === to) return bad('a node cannot link to itself');
    const verb = ((body.action === 'link' ? body.verb : body.verb) ?? 'related-to').trim();
    if (!/^[a-z][a-z0-9-]*$/.test(verb)) return bad(`"${verb}" is not a verb — lowercase words joined by dashes`);
    const was = body.action === 'verb' ? (body.was ?? '').trim() : body.action === 'unlink' ? verb : '';
    err = await editNode(scope, src.file, from, cardBody => {
      let out = cardBody;
      if (was) out = withoutLink(out, was, to);
      if (body.action !== 'unlink') out = withLink(out, verb, to);
      return out;
    });
  } else if (body.action === 'drop') {
    const id = (body.id ?? '').trim();
    const n = scope.idx.byId.get(id);
    const mine = !!n?.defined && n.file === d.file;
    await withFileLock(abs, async () => {
      const md = await readFile(abs, 'utf8');
      // off the canvas always; out of the page only when the page is where it is written — a reference is never deleted
      // by dropping it (rule:map-drop-a-reference-keeps-the-node)
      let next = md;
      if (mine) {
        const stripped = removeCard(md, id);
        if (stripped === null) { err = bad(`${id} is not written as a card — open the page to remove it`); return; }
        next = stripped;
        // and the links this page carries to it: a card left pointing at a node that is gone is a hole in the page's
        // own knowledge. Links from other pages stay, the way they do when a page is deleted.
        for (const e of scope.idx.inc.get(id) ?? []) {
          const src = scope.idx.byId.get(e.from);
          if (!src?.defined || src.file !== d.file || e.from === id) continue;
          const card = cardText(next, e.from); if (card === null) continue;
          next = replaceCard(next, e.from, withoutLink(card, e.verb, id)) ?? next;
        }
      }
      await writeAtomic(abs, writeLayout(next, dropIn(parseLayout(md), id)));
    });
  } else return bad('unknown action');
  if (err) return err;

  const built = await rebuild(scope.product.dir);
  const p = await picture(product, project, slug);
  return NextResponse.json({ ok: true, id: created, rebuilt: built.code === 0, build: built.output.trim().split('\n').filter(l => /^ERROR/i.test(l)).slice(0, 5), ...(p ? { ...p.map, spots: p.spots } : {}) });
}

// One node's links rewritten where the node is written — the map's own card, or a card in the document a reference
// comes from, or that document's own frontmatter when the node is its page (rule:page-node-line). A node written as
// prose is refused rather than guessed at: the editor is where prose is edited.
async function editNode(scope: Scope, file: string, id: string, edit: (body: string) => string): Promise<NextResponse | null> {
  const abs = path.join(REPO_ROOT, file);
  let out: NextResponse | null = null;
  claimWrite(file, { by: 'person' });
  await withFileLock(abs, async () => {
    const md = await readFile(abs, 'utf8').catch(() => null);
    if (md === null) { out = NextResponse.json({ error: 'not_found', message: `${file} is no longer on disk` }, { status: 404 }); return; }
    const card = cardText(md, id);
    if (card !== null) {
      const next = replaceCard(md, id, edit(card));
      if (next && next !== md) await writeAtomic(abs, next);
      return;
    }
    // the page's own node: its frontmatter is its card
    const fm = md.match(/^---\n([\s\S]*?)\n---/);
    if (fm && scope.graph.modules.some(m => m.id === id && m.file === file)) {
      const next = md.replace(fm[0], `---\n${edit(fm[1]).replace(/\s+$/, '')}\n---`);
      if (next !== md) await writeAtomic(abs, next);
      return;
    }
    out = bad(`${id} is written as prose in ${file} — link it in the editor`);
  });
  return out;
}
