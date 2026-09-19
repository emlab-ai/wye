// The constitution (decision:memory.constraint-type): the approved, current constraint: blocks of a product — the
// small, stable set of rules every plan and agent action must respect. Read from the graph; nothing is stored apart.
import type { GraphData, GraphIndex, GraphNode } from './graph';
import { isCurrent, parseBody } from './graph';

export interface Constitutional { id: string; statement: string; status: string; scope: string[]; rationale?: string; file: string; line: number; owner?: string }

const textOf = (n: GraphNode) => { const rows = parseBody(n.body); return rows.find(r => r.key === 'statement')?.value ?? rows.find(r => r.key === 'text')?.value ?? n.title; };

// every defined constraint, current or not, for the view: approved and current ones first, then proposed, then ended
export function constraints(g: GraphData, idx: GraphIndex): Constitutional[] {
  return g.nodes.filter(n => n.defined && n.kind === 'constraint').map(n => {
    const out = idx.out.get(n.id) ?? [];
    return { id: n.id, statement: textOf(n), status: n.status || 'proposed', scope: out.filter(e => e.verb === 'scope').map(e => e.to), rationale: out.find(e => e.verb === 'rationale')?.to, file: n.file, line: n.line, owner: n.owner };
  }).sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
}
const rank = (c: Constitutional) => c.status === 'approved' ? 0 : c.status === 'proposed' ? 1 : 2;

// the constitution proper: approved and current
export function constitution(g: GraphData, idx: GraphIndex): Constitutional[] {
  const byId = new Map(g.nodes.map(n => [n.id, n]));
  return constraints(g, idx).filter(c => c.status === 'approved' && isCurrent(byId.get(c.id)!));
}

// the `## Constitution` section of the agent system prompt: each constraint verbatim, with its id, small by design
export function constitutionSection(g: GraphData, idx: GraphIndex): string {
  const list = constitution(g, idx);
  if (!list.length) return '';
  return `\n\n## Constitution\nThe approved constraints of this product. Every plan, change and answer respects them; a request that cannot is answered with a \`question:\` block next to the constraint, not by breaking it.\n${list.map(c => `- ${c.id} — ${c.statement.replace(/\s+/g, ' ').trim()}${c.scope.length ? ` (scope: ${c.scope.join(', ')})` : ''}`).join('\n')}`;
}
