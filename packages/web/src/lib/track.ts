import type { IndexEntry } from './doc';
import type { TrackRow } from '@/components/TrackList';

// Goals (or tasks) of a product as a tree: an item nests under the goal it is part of when that goal is of the same
// kind; everything else is a root, ordered by id.
export function trackRows(index: Record<string, IndexEntry>, kind: 'goal' | 'task'): TrackRow[] {
  const items = Object.values(index).filter(e => e.defined && e.kind === kind);
  const rows = new Map(items.map(e => [e.id, { id: e.id, title: e.title, status: e.status, target: e.target, owner: e.owner, progress: e.progress, parts: e.parts, parent: e.parent, file: e.file, children: [] as TrackRow[] } as TrackRow]));
  const roots: TrackRow[] = [];
  for (const r of rows.values()) { const p = r.parent && rows.get(r.parent); if (p && p !== r) p.children.push(r); else roots.push(r); }
  const sort = (a: TrackRow, b: TrackRow) => a.id.localeCompare(b.id, undefined, { numeric: true });
  for (const r of rows.values()) r.children.sort(sort);
  return roots.sort(sort);
}
