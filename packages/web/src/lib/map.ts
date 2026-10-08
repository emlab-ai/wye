// A map page, the pure part (decision:map.page-owns-its-nodes): a document of type:map whose cards are the nodes of
// a canvas and whose links are its edges. This file reads and writes the one thing the canvas owns — the `## Layout`
// section, a fenced block of `<id> <x>,<y>` lines with `ref` on a node that lives in another document and `open` on
// one shown as its full card
// (decision:map.layout-is-a-fenced-section) — works out what the canvas should draw, and says which verbs an edge
// between two kinds may take (decision:map.verbs-from-the-ontology). The IO is the map route.
import type { GraphData, GraphEdge, GraphIndex } from './graph';
import { HIDDEN_KINDS } from './graph';
import { PART_KINDS } from './kinds';
import { nestingMap } from './types';
import { appendCard } from './instances';

export type Spot = { id: string; x: number; y: number; ref: boolean; open: boolean };
export type MapNode = { id: string; kind: string; title: string; /** the card's `text:` — the lines after the title when a card is written on the map */ text?: string; status: string; defined: boolean; ref: boolean; x: number; y: number };
export type OffNode = { id: string; kind: string; title: string };
export type MapGraph = { nodes: MapNode[]; edges: GraphEdge[]; off: OffNode[] };

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

// What the canvas draws (decision:map.the-board-holds-what-was-put-on-it): the nodes the `## Layout` section names, in
// its order, and the edges between them. Being written on the page is not enough — a card's own parts (its when, its
// then) and anything else added to the markdown stay off the board until they are put on it, which is what `off`
// lists. A layout line whose node is gone is left out rather than drawn as a hole.
export function mapGraph(g: Pick<GraphData, 'nodes' | 'edges' | 'types'>, idx: Pick<GraphIndex, 'byId'>, file: string, mapId: string, spots: Spot[]): MapGraph {
  const nodes: MapNode[] = [];
  const here = new Set<string>();
  for (const s of spots) {
    const n = idx.byId.get(s.id);
    if (!n?.defined || here.has(n.id) || n.id === mapId) continue;
    const text = (n.body.match(/^text:\s*(.+)$/m)?.[1] ?? '').trim();
    nodes.push({ id: n.id, kind: n.kind, title: n.title, ...(text ? { text } : {}), status: n.status, defined: true, ref: n.file !== file, x: s.x, y: s.y });
    here.add(n.id);
  }
  const edges = g.edges.filter(e => !e.generated && here.has(e.from) && here.has(e.to) && e.from !== e.to);
  // the page's own cards that the board does not hold yet — a card written in the text, or one an agent added. A kind
  // that may only nest (a when, a context) is part of its card, never a card of its own.
  const nested = nestingMap(g.types ?? []);
  const off = g.nodes
    .filter(n => n.defined && n.file === file && n.id !== mapId && !here.has(n.id) && n.form !== 'block' && !HIDDEN_KINDS.has(n.kind) && !PART_KINDS.has(n.kind) && !nested[n.kind])
    .map(n => ({ id: n.id, kind: n.kind, title: n.title }));
  return { nodes, edges, off };
}

// The verbs an edge between two kinds may take (decision:map.verbs-from-the-ontology): every property of the source
// kind that points at the target's kind — or at any node — read from the type cards, so the inverse comes with it.
// `related-to` is always offered, and is what a link drawn before it is named says.
export type VerbSource = { slug: string; props?: { name: string; ref: string | null }[] };
// A verb as a person types it — "depends on", "Blocks", "is part of" — made into the one the graph takes: lowercase
// words joined by dashes. Empty when nothing is left.
export function verbSlug(text: string): string { return String(text).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
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
// where a block scalar that runs to the end of the card starts (the `key: |` or `key: >` line, at the card's key
// indentation) — -1 when the card does not end in one
function blockTail(body: string, ind: string): number {
  const lines = body.replace(/\s+$/, '').split('\n'); let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]; if (!l.trim()) continue;
    const key = l.match(/^([ \t]*-?[ \t]*)[A-Za-z][\w-]*:\s*(.*)$/);
    const atKey = key && (key[1] === ind || key[1].replace('-', ' ') === ind);
    if (!atKey) continue; // a line of the block, deeper than the keys
    if (/^[|>][+-]?\d*$/.test(key[2].trim())) start = i; // the block's own line
    break;
  }
  if (start < 0) return -1;
  return lines.slice(0, start).join('\n').length + (start > 0 ? 1 : 0);
}
// the indentation of the card's keys: the `id:` line's, with a list dash counted as a space — never the deeper
// indentation of a block scalar's lines, which is where a key appended at the end would land
function keyIndent(body: string): string {
  const lines = body.split('\n').filter(l => l.trim());
  const idLine = lines.find(l => /^[ \t]*-?[ \t]*id:/.test(l)) ?? lines[0] ?? '';
  const m = idLine.match(/^([ \t]*)(-[ \t]+)?/);
  return (m?.[1] ?? '') + (m?.[2] ? ' '.repeat(m[2].length) : '');
}
export function withLink(body: string, verb: string, id: string): string {
  const m = body.match(KEY(verb));
  if (!m) {
    const ind = keyIndent(body); const line = `${ind}${verb}: ${id}`;
    // a card that ends with a block scalar (`text: |` and its lines) would swallow a line appended after it as more
    // text, and the link would read as prose: the key goes before that block instead
    const block = blockTail(body, ind);
    if (block >= 0) return `${body.slice(0, block)}${line}\n${body.slice(block)}`;
    return `${body.replace(/\s+$/, '')}\n${line}`;
  }
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
