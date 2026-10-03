// The assistant's knowledge, the IO part: the ea product's nodes read into an EaModel (ea/model), each commitment's and
// project's content read from its document (the moves and updates written under it), and the director from the
// product card (`director: person:<p>.<slug>`).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Scope } from '../scope';
import type { GraphNode } from '../graph';
import { REPO_ROOT } from '../products';
import { readContent } from '../node-content';
import { toPerson, toProject, toCommitment, toMeeting, toDecision, toRisk, type EaModel } from './model';

// The lines under a node in its document; [] when it has none (or no document).
export async function contentLines(node: GraphNode, files: Map<string, string> = new Map()): Promise<string[]> {
  if (!node.file || !node.defined) return [];
  if (!files.has(node.file)) { try { files.set(node.file, await readFile(path.join(REPO_ROOT, node.file), 'utf8')); } catch { files.set(node.file, ''); } }
  const c = readContent(files.get(node.file)!, node.id, node.line, node.form ?? 'yaml');
  return c ? c.split('\n').filter(l => l.trim()) : [];
}

export async function readModel(scope: Scope): Promise<EaModel> {
  const nodes = scope.graph.nodes.filter(n => n.defined && !n.archived);
  const of = (k: string) => nodes.filter(n => n.kind === k);
  const files = new Map<string, string>();
  return {
    people: of('person').map(toPerson),
    projects: await Promise.all(of('project').map(async n => toProject(n, await contentLines(n, files)))),
    commitments: await Promise.all(of('commitment').map(async n => toCommitment(n, await contentLines(n, files)))),
    meetings: of('meeting').map(toMeeting),
    decisions: of('decision').map(toDecision),
    risks: of('risk').map(toRisk),
  };
}

export const directorOf = (scope: Scope) => (scope.product.meta.settings.director ?? '').trim();
// The id prefix the product's blocks carry (`ea` in commitment:ea.x): the director's, else the first person's or
// project's, else the product slug.
export function idPrefix(scope: Scope): string {
  const from = (id: string) => { const s = id.slice(id.indexOf(':') + 1); return s.includes('.') ? s.slice(0, s.indexOf('.')) : ''; };
  const d = directorOf(scope); if (d && from(d)) return from(d);
  const n = scope.graph.nodes.find(x => x.defined && ['person', 'project', 'commitment', 'meeting'].includes(x.kind) && from(x.id));
  return n ? from(n.id) : scope.product.slug;
}
