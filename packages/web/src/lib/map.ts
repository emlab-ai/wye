// A map page, the pure part (decision:map.page-owns-its-nodes): a document of type:map whose cards are the nodes of
// a canvas and whose links are its edges. This file reads and writes the one thing the canvas owns — the `## Layout`
// section, a fenced block of `<id> <x>,<y>` lines with `ref` on a node that lives in another document and `open` on
// one shown as its full card
// (decision:map.layout-is-a-fenced-section) — works out what the canvas should draw, and says which verbs an edge
// between two kinds may take (decision:map.verbs-from-the-ontology). The IO is the map route.
import type { GraphData, GraphEdge, GraphIndex } from './graph';
import { HIDDEN_KINDS } from './graph';
import { appendCard } from './instances';

export type Spot = { id: string; x: number; y: number; ref: boolean; open: boolean };
export type MapNode = { id: string; kind: string; title: string; status: string; defined: boolean; ref: boolean; x: number; y: number };
export type MapGraph = { nodes: MapNode[]; edges: GraphEdge[] };

const LINE = /^([a-z][a-z0-9-]*:[A-Za-z0-9_][A-Za-z0-9_./#-]*)\s+(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)((?:\s+(?:ref|open))*)\s*$/;
// Where the section's body starts and ends — the twin of pr-doc#sectionBody, because `$` under /m ends at the first
// line and would read one position out of a map that has many.
function layoutAt(md: string): { start: number; end: number } | null {
  const m = md.match(/^## Layout[^\n]*\n/m); if (!m || m.index === undefined) return null;
  const start = m.index + m[0].length;
  const next = md.slice(start).search(/^## /m);
  return { start, end: next === -1 ? md.length : start + next };
}

// The positions a map holds. Anything that is not a position line — the fence itself, a blank, a stray word — is
// ignored rather than guessed at.
export function parseLayout(md: string): Spot[] {
  const at = layoutAt(md); const sec = at ? md.slice(at.start, at.end) : '';
  const out: Spot[] = [];
  for (const raw of sec.split('\n')) {
    const m = raw.trim().match(LINE); if (!m) continue;
    const flags = (m[4] ?? '').split(/\s+/);
    out.push({ id: m[1], x: Number(m[2]), y: Number(m[3]), ref: flags.includes('ref'), open: flags.includes('open') });
  }
  return out;
}

// The Layout section rewritten, in the order given. The section is added when the page has none, so a map made
// before this, or by hand, gains one on the first drag.
export function writeLayout(md: string, spots: Spot[]): string {
  const body = ['```text', ...spots.map(s => `${s.id} ${Math.round(s.x)},${Math.round(s.y)}${s.ref ? ' ref' : ''}${s.open ? ' open' : ''}`), '```'].join('\n');
  const at = layoutAt(md);
  if (!at) return `${md.replace(/\s+$/, '')}\n\n## Layout\n\n${body}\n`;
  return `${md.slice(0, at.start)}\n${body}\n${at.end === md.length ? '' : '\n'}${md.slice(at.end)}`;
}

// One node's position set, keeping the rest as they are and adding it when it is new.
export function moveIn(spots: Spot[], id: string, x: number, y: number, ref = false): Spot[] {
  const at = spots.findIndex(s => s.id === id);
  if (at < 0) return [...spots, { id, x, y, ref, open: false }];
  return spots.map((s, i) => (i === at ? { ...s, x, y } : s));
}
// A node shown as its full card, or back as a pill (decision:map.a-node-opens-into-its-card) — kept beside its position,
// so a map opens as it was left.
export function openIn(spots: Spot[], id: string, open: boolean, ref = false): Spot[] {
  const at = spots.findIndex(s => s.id === id);
  if (at < 0) return [...spots, { id, x: 0, y: 0, ref, open }];
  return spots.map((s, i) => (i === at ? { ...s, open } : s));
}
export const dropIn = (spots: Spot[], id: string): Spot[] => spots.filter(s => s.id !== id);

// A new node's card added to a map page: in the cards the page already has, but always above `## Layout`, so the
// positions stay the last thing on the page and appendCard never writes a card after them.
export function addCard(md: string, card: string): string {
  const m = md.match(/^## Layout[^\n]*\n/m);
  if (!m || m.index === undefined) return appendCard(md, card);
  return `${appendCard(md.slice(0, m.index).replace(/\s+$/, ''), card).replace(/\s+$/, '')}\n\n${md.slice(m.index)}`;
}

// What the canvas draws: every node the map's document defines, plus every `ref` the layout names, with the edges
// between them. A node of the map's own document that has no position yet still appears — the canvas lays it out —
// and a `ref` whose node is gone is left out rather than drawn as a hole.
export function mapGraph(g: Pick<GraphData, 'nodes' | 'edges'>, idx: Pick<GraphIndex, 'byId'>, file: string, mapId: string, spots: Spot[]): MapGraph {
  const own = g.nodes.filter(n => n.defined && n.file === file && n.id !== mapId && !HIDDEN_KINDS.has(n.kind) && n.form !== 'block');
  const at = new Map(spots.map(s => [s.id, s]));
  const nodes: MapNode[] = own.map(n => ({ id: n.id, kind: n.kind, title: n.title, status: n.status, defined: true, ref: false, x: at.get(n.id)?.x ?? NaN, y: at.get(n.id)?.y ?? NaN }));
  const here = new Set(nodes.map(n => n.id));
  for (const s of spots) {
    if (!s.ref || here.has(s.id)) continue;
    const n = idx.byId.get(s.id); if (!n?.defined) continue;
    nodes.push({ id: n.id, kind: n.kind, title: n.title, status: n.status, defined: true, ref: true, x: s.x, y: s.y });
    here.add(n.id);
  }
  const edges = g.edges.filter(e => !e.generated && here.has(e.from) && here.has(e.to) && e.from !== e.to);
  return { nodes, edges };
}

// The verbs an edge between two kinds may take (decision:map.verbs-from-the-ontology): every property of the source
// kind that points at the target's kind — or at any node — read from the type cards, so the inverse comes with it.
// `related-to` is always offered, and is what a link drawn before it is named says.
export type VerbSource = { slug: string; props?: { name: string; ref: string | null }[] };
export function verbsFor(types: VerbSource[] | undefined, fromKind: string, toKind: string): string[] {
  const t = (types ?? []).find(x => x.slug === fromKind);
  const chain = new Set([toKind, 'node']);
  const own = (t?.props ?? []).filter(p => p.ref && (chain.has(p.ref.replace(/^type:/, '')) || p.ref === 'node')).map(p => p.name);
  return [...new Set([...own, 'related-to'])];
}

// A verb written on a card, which may be the card as it sits on the page (`- id: …` and its indented keys) or a plain
// block of keys: `<verb>: <id>` for the first link, appended to the list when the property is already there. The
// indentation of the card's own keys is kept, so a card edited here reads like the ones beside it.
const KEY = (verb: string) => new RegExp(`^([ \\t]*)${verb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:[ \\t]*(.*)$`, 'm');
const items = (raw: string) => raw.trim().replace(/^\[|\]$/g, '').split(/[\s,]+/).filter(Boolean);
function keyIndent(body: string): string {
  const lines = body.split('\n').filter(l => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) { const m = lines[i].match(/^([ \t]+)\S/); if (m) return m[1]; }
  return /^-\s/.test(lines[0] ?? '') ? '  ' : '';
}
export function withLink(body: string, verb: string, id: string): string {
  const m = body.match(KEY(verb));
  if (!m) return `${body.replace(/\s+$/, '')}\n${keyIndent(body)}${verb}: ${id}`;
  const cur = items(m[2]);
  if (cur.includes(id)) return body;
  return body.replace(KEY(verb), `${m[1]}${verb}: [${[...cur, id].join(', ')}]`);
}
// The same link taken off a card, and the property with it when it held nothing else.
export function withoutLink(body: string, verb: string, id: string): string {
  const m = body.match(KEY(verb)); if (!m) return body;
  const left = items(m[2]).filter(x => x !== id);
  if (!left.length) return body.replace(new RegExp(`^[ \\t]*${verb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:[ \\t]*.*\\n?`, 'm'), '');
  return body.replace(KEY(verb), `${m[1]}${verb}: ${left.length === 1 ? left[0] : `[${left.join(', ')}]`}`);
}
