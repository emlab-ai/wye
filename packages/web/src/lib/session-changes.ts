// A session's changes as one list: its block attribution joined with the current graph (does the block still
// exist, what status is it in now), grouped per document — derived, never stored (req:wf2.sessions.changes-page).
import type { GraphData } from './graph';
import type { BlockChange, Session } from './session-types';

export type ChangeRow = BlockChange & { kind: string; status: string; exists: boolean; text: string };
export type ChangeGroup = { doc: string; rows: ChangeRow[]; prose: ChangeRow[] };

export function sessionChanges(s: Session, g: GraphData): ChangeGroup[] {
  const byId = new Map(g.nodes.filter(n => n.defined).map(n => [n.id, n]));
  const blocks = s.artifacts?.blocks ?? [];
  // nodes changed through the API before block attribution existed show up as changed
  const legacy = (s.artifacts?.nodes ?? []).filter(id => !blocks.some(b => b.id === id)).map((id): BlockChange => { const n = byId.get(id); return { id, change: 'changed', doc: n ? `module:${n.file.split('/').pop()?.replace(/\.md$/, '')}` : '', title: n?.title ?? id, at: s.updatedAt }; });
  const rows = [...blocks, ...legacy].map((b): ChangeRow => { const n = byId.get(b.id); return { ...b, kind: b.id.split(':')[0], status: n?.status ?? '', exists: !!n, text: n?.title ?? b.title }; });
  const m = new Map<string, ChangeGroup>();
  for (const r of rows.sort((a, b) => a.at.localeCompare(b.at))) {
    const k = r.doc || '—';
    if (!m.has(k)) m.set(k, { doc: k, rows: [], prose: [] });
    (r.kind === 'block' ? m.get(k)!.prose : m.get(k)!.rows).push(r);
  }
  return [...m.values()].sort((a, b) => (b.rows.length + b.prose.length) - (a.rows.length + a.prose.length) || a.doc.localeCompare(b.doc));
}
export function changeCounts(groups: ChangeGroup[]): { added: number; changed: number; removed: number; prose: number } {
  const c = { added: 0, changed: 0, removed: 0, prose: 0 };
  for (const gr of groups) { for (const r of gr.rows) c[r.change]++; c.prose += gr.prose.length; }
  return c;
}
export function countsLine(c: { added: number; changed: number; removed: number; prose: number }): string {
  return [c.added && `+${c.added} added`, c.changed && `${c.changed} changed`, c.removed && `${c.removed} removed`, c.prose && `${c.prose} paragraph${c.prose === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
}
