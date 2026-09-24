// Ontology helpers over graph.json: a node's type (its kind prefix), the extends chain, instances of a type and the
// properties a node has — declared on its type or inherited — with the values it fills in.
import { parseBody, type GraphData, type GraphNode, type TypeDef, type PropDef } from './graph';

export type { TypeDef, PropDef };
export interface NodeProp extends PropDef { value: string }

export function typeOf(g: GraphData, id: string): TypeDef | undefined { return (g.types ?? []).find(t => t.slug === id.split(':')[0]); }
export function typeBySlug(g: GraphData, slug: string): TypeDef | undefined { return (g.types ?? []).find(t => t.slug === slug); }
export function isA(g: GraphData, id: string, slug: string): boolean { if (slug === 'node') return true; const t = typeOf(g, id); return !!t && t.chain.includes('type:' + slug); }
// user-defined types: declared in a product document, not in the shipped base ontology
export function isBaseType(t: TypeDef): boolean { return !t.file || t.file.startsWith('schema/'); }
export function instancesOf(g: GraphData, slug: string): GraphNode[] {
  return g.nodes.filter(n => n.defined && n.kind !== 'type' && isA(g, n.id, slug)).sort((a, b) => a.id.localeCompare(b.id));
}
// A type that may only sit under another (decision:ontology.a-type-can-be-nested-only): a `when` belongs to a req, a
// `context` to a decision. Such a kind is never offered where a node is made from nothing — a new page, a node on a
// map, the block menu at the top of a document — and is offered under a node of a kind it nests in. `node` means any.
export type Nestable = { slug: string; nestsIn?: string[] };
export const nestsIn = (t: Nestable | undefined): string[] => t?.nestsIn ?? [];
export const isNested = (t: Nestable | undefined): boolean => nestsIn(t).length > 0;
export const rootTypes = <T extends Nestable>(types: T[]): T[] => types.filter(t => !isNested(t));
// The kinds a node of this kind may hold, in the order the types were declared.
export function nestedUnder<T extends Nestable>(types: T[], kind: string): T[] {
  if (!kind) return [];
  return types.filter(t => nestsIn(t).some(p => p === kind || p === 'node'));
}
// The same question as a map, for the client: kind → the kinds it may sit under.
export function nestingMap(types: Nestable[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const t of types) if (isNested(t)) out[t.slug] = nestsIn(t);
  return out;
}

// the root type's properties are what every node has; pages fold them away unless a node fills one in
export function isImplicit(p: PropDef): boolean { return p.from === 'type:node'; }
export function subtypesOf(g: GraphData, slug: string): TypeDef[] { return (g.types ?? []).filter(t => t.extends === 'type:' + slug); }
export function nodeProps(g: GraphData, n: GraphNode): NodeProp[] {
  const t = typeOf(g, n.id); if (!t) return [];
  const drop = new Set(n.partKeys ?? []);   // generated from the node's part children — not the card's own values
  const rows = new Map(parseBody(n.body).filter(r => !drop.has(r.key)).map(r => [r.key, r.value]));
  return t.props.map(p => ({ ...p, value: rows.get(p.name) ?? '' }));
}
// what an incoming edge with this verb is called from the target's side ('' when the verb has no declared inverse)
export function inverseLabel(g: GraphData, verb: string): string { return g.inverses?.[verb] ?? ''; }
// where a product's own types are declared: its `ontology.md` by convention, else the document that declares most of
// them ('' when the product has no types of its own yet)
export function ontologyDoc(g: GraphData): string {
  const named = g.modules.find(m => m.file.endsWith('/ontology.md')); if (named) return named.file;
  const count = new Map<string, number>();
  for (const t of g.types ?? []) if (!isBaseType(t)) count.set(t.file, (count.get(t.file) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}
