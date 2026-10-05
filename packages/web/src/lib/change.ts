// The app's change event as a page hears it (`wf:change`, relayed from the server's events by LiveRefresh): which
// kinds of things changed on disk and, for the graph, what in it (decision:wf2.change-names-what-changed). Each
// component that follows the graph asks one of these instead of fetching again on every build — a document being
// typed in rebuilds the graph several times a minute and changes almost nothing a card or a list shows.
import type { GraphDelta } from './graph-delta';

export interface ChangeDetail { kinds: string[]; files: string[]; graph?: GraphDelta }
export const detailOf = (e: Event): ChangeDetail => (e as CustomEvent<ChangeDetail>).detail ?? { kinds: [], files: [] };

// The node may show something else now: its record, its content or its relations changed — or it is not known what did.
export function nodeChanged(d: ChangeDetail, id: string): boolean {
  if (!d.kinds?.includes('graph')) return false;
  return !d.graph || d.graph.ids === null || d.graph.ids.includes(id);
}
// A list of nodes (a view, a table, the node index) may show something else now.
export function knowledgeChanged(d: ChangeDetail): boolean {
  if (!d.kinds?.includes('graph')) return false;
  return !d.graph || d.graph.knowledge;
}
